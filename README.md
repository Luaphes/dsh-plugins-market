[English](README.md) | [简体中文](README.zh-CN.md)

# dsh-market · Creative Marketplace for DeepSeek Harness Plugins

> Discover DeepSeek Harness plugins from the official `dsh-plugin` topic — noise-filtered, trust-badged, one-click install into your profile.

**Status: beta, installable.** A persistent npm bundle: install once into your profile, restart the Web UI, and it stays. The `src/` directory holds the equivalent dynamic-plugin reference implementation.

## What it does

- **Discovery**: crawls GitHub topic `dsh-plugin` (top ~500 repos by stars; rate-limit friendly pacing, first load ~30s, then 10-minute cache) and filters topic-squatting noise
- **Trust signals**: badges for `精选` (human-curated) and community compatibility verdicts (`兼容` / `需适配` / `已删除` / `关注`)
- **Ranking & filtering**: by total stars / recent surge / newest / last push (asc/desc toggle), instant search, language filter; cards show `★ N (+M)` daily star delta when snapshot data covers the repo
- **Install funnel**: click Install → verify the repo declares `dsh.bundle.patch` in package.json (non-bundles are rejected) → show the exact command with an allowBuilds security warning → confirm → run `dsh plugin --profile <p> add github:owner/repo`

## Install

```sh
dsh plugin --profile web add github:Luaphes/dsh-plugins-market
```

Restart the Web UI afterwards; a "Discover plugins" tab appears under Settings → Plugins. Zero build step, no install scripts, no allowBuilds prompt.

Once published to npm: `dsh plugin --profile web add dsh-plugins-market`

## Architecture

- Host half: GitHub Search API crawl (rate-limit friendly, 10-minute in-memory cache), merges curated/compatibility source data, computes star deltas from daily snapshots, install verification & execution (approval-gated)
- Daily snapshots: the `star-snapshots.yml` GitHub Actions workflow records topic repo stars at 02:00 UTC into `snapshots/YYYY-MM-DD.json`; the market serves deltas computed from the two most recent snapshots
- Client half: registers the official `settings.plugins.tab` extension point, React card list
- Zero LLM, zero backend, zero user quota: rules + public APIs only

## Source credits

- Official discovery mechanism: GitHub topic [`dsh-plugin`](https://github.com/topics/dsh-plugin)
- `精选` marks: the catalog content of [@0xsline/awesome-deepseek-harness](https://github.com/0xsline/awesome-deepseek-harness)
- Compatibility verdicts: the daily radar table of [@AdamPlatin123/awesome-dsh-plugins](https://github.com/AdamPlatin123/awesome-dsh-plugins)

## Roadmap

- [x] Persistent npm bundle (installable from GitHub)
- [ ] npm publish + CI auto-release (Trusted Publishing)
- [x] Trending (daily star snapshots → "recent surge" sort + per-card star delta)
- [ ] Standalone web site form (public discovery entry)

## License

[MIT](LICENSE)
