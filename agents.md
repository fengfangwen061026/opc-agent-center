# OPC SkillOS Agent Center

## 项目概述

基于 OpenClaw + HermesAgent + Obsidian 构建个人 AI 超级中枢的驾驶舱 UI。

## 核心文档（必须先读）

1. `docs/opc_skillos_spec_main.md` — 工程规格（架构、数据模型、接口）
2. `docs/opc_skillos_ui_system.md` — UI 设计系统（色彩、组件、动效）
3. `docs/opc_skillos_codex_plan.md` — 分阶段执行计划

## 技术栈

- 前端: React 19 + TypeScript + Vite + Tailwind + Zustand + TanStack Query + React Flow
- Bridge: Node.js + TypeScript + Fastify/Hono + SQLite
- Schema: Zod
- 包管理: pnpm workspaces

## 工作规范

- 使用 pnpm，不用 npm 或 yarn
- TypeScript strict mode
- 所有核心类型用 Zod schema 双重约束
- 提交前运行 `pnpm typecheck && pnpm lint`
- 不提交 secrets、API keys、.env 文件
- UI 必须符合 `docs/opc_skillos_ui_system.md` 的液态玻璃设计系统
- 外部 adapter 一律先实现 mock，再接真实服务

## 当前阶段

Phase 0 + Phase 1 + Phase 2 已全部验收通过。`pnpm install` / `pnpm typecheck` / `pnpm lint` / `pnpm test` / `pnpm build` 全部通过。dev server 运行在 `localhost:5174`。

## 当前连续执行指令

按 Phase 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 的顺序逐个 Phase 连续实现。每完成一个 Phase 输出简短验收 checklist，然后立刻进入下一个 Phase，不停下来等确认。

如果某个 Phase 遇到阻塞性问题（例如依赖装不上、命令不存在、真实外部系统不可用），使用 mock/fallback 绕过并标注 TODO，继续执行。

### Phase 3：OpenClaw Gateway Adapter + Bridge 层

- 先探测 `openclaw` CLI、`~/.openclaw/openclaw.json`、18789 端口。
- 实现 `packages/openclaw-adapter/`：MockAdapter / WsAdapter / CliAdapter / factory。
- 创建 `apps/bridge/`：Node.js + TypeScript + Hono，提供 spec 中 `/api/*` 与 `/ws/events`。
- `pnpm dev` 同时启动 web + bridge。
- 前端通过 Bridge API / WS 获取 health、agents、tasks、skills、notifications、conversations，Bridge 不可达时 fallback mock。
- Settings 页面提供 Gateway URL / token / mode / 连接测试，不把 token 写 localStorage 或日志。

### Phase 4：Chat Center 与 IM 同步

- `/chat` 三栏布局：conversation list、消息流、任务上下文。
- 输入框支持 `@agent`、`/skill`、`/approve <notification-id>`。
- 发送通过 Bridge `POST /api/chat/send`，mock 模式自动回复。
- Gateway chat 事件映射为 `OpcMessage`，不同 channel 有标签。
- 无匹配 thread 消息进入 `/chat/unmatched`。

### Phase 5：Task Capsule 与 Notification Center

- Bridge task store：内存 + `data/capsules/YYYY/MM/DD/<taskId>.json` 持久化。
- Notification store 支持 list/action，S3/S4 自动生成 approval notification。
- `/notifications` 支持筛选和 approve/reject/request_changes/open 等操作。
- Right Rail 从 Bridge 获取待审核、高优先通知、blocked task。
- Task drawer 展示完整 capsule，支持复制和导出 JSON。

### Phase 6：Skill Center

- Bridge Skill Registry 扫描 `~/.openclaw/workspace/skills/` 和 mock skills。
- 解析 `SKILL.md` frontmatter，支持 list/detail/draft edit。
- `/skills` 搜索过滤，`/skills/:name` 详情 8 tabs。
- draft/experimental 可编辑，stable 不直接编辑。
- Evolution tab 展示 Hermes patch mock diff，支持 approve/reject。

### Phase 7：Hermes Bridge

- 探测 `hermes` CLI 和配置目录。
- 实现 `packages/hermes-adapter/`：MockAdapter / CliAdapter / HttpAdapter / runtime fallback。
- Bridge 集成 context pack / reflection。
- Reflection 生成 memory_candidate / skill_patch notification。
- Task drawer 展示 ContextPackResult / ReflectionResult。

### Phase 8：Obsidian Panel

- 实现 `packages/obsidian-adapter/`：MockAdapter / LocalRestAdapter。
- Bridge 实现 tree / note / write / search。
- `/knowledge` 提供 vault tree、Markdown viewer、search、Review Queue tab。
- 默认写入 Review Queue；离线写入进入内存 pending queue，TODO SQLite 持久化。

### Phase 9：Codex / Claude Code Adapter

- 实现 `packages/coding-agent-adapter/` mock runs，真实 CLI behind `CODING_AGENT_REAL=true`。
- `/agents` 增强 Coding Agent 详情：repo/branch/worktree/files/tests/diff/approval。
- coding run 完成生成 code_review notification，支持 approve/reject/request_changes。

### Phase 10：安全、性能与可用性打磨

- 全局和面板级 Error Boundary。
- Bridge `sanitizeLog` 脱敏：api_key / secret / token / password / authorization / cookie / private_key / ssh_key / session / bearer。
- 离线/重连 UI。
- 事件、消息、通知长列表虚拟化。
- Bridge API 测试和 Playwright smoke test。
- 创建 `docs/security.md`。
- `GET /api/export` 导出 capsules + notifications + skill registry。
- 引入 `better-sqlite3` migration：`data/migrations/001_init.sql` 等，启动时执行。

## 全局约束

- UI 严格遵循 `docs/opc_skillos_ui_system.md`，全部使用 `--opc-*` CSS variables 和液态玻璃风格。
- 不引入 n8n / Zapier / Make 或固定 DAG 工作流系统。
- 不提交 secrets / API keys / `.env` 文件。
- 所有外部 adapter 必须有 MockAdapter fallback。
- S3/S4 动作必须经过通知中心审批。
- 所有新数据结构必须有 Zod schema。
- 前端主要页面在 LeftNav 中有入口。
- 前端使用 TanStack Query 管理服务端状态，Zustand 管理本地 UI 状态。
- 不安装 Electron 或 Tauri。
