/**
 * dsh-plugins-market, browser half.
 *
 * Hand-written ModuleLoader bundle (no build step): registers one list entry
 * into the `settings.plugins.tab` slot — the market panel inside the Plugins
 * settings area. All data goes through same-origin fetch to the node half's
 * /market-api routes; the browser never talks to GitHub directly.
 *
 * Adapted from the dynamic-plugin form in src/client.js:
 *   - styles.insert  ->  <style> element owned by the plugin fiber
 *   - host.call      ->  window.fetch('/market-api/...')
 *   - timer.debounce ->  native setTimeout
 */

window.__ModuleLoader__.load({
  id: "dsh-plugins-market",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var React = require("react");

    var CSS = `
.mkt-panel { display: flex; flex-direction: column; gap: 12px; padding: 4px 0 24px; }
.mkt-title { font-size: 15px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.mkt-sub { color: var(--dsw-alias-label-secondary); font-size: 12px; }
.mkt-tabrow { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
.mkt-sortgroup { display: inline-flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.mkt-sortlabel { color: var(--dsw-alias-label-secondary); font-size: 12px; }
.mkt-tab { background: transparent; border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary); border-radius: 6px; padding: 4px 10px; font-size: 12px; cursor: pointer; }
.mkt-tab:hover { color: var(--dsw-alias-label-primary); }
.mkt-tab.active { border-color: var(--dsw-alias-state-business-primary); color: var(--dsw-alias-state-business-primary); }
.mkt-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.mkt-input { flex: 1; min-width: 140px; background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-primary); border-radius: 6px; padding: 6px 8px; font-size: 12px; }
.mkt-input:focus { border-color: var(--dsw-alias-brand-primary); outline: none; }
.mkt-select { background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-primary); border-radius: 6px; padding: 5px 8px; font-size: 12px; max-width: 160px; cursor: pointer; }
.mkt-grid { display: grid; grid-template-columns: 1fr; gap: 8px; }
@media (min-width: 760px) { .mkt-grid { grid-template-columns: 1fr 1fr; } }
.mkt-card { background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; }
.mkt-name { font-size: 13px; font-weight: 600; color: var(--dsw-alias-label-primary); text-decoration: none; word-break: break-all; }
.mkt-name:hover { text-decoration: underline; }
.mkt-badge { display: inline-block; font-size: 10px; line-height: 1; padding: 2px 5px; border-radius: 4px; background: var(--dsw-alias-button-primary-fill, var(--dsw-alias-label-primary)); color: var(--dsw-alias-label-primary-foreground, var(--dsw-alias-bg-layer-3)); margin-left: 6px; vertical-align: 1px; }
.mkt-badge-curated { display: inline-block; font-size: 10px; line-height: 1; padding: 2px 5px; border-radius: 4px; border: 1px solid var(--dsw-alias-state-business-primary); color: var(--dsw-alias-state-business-primary); background: transparent; margin-left: 6px; vertical-align: 1px; }
.mkt-st { display: inline-block; font-size: 10px; line-height: 1; padding: 2px 5px; border-radius: 4px; border: 1px solid; background: transparent; margin-left: 6px; vertical-align: 1px; }
.mkt-st-ok { border-color: var(--dsw-alias-state-success-primary); color: var(--dsw-alias-state-success-primary); }
.mkt-st-warn { border-color: var(--dsw-alias-state-warn-primary); color: var(--dsw-alias-state-warn-primary); }
.mkt-st-err { border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }
.mkt-st-muted { border-color: var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary); }
.mkt-desc { color: var(--dsw-alias-label-secondary); font-size: 12px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 15px; }
.mkt-meta { color: var(--dsw-alias-label-secondary); font-size: 11px; }
.mkt-topics { display: flex; gap: 4px; flex-wrap: wrap; }
.mkt-topic { font-size: 10px; color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); background: var(--dsw-alias-bg-layer-2); border-radius: 4px; padding: 1px 5px; }
.mkt-btn { align-self: flex-start; background: var(--dsw-alias-button-primary-fill, var(--dsw-alias-label-primary)); color: var(--dsw-alias-label-primary-foreground, var(--dsw-alias-bg-layer-3)); border: none; border-radius: 6px; padding: 4px 12px; font-size: 12px; cursor: pointer; }
.mkt-btn:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover, var(--dsw-alias-button-primary-fill)); }
.mkt-btn.ghost { background: transparent; border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-primary); }
.mkt-btn.ghost:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
.mkt-btn:disabled { opacity: 0.5; cursor: default; }
.mkt-chip { display: inline-flex; align-items: center; gap: 6px; background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary); border-radius: 999px; padding: 2px 10px; font-size: 11px; }
.mkt-chip button { appearance: none; border: none; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; padding: 0 0 0 2px; font-size: 12px; line-height: 1; }
.mkt-chip button:hover { color: var(--dsw-alias-label-primary); }
.mkt-warn { background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-state-warn-primary); border-radius: 8px; padding: 10px 12px; font-size: 12px; color: var(--dsw-alias-label-primary); white-space: pre-wrap; }
.mkt-err { color: var(--dsw-alias-state-error-primary); font-size: 12px; }
.mkt-ok { color: var(--dsw-alias-state-success-primary); font-size: 12px; }
.mkt-pre { background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; padding: 8px; font-size: 11px; overflow: auto; max-height: 160px; white-space: pre-wrap; word-break: break-all; margin: 0; }
.mkt-modal-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.mkt-modal { background: var(--dsw-alias-bg-overlay); border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; padding: 14px 16px; max-width: 520px; width: calc(100% - 40px); display: flex; flex-direction: column; gap: 10px; }
.mkt-modal-title { font-size: 14px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.mkt-footer { display: flex; gap: 8px; align-items: center; }
`;

    function apiFetch(path, options) {
      return window.fetch(path, options).then(function (res) {
        return res.json().catch(function () {
          return { ok: false, error: "非 JSON 响应 (" + res.status + ")" };
        });
      });
    }

    function searchUrl(params) {
      var sp = new URLSearchParams();
      sp.set("sort", params.sort);
      sp.set("order", params.order);
      sp.set("page", String(params.page));
      if (params.q) sp.set("q", params.q);
      if (params.language) sp.set("language", params.language);
      return "/market-api/search?" + sp.toString();
    }

    var inject = ["slots"];
    var qTimer = null;

    function apply(ctx) {
      var styleEl = null;
      if (typeof document !== "undefined") {
        styleEl = document.createElement("style");
        styleEl.textContent = CSS;
        document.head.appendChild(styleEl);
      }
      ctx.effect(() => () => {
        if (styleEl !== null && styleEl.parentNode !== null) styleEl.parentNode.removeChild(styleEl);
        if (qTimer !== null) window.clearTimeout(qTimer);
      });

      function el(type, props) {
        const rest = Array.prototype.slice.call(arguments, 2)
        return React.createElement.apply(React, [type, props].concat(rest))
      }

      function MarketPanel() {
        const [params, setParams] = React.useState({ sort: 'stars', order: 'desc', page: 1, q: '', language: '' })
        const [qInput, setQInput] = React.useState('')
        const [data, setData] = React.useState({ repos: [], total: 0, pluginTotal: 0, curatedCount: 0, fetchedAt: '', languages: [] })
        const [loading, setLoading] = React.useState(false)
        const [error, setError] = React.useState(null)
        const [tick, setTick] = React.useState(0)
        const [installs, setInstalls] = React.useState({})
        const [confirming, setConfirming] = React.useState(null)

        React.useEffect(() => {
          let cancelled = false
          setLoading(true)
          setError(null)
          apiFetch(searchUrl(params)).then((res) => {
            if (cancelled) return
            if (res && res.ok) {
              setData({
                repos: res.repos,
                total: res.total,
                pluginTotal: res.plugin_total || 0,
                curatedCount: res.curated_count || 0,
                fetchedAt: res.fetched_at,
                languages: (res.languages && res.languages.length) ? res.languages : data.languages,
              })
            } else {
              setError((res && res.error) || '请求失败')
            }
          }).catch((err) => {
            if (!cancelled) setError(String(err && err.message || err))
          }).finally(() => {
            if (!cancelled) setLoading(false)
          })
          return () => { cancelled = true }
        }, [params, tick])

        function refresh() {
          setLoading(true)
          setError(null)
          apiFetch('/market-api/refresh').then((res) => {
            if (res && res.ok) {
              setTick((t) => t + 1)
            } else {
              setError((res && res.error) || '刷新失败')
              setLoading(false)
            }
          }).catch((err) => {
            setError(String(err && err.message || err))
            setLoading(false)
          })
        }

        function commitQ(value) {
          setParams((p) => Object.assign({}, p, { q: value, page: 1 }))
        }

        function onQInput(ev) {
          const v = ev.target.value
          setQInput(v)
          if (qTimer !== null) window.clearTimeout(qTimer)
          qTimer = window.setTimeout(function () { commitQ(v) }, 400)
        }

        function clearQ() {
          setQInput('')
          commitQ('')
        }

        function clearLanguage() {
          setParams((p) => Object.assign({}, p, { language: '', page: 1 }))
        }

        function onSortTab(key) {
          setParams((p) => {
            if (p.sort === key) {
              return Object.assign({}, p, { order: p.order === 'desc' ? 'asc' : 'desc', page: 1 })
            }
            return Object.assign({}, p, { sort: key, page: 1 })
          })
        }

        function beginInstall(repo) {
          const spec = 'github:' + repo.full_name
          setInstalls((prev) => Object.assign({}, prev, { [repo.full_name]: { status: 'checking' } }))
          apiFetch('/market-api/install', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ spec, kind: 'github' }),
          }).then((res) => {
            if (res && res.need_confirm) {
              setInstalls((prev) => Object.assign({}, prev, { [repo.full_name]: { status: 'idle' } }))
              setConfirming({ repo, spec, command: res.command })
            } else {
              setInstalls((prev) => Object.assign({}, prev, { [repo.full_name]: { status: 'failed', res: res || { error: '检查失败' } } }))
            }
          }).catch((err) => {
            setInstalls((prev) => Object.assign({}, prev, { [repo.full_name]: { status: 'failed', res: { error: String(err && err.message || err) } } }))
          })
        }

        function confirmInstall() {
          const c = confirming
          if (!c) return
          setConfirming(null)
          setInstalls((prev) => Object.assign({}, prev, { [c.repo.full_name]: { status: 'installing' } }))
          apiFetch('/market-api/install', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ spec: c.spec, kind: 'github', confirmed: true }),
          }).then((res) => {
            setInstalls((prev) => Object.assign({}, prev, { [c.repo.full_name]: { status: res && res.ok ? 'done' : 'failed', res } }))
          }).catch((err) => {
            setInstalls((prev) => Object.assign({}, prev, { [c.repo.full_name]: { status: 'failed', res: { error: String(err && err.message || err) } } }))
          })
        }

        function statusBadge(status) {
          const cls = status === '兼容' ? 'mkt-st mkt-st-ok'
            : status === '需适配' ? 'mkt-st mkt-st-warn'
            : status === '已删除' ? 'mkt-st mkt-st-err'
            : 'mkt-st mkt-st-muted'
          return el('span', { className: cls }, status)
        }

        function repoCard(repo) {
          const st = installs[repo.full_name]
          const rows = []
          rows.push(el('div', { className: 'mkt-card', key: repo.full_name },
            el('div', null,
              el('a', { className: 'mkt-name', href: repo.html_url, target: '_blank', rel: 'noreferrer' }, repo.full_name),
              repo.is_official ? el('span', { className: 'mkt-badge' }, '官方') : null,
              repo.curated ? el('span', { className: 'mkt-badge-curated' }, '精选') : null,
              repo.radar_status ? statusBadge(repo.radar_status) : null,
            ),
            el('div', { className: 'mkt-desc' }, repo.description || '（无描述）'),
            el('div', { className: 'mkt-meta' },
              [repo.language || '未知语言', '★ ' + repo.stars, 'fork ' + repo.forks, '更新 ' + (repo.pushed_at ? repo.pushed_at.slice(0, 10) : '?')].join(' · '),
            ),
            repo.topics && repo.topics.length
              ? el('div', { className: 'mkt-topics' }, repo.topics.slice(0, 6).map((t) => el('span', { className: 'mkt-topic', key: t }, t)))
              : null,
            !st || st.status === 'idle' || st.status === 'failed'
              ? el('button', { className: 'mkt-btn', onClick: () => beginInstall(repo) }, st && st.status === 'failed' ? '重试安装' : '安装')
              : st.status === 'checking'
                ? el('button', { className: 'mkt-btn', disabled: true }, '检查可安装性…')
                : st.status === 'installing'
                  ? el('button', { className: 'mkt-btn', disabled: true }, '安装中…')
                  : el('div', { className: 'mkt-ok' }, '安装完成（新 bundle 需重启 Web UI 生效）'),
          ))
          if (st && st.res && st.status === 'failed') {
            rows.push(el('div', { className: 'mkt-err', key: repo.full_name + '-err' },
              '失败: ' + String((st.res.error || st.res.stderr_tail || '').slice(0, 300)),
            ))
            if (st.res.stderr_tail) {
              rows.push(el('pre', { className: 'mkt-pre', key: repo.full_name + '-log' }, st.res.stderr_tail))
            }
          }
          return rows
        }

        const perPage = 30
        const pages = Math.max(1, Math.ceil(data.total / perPage))
        const sortTabs = [
          ['stars', '总星数'],
          ['created', '最新发布'],
          ['pushed', '最近推送'],
        ]
        const filtered = params.q !== '' || params.language !== ''
        return el('div', { className: 'mkt-panel' },
          el('div', null,
            el('div', { className: 'mkt-title' }, 'DeepSeek Harness 插件 · 创意市场'),
            el('div', { className: 'mkt-sub' },
              '来源 GitHub topic:dsh-plugin · 更新于 ' + (data.fetchedAt ? data.fetchedAt.slice(0, 16).replace('T', ' ') + ' UTC' : '—') +
              ' · 插件 ' + data.pluginTotal + ' · 精选 ' + data.curatedCount +
              (filtered ? ' · 匹配 ' + data.total : '') +
              (data.pluginTotal === 0 ? '（首次加载约 35 秒）' : ''),
            ),
          ),
          el('div', { className: 'mkt-tabrow' },
            el('div', { className: 'mkt-sortgroup' },
              el('span', { className: 'mkt-sortlabel' }, '排序'),
              sortTabs.map((t) => el('button', {
                className: 'mkt-tab' + (params.sort === t[0] ? ' active' : ''),
                key: t[0],
                onClick: () => onSortTab(t[0]),
              }, t[1] + (params.sort === t[0] ? (params.order === 'desc' ? ' ↓' : ' ↑') : ''))),
            ),
          ),
          el('div', { className: 'mkt-row' },
            el('input', {
              className: 'mkt-input',
              placeholder: '输入即时筛选仓库名/描述（回车立即生效）',
              value: qInput,
              onChange: onQInput,
              onKeyDown: (ev) => { if (ev.key === 'Enter') { if (qTimer !== null) window.clearTimeout(qTimer); commitQ(qInput.trim()) } },
            }),
            el('select', {
              className: 'mkt-select',
              value: params.language,
              onChange: (ev) => setParams((p) => Object.assign({}, p, { language: ev.target.value, page: 1 })),
            },
              el('option', { value: '' }, '全部语言'),
              data.languages.map((lg) => el('option', { value: lg, key: lg }, lg)),
            ),
            el('button', { className: 'mkt-btn ghost', onClick: refresh }, '刷新'),
          ),
          filtered
            ? el('div', { className: 'mkt-row' },
                params.q ? el('span', { className: 'mkt-chip', key: 'qchip' }, '搜索: ' + params.q, el('button', { onClick: clearQ }, '×')) : null,
                params.language ? el('span', { className: 'mkt-chip', key: 'lchip' }, '语言: ' + params.language, el('button', { onClick: clearLanguage }, '×')) : null,
              )
            : null,
          error ? el('div', { className: 'mkt-err' }, '加载失败: ' + error) : null,
          loading
            ? el('div', { className: 'mkt-sub' }, '正在从 GitHub 拉取全量插件数据（约 35 秒，仅首次）…')
            : data.repos.length === 0
              ? el('div', { className: 'mkt-sub' }, filtered ? '没有匹配的仓库' : '暂无数据')
              : el('div', { className: 'mkt-grid' }, data.repos.map((r) => repoCard(r))),
          el('div', { className: 'mkt-footer' },
            el('button', { className: 'mkt-btn ghost', disabled: params.page <= 1, onClick: () => setParams((p) => Object.assign({}, p, { page: p.page - 1 })) }, '上一页'),
            el('span', { className: 'mkt-sub' }, '第 ' + params.page + ' / ' + pages + ' 页'),
            el('button', { className: 'mkt-btn ghost', disabled: params.page >= pages, onClick: () => setParams((p) => Object.assign({}, p, { page: p.page + 1 })) }, '下一页'),
          ),
          confirming
            ? el('div', { className: 'mkt-modal-mask', onClick: () => setConfirming(null) },
                el('div', { className: 'mkt-modal', onClick: (ev) => ev.stopPropagation() },
                  el('div', { className: 'mkt-modal-title' }, '确认安装 ' + confirming.repo.full_name + '？（已通过 dsh.bundle 可安装性检查）'),
                  el('div', { className: 'mkt-warn' }, '将执行命令:\n' + confirming.command + '\n\ngithub 源安装会在本机执行该仓库的 prepare 安装脚本（pnpm 默认拦截，需在 profile 的 pnpm-workspace.yaml 中允许该包构建：allowBuilds）。请确认你信任该仓库及其脚本。'),
                  el('div', { className: 'mkt-footer' },
                    el('button', { className: 'mkt-btn', onClick: confirmInstall }, '我已了解，继续安装'),
                    el('button', { className: 'mkt-btn ghost', onClick: () => setConfirming(null) }, '取消'),
                  ),
                ),
              )
            : null,
        )
      }

      ctx.slots.inject("settings.plugins.tab", () =>
        ctx.slots.register(
          { name: "settings.plugins.tab", id: "market", order: 20, label: "发现插件" },
          () => el(MarketPanel),
        )
      );
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
