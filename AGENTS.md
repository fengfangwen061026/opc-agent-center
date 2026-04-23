# OPC Agent Center

## 项目概述

个人 AI 超级中枢驾驶舱，基于 OpenClaw + Evolver + LanceDB + Obsidian 构建。

**核心文档（必须先全部读完再写代码）**：
1. `docs/spec.md` — 完整工程规格（架构、数据模型、接口、Phase 计划）
2. `docs/ui_system.md` — UI 设计系统（色彩 token、组件规范、布局）

## 技术栈

- 前端：React 19 + TypeScript + Vite + Tailwind + Zustand + TanStack Query + React Flow
- Bridge：Node.js + TypeScript + Hono + better-sqlite3
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
- 不提交 secrets / .env / LanceDB 数据目录 / *.jsonl 归档文件
- 提交前运行 `pnpm typecheck && pnpm lint`
- S3/S4 动作（发消息/push代码/发布/付款）必须经通知中心审批

## 当前阶段

**Phase 0**（进行中）

## 执行指令

按 Phase 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 连续执行。
每完成一个 Phase 输出验收 checklist，立刻进入下一个，不等确认。
遇到阻塞（依赖不存在、外部系统不可用）用 mock/fallback 绕过并标注 TODO。
