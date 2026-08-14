/**
 * dsh-plugins-market, node half.
 *
 * Host plugin body: registers the market data/install API on the web server
 * under the /market-api prefix. Every route is loopback-trusted (same rules
 * as the client-connection /api channel: loopback Host, no cross-site
 * sec-fetch-site, Origin must equal Host when present), so a remote website
 * cannot CSRF the local install endpoint.
 *
 * Data pipeline (in-memory, 10-minute cache):
 *   GitHub Search API crawl of topic:dsh-plugin -> noise/catalog filtering
 *   -> enrich with curated-marks and compatibility verdicts from two trusted
 *   community sources -> sort/filter/slice.
 * Install: verify the repo declares dsh.bundle.patch in package.json, then
 * run `dsh plugin add` via node:child_process; the client-side confirm dialog
 * plus the loopback trust check are the user gates (a real bundle's host
 * context has no approval/agent services).
 */

import { spawn } from 'node:child_process'

export const inject = ['webServer'];

export function apply(ctx) {
  const BLACKLIST = new Set(['titanwings/colleague-skill'])
  const EXCLUDE = new Set(['deepseek-ai/deepseek-harness'])
  const RADAR_STATUS_KEEP = { '兼容': true, '需适配': true, '关注': true, '已删除': true }
  const PAGE_SLEEP = 3500
  const CACHE_TTL = 600000
  let lastHit = 0
  let index = null
  let crawlPromise = null
  const bundleCheckCache = new Map()

  const SOURCE_FILES = [
    { kind: 'radarTable', owner: 'AdamPlatin123', repo: 'awesome-dsh-plugins', path: 'README.md' },
    { kind: 'linkList', owner: '0xsline', repo: 'awesome-deepseek-harness', path: 'README.md' },
  ]

  function sleep(ms) {
    return new Promise((resolve) => { setTimeout(resolve, ms) })
  }

  async function fetchRaw(url, headers, maxBytes) {
    try {
      const controller = new AbortController()
      const t = setTimeout(() => controller.abort(), 25000)
      const res = await fetch(url, { signal: controller.signal, redirect: 'follow', headers })
      clearTimeout(t)
      const text = await res.text()
      if (text.length > maxBytes) return { status: res.status, text: null, error: '响应超限' }
      return { status: res.status, text }
    } catch (err) {
      return { status: null, text: null, error: String(err && err.message || err) }
    }
  }

  async function fetchGitHubFile(owner, repo, path, maxBytes) {
    const got = await fetchRaw(
      'https://raw.githubusercontent.com/' + owner + '/' + repo + '/HEAD/' + path,
      { 'User-Agent': 'dsh-plugins-market' },
      maxBytes || 4000000,
    )
    if (got.status === 200 && got.text !== null) return got.text
    const apiGot = await fetchRaw(
      'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + path,
      { 'User-Agent': 'dsh-plugins-market', 'Accept': 'application/vnd.github.raw+json' },
      maxBytes || 4000000,
    )
    if (apiGot.status !== 200 || apiGot.text === null) return null
    try {
      const parsed = JSON.parse(apiGot.text)
      if (parsed && typeof parsed.content === 'string') {
        return Buffer.from(String(parsed.content).replace(/\s+/g, ''), 'base64').toString('utf8')
      }
    } catch (err) { /* 不是 JSON，视为 raw 文本 */ }
    return apiGot.text
  }

  async function githubPage(page) {
    const url = 'https://api.github.com/search/repositories?q=' + encodeURIComponent('topic:dsh-plugin') +
      '&sort=stars&order=desc&per_page=100&page=' + page
    const wait = lastHit + PAGE_SLEEP - Date.now()
    if (wait > 0) await sleep(wait)
    lastHit = Date.now()
    let lastErr = '未知错误'
    for (let attempt = 1; attempt <= 3; attempt++) {
      const got = await fetchRaw(url, { 'User-Agent': 'dsh-plugins-market', 'Accept': 'application/vnd.github+json' }, 3000000)
      if (got.status === 200 && got.text !== null) {
        const data = JSON.parse(got.text)
        if (data && data.message && !data.items) throw new Error('GitHub API: ' + data.message)
        return data
      }
      if (got.status === 403 || got.status === 429) {
        lastErr = 'HTTP ' + got.status + '（GitHub 搜索限流）'
        console.log('[market] page ' + page + ' rate-limited, waiting 65s (attempt ' + attempt + '/3)')
        await sleep(65000)
      } else if (got.status !== null) {
        lastErr = 'HTTP ' + got.status
        await sleep(5000)
      } else {
        lastErr = got.error || '网络不可达'
        await sleep(5000)
      }
    }
    throw new Error('GitHub 请求失败: ' + lastErr)
  }

  function looksPlugin(r, owner) {
    if (owner === 'deepseek-ai') return true
    const name = String(r.full_name || '').toLowerCase()
    const desc = String(r.description || '').toLowerCase()
    const topics = Array.isArray(r.topics) ? r.topics.map((t) => String(t).toLowerCase()) : []
    if (name.indexOf('dsh') !== -1) return true
    if (topics.indexOf('cordis') !== -1) return true
    /* 描述必须把 DSH 框定为宿主（"for/of DeepSeek Harness"），而不是
       "integrates DeepSeek Harness" / "支持 deepseek harness 插件" 这类
       蹭话题大仓库的集成/支持式表述。 */
    if (/(for|of)\s+(deepseek[- ]harness|dsh)/.test(desc)) return true
    if (/cordis/.test(desc) && /(插件|plugin|bundle)/.test(desc)) return true
    return false
  }

  function isCatalogSource(r) {
    const n = String(r.full_name || '').toLowerCase()
    return n.indexOf('awesome') !== -1 && (n.indexOf('dsh') !== -1 || n.indexOf('harness') !== -1)
  }

  function slim(r) {
    const owner = (r.owner && r.owner.login) || ''
    const isOfficial = owner === 'deepseek-ai'
    const isPlugin = looksPlugin(r, owner)
    return {
      id: r.id,
      full_name: r.full_name,
      html_url: r.html_url,
      description: r.description || '',
      language: r.language || '',
      stars: r.stargazers_count || 0,
      forks: r.forks_count || 0,
      created_at: r.created_at || '',
      pushed_at: r.pushed_at || '',
      archived: !!r.archived,
      is_fork: !!r.fork,
      is_official: isOfficial,
      is_plugin: isPlugin,
      curated: false,
      radar_status: '',
      topics: Array.isArray(r.topics) ? r.topics.slice(0, 8) : [],
    }
  }

  function parseRadarTable(text) {
    const map = new Map()
    const re = /\|\s*\[([^\]]+)\]\([^)]*\)\s*\|\s*[^|]*\s*\|\s*([^|\n]+?)\s*\|/g
    let m
    while ((m = re.exec(text)) !== null) {
      let name = m[1].trim().toLowerCase()
      const slash = name.lastIndexOf('/')
      if (slash !== -1) name = name.slice(slash + 1)
      const status = m[2].trim()
      if (name && status && RADAR_STATUS_KEEP[status] && !map.has(name)) map.set(name, status)
    }
    return map
  }

  function parseLinkList(text) {
    const full = new Set()
    const names = new Set()
    const re = /\[[^\]]*\]\(https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\)/g
    let m
    while ((m = re.exec(text)) !== null) {
      const owner = m[1]
      const repo = m[2]
      if (owner === 'topics' || owner === 'orgs' || repo === 'issues' || repo === 'discussions') continue
      full.add((owner + '/' + repo).toLowerCase())
      names.add(repo.toLowerCase())
    }
    return { full, names }
  }

  async function enrich(repos) {
    const radarStatus = new Map()
    const curatedFull = new Set()
    const curatedNames = new Set()
    for (const src of SOURCE_FILES) {
      const text = await fetchGitHubFile(src.owner, src.repo, src.path, 4000000)
      if (text === null) {
        console.log('[market] source fetch failed: ' + src.owner + '/' + src.repo + '/' + src.path)
        continue
      }
      if (src.kind === 'radarTable') {
        const map = parseRadarTable(text)
        for (const entry of map) radarStatus.set(entry[0], entry[1])
      } else {
        const parsed = parseLinkList(text)
        for (const f of parsed.full) curatedFull.add(f)
        for (const n of parsed.names) curatedNames.add(n)
      }
    }
    let curatedCount = 0
    let radarCount = 0
    for (const r of repos) {
      const name = r.full_name.slice(r.full_name.indexOf('/') + 1).toLowerCase()
      const st = radarStatus.get(name)
      if (st) { r.radar_status = st; radarCount++ }
      if (curatedFull.has(r.full_name.toLowerCase()) || curatedNames.has(name)) { r.curated = true; curatedCount++ }
    }
    console.log('[market] enriched: curated ' + curatedCount + ', radar-verdict ' + radarCount)
  }

  async function crawl() {
    if (index && Date.now() - index.ts < CACHE_TTL) return index
    if (crawlPromise) return crawlPromise
    console.log('[market] crawling topic:dsh-plugin ...')
    crawlPromise = (async () => {
      const first = await githubPage(1)
      const total = first.total_count || 0
      const pages = Math.min(Math.max(1, Math.ceil(total / 100)), 10)
      const seen = new Map()
      const add = (items) => { for (const r of items || []) seen.set(r.id, slim(r)) }
      add(first.items)
      for (let p = 2; p <= pages; p++) add((await githubPage(p)).items || [])
      const repos = Array.from(seen.values())
      await enrich(repos)
      index = { ts: Date.now(), fetchedAt: new Date().toISOString(), repos }
      console.log('[market] crawled ' + repos.length + ' repos')
      return index
    })()
    try { return await crawlPromise } finally { crawlPromise = null }
  }

  async function checkBundle(fullName) {
    if (bundleCheckCache.has(fullName)) return bundleCheckCache.get(fullName)
    const slash = fullName.indexOf('/')
    const owner = fullName.slice(0, slash)
    const repo = fullName.slice(slash + 1)
    const text = await fetchGitHubFile(owner, repo, 'package.json', 200000)
    let verdict = { exists: false, bundle: false, name: null, reason: '未找到 package.json（fetch 失败或非 npm 仓库）' }
    if (text !== null) {
      verdict.exists = true
      try {
        const pkg = JSON.parse(text)
        verdict.bundle = !!(pkg && pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch)
        verdict.name = (pkg && pkg.name) || null
        if (!verdict.bundle) verdict.reason = 'package.json 缺少 dsh.bundle.patch 声明，不是可安装的 dsh 插件'
      } catch (err) {
        verdict.reason = 'package.json 解析失败'
      }
    }
    bundleCheckCache.set(fullName, verdict)
    return verdict
  }

  async function doInstall(args) {
    args = args || {}
    const spec = String(args.spec || '').trim()
    const kind = args.kind === 'github' ? 'github' : 'npm'
    const profile = /^[a-z0-9-]{1,32}$/.test(String(args.profile || '')) ? String(args.profile) : 'web'
    const allowBuildsWarning = 'github 源安装会在本机执行该仓库的 prepare 安装脚本（pnpm 默认拦截，需在 profile 的 pnpm-workspace.yaml 中允许该包构建：allowBuilds）。请确认你信任该仓库及其脚本。'
    if (kind === 'github') {
      if (!/^github:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(spec)) return { ok: false, error: '无效的 github 源: ' + spec }
      const check = await checkBundle(spec.slice(7))
      if (!check.exists || !check.bundle) {
        return { ok: false, not_installable: true, error: '该仓库不是可安装的 dsh 插件：' + check.reason + '。市场卡片仅供浏览参考。' }
      }
      if (!args.confirmed) {
        return { ok: false, need_confirm: true, warning: allowBuildsWarning, command: 'dsh plugin --profile ' + profile + ' add ' + spec }
      }
    } else {
      if (!/^(@[a-z0-9-][a-z0-9-_.~]*\/)?[a-z0-9-][a-z0-9-_.~]*$/.test(spec)) return { ok: false, error: '无效的 npm 包名: ' + spec }
    }
    const command = 'dsh plugin --profile ' + profile + ' add ' + spec
    if (args.dry_run) return { ok: true, dry_run: true, command, profile, kind }
    console.log('[market] install: ' + command)

    const run = (cmd, cmdArgs) => new Promise((resolve) => {
      const child = spawn(cmd, cmdArgs, { stdio: ['ignore', 'pipe', 'pipe'] })
      let stdout = ''
      let stderr = ''
      let timedOut = false
      const t = setTimeout(() => { timedOut = true; child.kill('SIGKILL') }, 240000)
      child.stdout.on('data', (c) => { stdout += c.toString('utf8') })
      child.stderr.on('data', (c) => { stderr += c.toString('utf8') })
      child.on('error', (err) => { clearTimeout(t); resolve({ spawnError: err, stdout, stderr, timedOut }) })
      child.on('close', (code, signal) => { clearTimeout(t); resolve({ code, signal, stdout, stderr, timedOut }) })
    })

    let out = await run('dsh', ['plugin', '--profile', profile, 'add', spec])
    if (out.spawnError && out.spawnError.code === 'ENOENT') {
      out = await run('/opt/nodejs24/bin/dsh', ['plugin', '--profile', profile, 'add', spec])
    }
    if (out.spawnError && out.spawnError.code !== 'ENOENT') {
      return { ok: false, error: '执行失败: ' + String(out.spawnError.message || out.spawnError) }
    }
    return {
      ok: out.code === 0,
      exit_code: out.code === null ? null : out.code,
      timed_out: out.timedOut,
      stdout_tail: out.stdout.slice(-4000),
      stderr_tail: out.stderr.slice(-2000),
      need_restart: true,
      command,
    }
  }

  function header(headers, name) {
    const value = headers[name]
    return Array.isArray(value) ? value[0] : value
  }

  function isLoopbackHostname(hostname) {
    if (hostname === 'localhost' || hostname === '::1') return true
    if (hostname.startsWith('127.')) return true
    return false
  }

  function isTrustedApiRequest(req) {
    const host = header(req.headers, 'host')
    if (host === undefined) return false
    let hostUrl
    try { hostUrl = new URL('http://' + host) } catch (err) { return false }
    if (!isLoopbackHostname(hostUrl.hostname)) return false
    if (header(req.headers, 'sec-fetch-site') === 'cross-site') return false
    const origin = header(req.headers, 'origin')
    if (origin === undefined) return true
    try { return new URL(origin).host === hostUrl.host } catch (err) { return false }
  }

  function readBody(req, limit) {
    return new Promise((resolve, reject) => {
      let size = 0
      const chunks = []
      req.on('data', (chunk) => {
        size += chunk.length
        if (size > limit) {
          reject(new Error('body too large'))
          req.destroy()
          return
        }
        chunks.push(chunk)
      })
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      req.on('error', reject)
    })
  }

  function sendJson(res, code, obj) {
    const body = JSON.stringify(obj)
    res.writeHead(code, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    })
    res.end(body)
  }

  async function handle(req, res) {
    if (!isTrustedApiRequest(req)) {
      res.writeHead(403)
      res.end('forbidden')
      return
    }
    let url
    try { url = new URL(req.url, 'http://localhost') } catch (err) {
      res.writeHead(400)
      res.end('bad request')
      return
    }
    const pathname = url.pathname

    if (pathname === '/market-api/meta' && req.method === 'GET') {
      try {
        const idx = await crawl()
        sendJson(res, 200, { ok: true, total: idx.repos.length, fetched_at: idx.fetchedAt })
      } catch (err) {
        sendJson(res, 500, { ok: false, error: String(err && err.message || err) })
      }
      return
    }

    if (pathname === '/market-api/refresh' && req.method === 'GET') {
      index = null
      try {
        const idx = await crawl()
        sendJson(res, 200, { ok: true, total: idx.repos.length, fetched_at: idx.fetchedAt })
      } catch (err) {
        sendJson(res, 500, { ok: false, error: String(err && err.message || err) })
      }
      return
    }

    if (pathname === '/market-api/search' && req.method === 'GET') {
      const sort = url.searchParams.get('sort') === 'created' || url.searchParams.get('sort') === 'pushed' ? url.searchParams.get('sort') : 'stars'
      const order = url.searchParams.get('order') === 'asc' ? 1 : -1
      const page = Math.max(1, Math.floor(Number(url.searchParams.get('page')) || 1))
      const perPage = Math.min(100, Math.max(1, Math.floor(Number(url.searchParams.get('per_page')) || 30)))
      const q = String(url.searchParams.get('q') || '').trim().slice(0, 200).toLowerCase()
      const language = String(url.searchParams.get('language') || '').trim().slice(0, 40)
      let idx
      try {
        idx = await crawl()
      } catch (err) {
        sendJson(res, 500, { ok: false, error: String(err && err.message || err) })
        return
      }
      const clean = idx.repos.filter((r) => !BLACKLIST.has(r.full_name) && !EXCLUDE.has(r.full_name) && !isCatalogSource(r))
      const plugins = clean.filter((r) => r.is_plugin)
      const noiseCount = clean.length - plugins.length
      console.log('[market] hidden noise repos: ' + noiseCount)
      let repos = plugins
      if (language) repos = repos.filter((r) => r.language === language)
      if (q) repos = repos.filter((r) => (r.full_name + '\n' + r.description).toLowerCase().indexOf(q) !== -1)
      const key = sort === 'created' ? 'created_at' : sort === 'pushed' ? 'pushed_at' : 'stars'
      repos = repos.slice().sort((a, b) => {
        const va = a[key]
        const vb = b[key]
        if (va === vb) return 0
        if (typeof va === 'number') return (va - vb) * order
        return (va < vb ? -1 : 1) * order
      })
      const langCount = new Map()
      for (const r of clean) {
        if (r.language) langCount.set(r.language, (langCount.get(r.language) || 0) + 1)
      }
      const languages = Array.from(langCount.entries()).sort((x, y) => y[1] - x[1]).slice(0, 30).map((x) => x[0])
      const total = repos.length
      const start = (page - 1) * perPage
      sendJson(res, 200, {
        ok: true,
        total,
        plugin_total: plugins.length,
        curated_count: plugins.filter((r) => r.curated).length,
        page,
        per_page: perPage,
        fetched_at: idx.fetchedAt,
        repos: repos.slice(start, start + perPage),
        languages,
      })
      return
    }

    if (pathname === '/market-api/install' && req.method === 'POST') {
      let body
      try {
        body = await readBody(req, 65536)
      } catch (err) {
        sendJson(res, 400, { ok: false, error: String(err && err.message || err) })
        return
      }
      let args
      try {
        args = JSON.parse(body || '{}')
      } catch (err) {
        sendJson(res, 400, { ok: false, error: 'JSON 解析失败' })
        return
      }
      try {
        sendJson(res, 200, await doInstall(args))
      } catch (err) {
        sendJson(res, 500, { ok: false, error: String(err && err.message || err) })
      }
      return
    }

    res.writeHead(404)
    res.end('not found')
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/market-api',
    handler: handle,
  }))
  console.log('[market] /market-api routes registered')
}
