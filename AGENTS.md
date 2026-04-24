# OPC Agent Center

## 项目概述

个人 AI 超级中枢驾驶舱，基于 OpenClaw + Evolver + LanceDB + Obsidian 构建。

**核心文档（必须先全部读完再写代码）**：

1. `docs/spec.md` — 完整工程规格（架构、数据模型、接口、Phase 计划）
2. `docs/ui_system.md` — UI 设计系统（色彩 token、组件规范、布局）

## 技术栈

- 前端：React 19 + TypeScript + Vite + Tailwind + Zustand + TanStack Query + React Flow
- Bridge：Node.js + TypeScript + Hono + LanceDB
- Schema：Zod（packages/core，所有数据结构必须有 Zod schema）
- 包管理：pnpm workspaces（不用 npm/yarn）
- 测试：Vitest

## Workspace 结构

```
opc-agent-center/
├── apps/
│   ├── web/          # React 前端
│   └── bridge/       # Node.js 中间层
├── packages/
│   ├── core/         # Zod schemas + 类型
│   ├── ui/           # 液态玻璃组件库
│   └── design-tokens/ # CSS variables
├── skills/
│   └── evolver/      # Evolver agent 配置
└── docs/
    ├── spec.md
    └── ui_system.md
```

## 工作规范

- TypeScript strict mode
- 所有核心类型用 Zod schema + z.infer<> 双重约束
- 所有外部 adapter 先实现 Mock，再接真实服务
- UI 严格遵循 `docs/ui_system.md`，使用 `--opc-*` CSS variables
- 不提交 secrets / .env / LanceDB 数据目录 / \*.jsonl 归档文件
- 提交前运行 `pnpm typecheck && pnpm lint`
- S3/S4 动作（发消息/push代码/发布/付款）必须经通知中心审批

## 当前阶段

**真实链路加固（truthfulness hardening）**：优先修 real path 一致性，Electron scaffold 已完成。

| 系统 | 状态 | 说明 |
| --- | --- | --- |
| OpenClaw Gateway | ✅ adapter | live WebSocket 路径和认证逻辑已接入，运行态依赖本机 Gateway |
| LanceDB | 🟡 hardening | real adapter 负责持久化；语义索引走 LanceDB，embedding 不可用时降级为关键词召回 |
| Ollama | 🟡 optional | 仅影响 embedding / semantic recall，不应阻断 real CRUD |
| Obsidian | ✅/🟡 | real adapter 与启动脚本已存在，运行态依赖桌面端和 Local REST API 插件 |
| WeChat | ✅ channel | Bridge 已保留通知推送通路，运行态依赖本机 OpenClaw 插件配置 |
| 飞书 | ✅/🟡 | Bridge 已保留通知推送通路，运行态依赖本机 OpenClaw / 飞书配置 |
| Evolver | ✅/🟡 | live 模式优先尝试真实 adapter，不可达时自动降级到 mock |
| Electron | ✅ scaffold | apps/electron、BridgeProcess 和 builder 配置已落地，待实机验证 |

## 启动命令

完整 live 模式（推荐）：
`OPENCLAW_MODE=live LANCEDB_MODE=real OBSIDIAN_MODE=real pnpm dev`

开发模式（Electron 窗口，scaffold）：
`pnpm electron:dev`

生产打包：
`pnpm build && pnpm electron:build`

注意：Obsidian REST API 需要先启动 Obsidian 桌面端才可用。

## 执行指令

优先保证 real path 的数据真值、降级行为和 health 一致性，再继续扩 UI 或桌面封装。
外部系统不可用时保留真实降级逻辑，不要把 mock 数据伪装成 live 结果。

- Obsidian 启动：`bash scripts/start-obsidian.sh`（需要桌面环境）
- Evolver 接入：`OPENCLAW_MODE=live` 时自动尝试真实接入，失败自动降级
