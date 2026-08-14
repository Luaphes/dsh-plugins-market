[简体中文](README.zh-CN.md) | English

# dsh-market · Creative Marketplace for DeepSeek Harness Plugins

> Discover DeepSeek Harness plugins from the official `dsh-plugin` topic — noise-filtered, trust-badged, one-click install into your profile.

**Status: prototype.** Currently runs as a dynamic Cordis plugin inside the dsh Web UI Plugins settings area (session-scoped). Persistent npm bundle packaging is in progress; one-line `dsh plugin add` install is coming soon.

## What it does

- **Discovery**: crawls every repo under GitHub topic `dsh-plugin` (600+) and filters topic-squatting noise
- **Trust signals**: badges for `精选` (human-curated) and community compatibility verdicts (`兼容` / `需适配` / `已删除` / `关注`)
- **Ranking & filtering**: by stars / newest / last push (asc/desc toggle), instant search, language filter
- **Install funnel**: click Install → verify the repo declares `dsh.bundle.patch` in package.json (non-bundles are rejected) → show the exact command with an allowBuilds security warning → confirm → run `dsh plugin --profile <p> add github:owner/repo`

## Architecture

- Host half: full GitHub Search API crawl (rate-limit friendly, 10-minute in-memory cache), merges curated/compatibility source data, install verification & execution (approval-gated)
- Client half: registers the official `settings.plugins.tab` extension point, React card list
- Zero LLM, zero backend, zero user quota: rules + public APIs only

## Source credits

- Official discovery mechanism: GitHub topic [`dsh-plugin`](https://github.com/topics/dsh-plugin)
- `精选` marks: the catalog content of [@0xsline/awesome-deepseek-harness](https://github.com/0xsline/awesome-deepseek-harness)
- Compatibility verdicts: the daily radar table of [@AdamPlatin123/awesome-dsh-plugins](https://github.com/AdamPlatin123/awesome-dsh-plugins)

## Roadmap

- [ ] Persistent npm bundle (`dsh plugin add` one-liner)
- [ ] Weekly trending (daily star snapshots)
- [ ] Standalone web site form (public discovery entry)

## License

[MIT](LICENSE)
