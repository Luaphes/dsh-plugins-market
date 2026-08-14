/**
 * dsh-market, host half — dynamic-plugin source form.
 *
 * 当前运行形态：dsh Web UI 的动态 Cordis 插件（会话级、临时）。
 * 本文件为动态插件形态源码，apply 内直接使用动态运行时内建 `harness`
 * （Package 私有 RPC 注册）。持久化 npm bundle 适配
 * （harness → api-gateway/Remote seam）进行中，见仓库 Roadmap。
 *
 * 数据链路：GitHub Search API 全量拉取 topic:dsh-plugin → 噪音过滤 →
 * 合并两个可信源的内容信号（精选收录 / 兼容性判定）→ 内存缓存 10 分钟；
 * 安装：先校验 package.json 的 dsh.bundle.patch 声明，再经确认弹窗 +
 * 审批（若在 turn 内）执行 `dsh plugin add`。
 */

export default {
  apply(ctx) {
    const web = ctx.get('web')
    const shell = ctx.get('shell')
    const approval = ctx.get('approval')
    const agents = ctx.get('agents')
    const timer = ctx.get('timer')

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
      { kind: 'linkList', owner: '0xsline', repo: 'awesome-deepseek-harness', path: 'CATALOG.md' },
    ]

    function sleep(ms) {
      return new Promise((resolve) => {
        if (timer && timer.timeout) { timer.timeout(() => resolve(), ms) } else { resolve() }
      })
    }

    async function fetchText(url, maxBytes) {
      let text = null
      if (web) {
        try {
          const res = await web.fetch({ url })
          if (res && res.statusCode === 200 && res.body && res.body.content && !res.truncated) text = res.body.content
        } catch (err) { /* 降级到 curl */ }
      }
      if (text === null && shell) {
        const spec = shell.resolve({
          command: 'curl -fsSL --max-time 20 "' + url + '"',
          timeoutMs: 25000,
          stdoutMaxBytes: maxBytes || 3000000,
        })
        const out = await shell.run(spec)
        if (out.exitCode === 0) text = out.stdout.text
      }
      return text
    }

    async function fetchGitHubFile(owner, repo, path, maxBytes) {
      const rawUrl = 'https://raw.githubusercontent.com/' + owner + '/' + repo + '/HEAD/' + path
      const raw = await fetchText(rawUrl, maxBytes || 4000000)
      if (raw !== null) return raw
      const apiUrl = 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + path
      let body = null
      if (web) {
        try {
          const res = await web.fetch({ url: apiUrl })
          if (res && res.statusCode === 200 && res.body && res.body.content && !res.truncated) body = res.body.content
        } catch (err) { /* 降级到 curl */ }
      }
      if (body === null && shell) {
        const spec = shell.resolve({
          command: 'curl -fsSL --max-time 20 -H "Accept: application/vnd.github.raw+json" "' + apiUrl + '"',
          timeoutMs: 25000,
          stdoutMaxBytes: maxBytes || 4000000,
        })
        const out = await shell.run(spec)
        if (out.exitCode === 0) body = out.stdout.text
      }
      if (body === null) return null
      try {
        const parsed = JSON.parse(body)
        if (parsed && typeof parsed.content === 'string') {
          return atob(String(parsed.content).replace(/\s+/g, ''))
        }
      } catch (err) { /* 不是 JSON，视为 raw 文本 */ }
      return body
    }

    async function githubPage(page) {
      const url = 'https://api.github.com/search/repositories?q=' + encodeURIComponent('topic:dsh-plugin') +
        '&sort=stars&order=desc&per_page=100&page=' + page
      const wait = lastHit + PAGE_SLEEP - Date.now()
      if (wait > 0) await sleep(wait)
      lastHit = Date.now()
      const text = await fetchText(url, 3000000)
      if (text === null) throw new Error('GitHub 请求失败（web/shell 均不可用）')
      const data = JSON.parse(text)
      if (data && data.message && !data.items) throw new Error('GitHub API: ' + data.message)
      return data
    }

    function looksPlugin(r, owner) {
      if (owner === 'deepseek-ai') return true
      const name = String(r.full_name || '').toLowerCase()
      const desc = String(r.description || '').toLowerCase()
      const topics = Array.isArray(r.topics) ? r.topics.map((t) => String(t).toLowerCase()) : []
      if (name.indexOf('dsh') !== -1) return true
      if (/(dsh|deepseek[- ]harness|cordis)/.test(desc)) return true
      if (topics.indexOf('cordis') !== -1) return true
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

    harness.handle('market.meta', async () => {
      try {
        const idx = await crawl()
        return { ok: true, total: idx.repos.length, fetched_at: idx.fetchedAt }
      } catch (err) {
        return { ok: false, error: String(err && err.message || err) }
      }
    })

    harness.handle('market.refresh', async () => {
      index = null
      try {
        const idx = await crawl()
        return { ok: true, total: idx.repos.length, fetched_at: idx.fetchedAt }
      } catch (err) {
        return { ok: false, error: String(err && err.message || err) }
      }
    })

    harness.handle('market.search', async (args) => {
      args = args || {}
      const sort = args.sort === 'created' || args.sort === 'pushed' ? args.sort : 'stars'
      const order = args.order === 'asc' ? 1 : -1
      const page = Math.max(1, Math.floor(Number(args.page) || 1))
      const perPage = Math.min(100, Math.max(1, Math.floor(Number(args.per_page) || 30)))
      const q = String(args.q || '').trim().slice(0, 200).toLowerCase()
      const language = String(args.language || '').trim().slice(0, 40)
      let idx
      try {
        idx = await crawl()
      } catch (err) {
        return { ok: false, error: String(err && err.message || err) }
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
      return {
        ok: true,
        total,
        plugin_total: plugins.length,
        curated_count: plugins.filter((r) => r.curated).length,
        page,
        per_page: perPage,
        fetched_at: idx.fetchedAt,
        repos: repos.slice(start, start + perPage),
        languages,
      }
    })

    harness.handle('market.install', async (args) => {
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
      if (approval && agents) {
        try {
          const agent = agents.currentInitiator()
          if (agent) {
            const outcome = await approval.request({
              agent,
              toolName: 'market-install',
              reason: command + (kind === 'github' ? '\n安全提示: ' + allowBuildsWarning : ''),
            })
            if (outcome !== 'allowed-once') return { ok: false, error: '审批结果: ' + outcome }
          }
        } catch (err) {
          /* 无开放 turn（从设置面板点击）时审批服务不可用；以客户端确认弹窗为准 */
        }
      }
      if (!shell) return { ok: false, error: 'shell 服务不可用' }
      console.log('[market] install: ' + command)
      try {
        const spec2 = shell.resolve({ command, timeoutMs: 240000, stdoutMaxBytes: 65536 })
        const out = await shell.run(spec2)
        return {
          ok: out.exitCode === 0,
          exit_code: out.exitCode,
          timed_out: out.timedOut,
          stdout_tail: String(out.stdout && out.stdout.text || '').slice(-4000),
          stderr_tail: String(out.stderr && out.stderr.text || '').slice(-2000),
          need_restart: true,
          command,
        }
      } catch (err) {
        return { ok: false, error: '执行失败: ' + String(err && err.message || err) }
      }
    })
  },
}
