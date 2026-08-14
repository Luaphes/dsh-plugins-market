[English](README.md) | [简体中文](README.zh-CN.md)

# dsh-market · DeepSeek Harness 插件创意市场

> dsh 生态的插件发现与一键安装面板：嗅探官方 `dsh-plugin` topic，过滤噪音，展示信任信号，点一下装进你的 profile。

**当前状态：beta，可安装。** 持久化 npm bundle：装进 profile 后永久生效（装完重启一次 Web UI）。仓库内 `src/` 为等价逻辑的动态插件参考实现。

## 它做什么

- **发现**：全量嗅探 GitHub topic `dsh-plugin`（600+ 仓库），过滤蹭标签的噪音仓库
- **信任信号**：卡片徽章标注「精选」（人工收录）与社区兼容性实测状态（兼容 / 需适配 / 已删除 / 关注）
- **排序与筛选**：总星数 / 最新发布 / 最近推送（升降序切换），搜索即时筛选，语言过滤
- **安装闭环**：点「安装」→ 校验 `package.json` 的 `dsh.bundle.patch` 声明（不是可安装插件的直接拒绝）→ 展示完整命令与 allowBuilds 安全警告 → 确认后执行 `dsh plugin --profile <p> add github:owner/repo`

## 安装

```sh
dsh plugin --profile web add github:Luaphes/dsh-plugins-market
```

安装后重启 Web UI，设置 → Plugins 出现「发现插件」tab。零构建、无安装脚本、不触发 allowBuilds 提示。

npm 渠道发布后：`dsh plugin --profile web add dsh-plugins-market`

## 架构

- host 面：GitHub Search API 全量拉取（限速友好、内存缓存 10 分钟），精选/兼容性信源合并打标，安装校验与执行（审批闸门）
- client 面：注册官方 `settings.plugins.tab` 扩展点，React 卡片流渲染
- 零 LLM、零后端、零用户用量消耗：全部为规则与公开 API

## 信源致谢

- 官方发现机制：GitHub topic [`dsh-plugin`](https://github.com/topics/dsh-plugin)
- 「精选」标记：[@0xsline/awesome-deepseek-harness](https://github.com/0xsline/awesome-deepseek-harness) 的分类目录内容
- 兼容性状态：[@AdamPlatin123/awesome-dsh-plugins](https://github.com/AdamPlatin123/awesome-dsh-plugins) 的每日兼容性雷达表内容

## 路线图

- [x] 持久化 npm bundle（github 源可装）
- [ ] npm 发布 + CI 自动发版（Trusted Publishing）
- [ ] 周榜（每日 star 快照积累）
- [ ] 独立 Web 站点形态（公开发现入口）

## License

[MIT](LICENSE)
