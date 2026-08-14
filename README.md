[English](README.md) | [简体中文](README.zh-CN.md)

# dsh-market · Creative Marketplace for DeepSeek Harness Plugins

> Discover DeepSeek Harness plugins from the official `dsh-plugin` topic — noise-filtered, trust-badged, one-click install into your profile.

**Status: beta, installable.** A persistent npm bundle: install once into your profile, restart the Web UI, and it stays. The `src/` directory holds the equivalent dynamic-plugin reference implementation.

## What it does

- **Discovery**: crawls every repo under GitHub topic `dsh-plugin` (600+) and filters topic-squatting noise
- **Trust signals**: badges for `精选` (human-curated) and community compatibility verdicts (`兼容` / `需适配` / `已删除` / `关注`)
- **Ranking & filtering**: by stars / newest / last push (asc/desc toggle), instant search, language filter
- **Install funnel**: click Install → verify the repo declares `dsh.bundle.patch` in package.json (non-bundles are rejected) → show the exact command with an allowBuilds security warning → confirm → run `dsh plugin --profile <p> add github:owner/repo`

## Install

```sh
dsh plugin --profile web add github:Luaphes/dsh-plugins-market
```

Restart the Web UI afterwards; a "Discover plugins" tab appears under Settings → Plugins. Zero build step, no install scripts, no allowBuilds prompt.

Once published to npm: `dsh plugin --profile web add dsh-plugins-market`

## Architecture

- Host half: full GitHub Search API crawl (rate-limit friendly, 10-minute in-memory cache), merges curated/compatibility source data, install verification & execution (approval-gated)
- Client half: registers the official `settings.plugins.tab` extension point, React card list
- Zero LLM, zero backend, zero user quota: rules + public APIs only

## Source credits

- Official discovery mechanism: GitHub topic [`dsh-plugin`](https://github.com/topics/dsh-plugin)
- `精选` marks: the catalog content of [@0xsline/awesome-deepseek-harness](https://github.com/0xsline/awesome-deepseek-harness)
- Compatibility verdicts: the daily radar table of [@AdamPlatin123/awesome-dsh-plugins](https://github.com/AdamPlatin123/awesome-dsh-plugins)

## Roadmap

- [x] Persistent npm bundle (installable from GitHub)
- [ ] npm publish + CI auto-release (Trusted Publishing)
- [ ] Weekly trending (daily star snapshots)
- [ ] Standalone web site form (public discovery entry)

## License

[MIT](LICENSE)
