# OPC SkillOS 外部服务编排

本仓库把第三方服务源码放在 `external/`，该目录已加入 `.gitignore`，不会提交第三方源码、token 或本地配置。

## 安装

```bash
pnpm services:install
```

脚本会拉取并安装：

- OpenClaw: `https://github.com/openclaw/openclaw`
- Hermes Agent: `https://github.com/NousResearch/hermes-agent`
- Obsidian Local REST API: `https://github.com/coddingtonbear/obsidian-local-rest-api`

TODO: Obsidian Local REST API 3.6.1 在当前环境构建时缺少 `body-parser`、`moment` 和 `@types/body-parser` 直接依赖；安装脚本会在 ignored 的 `external/` 工作副本中补装后构建。

## 启动

```bash
pnpm services:start
```

这会把本地 CLI 路径注入 Bridge，并启动 Web + Bridge。OpenClaw Gateway daemon、Hermes 登录和 Obsidian 插件启用仍需要各自产品的授权/配对流程；未完成时 Bridge 会自动回落到 mock adapter。

## 本地配置

复制 `.env.example` 到 `.env.local` 后按需调整。不要提交 `.env.local`。

关键变量：

- `OPENCLAW_MODE=mock|ws|cli`，默认推荐 `cli`，Gateway 未启动时会保留 mock fallback
- `OPENCLAW_CLI_PATH=external/openclaw/openclaw.mjs`
- `HERMES_MODE=mock|cli|http`
- `HERMES_CLI_PATH=external/hermes-agent/venv/bin/hermes`
- `OBSIDIAN_MODE=mock|rest`
- `CODEX_CLI_PATH=codex`
- `CLAUDE_CLI_PATH=claude`
