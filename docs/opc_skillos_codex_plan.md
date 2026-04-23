# OPC SkillOS Agent Center — Codex 分阶段执行计划 v0.2

> 本文档定义 Codex/Claude Code 的分阶段执行计划。
> 工程规格见 `opc_skillos_spec_main.md`，设计系统见 `opc_skillos_ui_system.md`。
> 每个阶段必须满足验收标准后再进入下一阶段。

---

## 执行原则

1. **先读后改**：开始前先扫描仓库结构、package manager、现有 UI、OpenClaw 集成方式、构建脚本和测试脚本。
2. **小步提交**：每个阶段拆成可审查的小 PR。
3. **Mock-first**：所有外部连接器先做 mock adapter，再接真实系统。
4. **Type-safe**：核心数据结构用 TypeScript 类型 + Zod schema 双重约束。
5. **Local-first**：默认只连本机或用户显式配置的 Gateway。
6. **No secret leak**：token / API key / 密钥不进仓库、日志、URL query、前端明文。
7. **Skill-first**：不引入 n8n/Zapier/Make 等固定工作流系统。
8. **Human-in-the-loop**：S3/S4 动作必须进通知中心审核。
9. **UI 高审美**：严格遵循 `ui-system.md` 设计规范。
10. **先观测后自治**：先保证可见性，再开放自动执行。

---

## Phase 依赖关系图

```
Phase 0 (仓库审计)
    │
    ▼
Phase 1 (视觉系统 + App Shell)
    │
    ▼
Phase 2 (Command Center + Agent Graph mock)
    │
    ├───────────────────────┬───────────────────┐
    ▼                       ▼                   ▼
Phase 3                 Phase 5             Phase 6
(OpenClaw Adapter)     (Task Capsule +       (Skill Center)
    │                  Notification Center)       │
    ▼                       │                     │
Phase 4                     │                     │
(Chat + IM 同步)            │                     │
    │                       │                     │
    └───────────┬───────────┘                     │
                │                                 │
                ▼                                 ▼
            Phase 7 (Hermes Bridge) ◄─────────────┘
                │
    ┌───────────┴───────────┐
    ▼                       ▼
Phase 8                 Phase 9
(Obsidian Panel)       (Coding Agent Adapter)
    │                       │
    └───────────┬───────────┘
                ▼
           Phase 10 (安全/性能/打磨)
```

**可并行的 Phase**：

- Phase 3 + Phase 5 + Phase 6 可并行（都只依赖 Phase 2 的 mock 基础设施）
- Phase 8 + Phase 9 可并行（都依赖 Phase 7 的 Hermes Bridge）

---

## Phase 0：仓库审计与脚手架

**预估工时**：0.5 天

**任务**：

1. 扫描 repo：package manager、build scripts、lint/test、已有 UI。
2. 选择实现路径：独立 `apps/web` + `apps/bridge`，或集成到现有 Control UI。
3. 创建 `packages/core/` 下的核心类型和 Zod schemas（从 `opc_skillos_spec_main.md` 第 7 节提取）。
4. 创建 `data/mock/` 目录，编写 mock 数据。
5. 初始化 prettier / eslint / typecheck / vitest。
6. 创建 `docs/architecture.md`（可直接引用 spec）。

**验收**：

- `pnpm install` 成功
- `pnpm dev` 能启动前端
- `pnpm typecheck` 通过
- 核心类型（OpcAgent / OpcSkill / TaskCapsule / OpcNotification / OpcMessage）有 Zod schema

---

## Phase 1：视觉系统与 App Shell

**预估工时**：1-2 天
**依赖**：Phase 0

**任务**：

1. 实现 `packages/design-tokens/` 中的 CSS variables（从 `ui-system.md` 提取）。
2. 实现 `packages/ui/` 核心组件：GlassCard / LiquidButton / StatusPill / AgentAvatar / MetricCard。
3. 实现 AppShell：TopBar / LeftNav / RightNotificationRail / MainWorkspace。
4. 实现背景流体渐变（`opc-shell-bg`）。
5. 支持 light theme，CSS variables 预留 dark theme。
6. 实现响应式断点。

**验收**：

- 视觉明显区别于普通后台模板
- 所有卡片有 glass blur、边框、柔和阴影
- 页面可响应式显示
- `prefers-reduced-motion` 生效
- WCAG AA 文字对比度

---

## Phase 2：Command Center + Agent Constellation mock

**预估工时**：2-3 天
**依赖**：Phase 1

**任务**：

1. 实现 5 个顶部状态卡（Gateway / Conductor / Hermes / Obsidian / Coding Agents），数据来自 mock。
2. 实现 React Flow Agent Constellation。节点类型见 spec 5.2。
3. 实现 Live Task Timeline，mock 事件流。
4. 实现 Task Detail drawer。
5. 实现前端 Event Store（Zustand，spec 3.6）。
6. 实现 SystemHealth 聚合（spec 3.7），mock 数据。

**验收**：

- 能看到 Conductor / Hermes / Knowledge / Research / Dev / Publishing / Learning / Codex / Claude Code 节点
- 边关系体现 delegates_to / asks_context / uses_skill / writes_to / reviews
- 点击节点进入 Agent detail
- 点击事件进入 Task detail
- Event Store 有 FIFO 淘汰（2000 条上限）

---

## Phase 3：OpenClaw Gateway Adapter

**预估工时**：2-3 天
**依赖**：Phase 2

**前提**：先检查当前 OpenClaw Gateway 文档和本机 CLI/API，不硬编码不存在的方法。

**任务**：

1. 实现 `packages/openclaw-adapter/` 的 `OpenClawAdapter` 接口（spec 7.5）。
2. 实现 WS adapter：connect / disconnect / status / subscribe / sendMessage / listAgents / listSubagents / getTaskLog。
3. 实现 mock adapter（保持 Phase 2 mock 可用）。
4. 实现 CLI fallback adapter（只读）。
5. 支持配置 gateway URL / token / password。
6. 实现断线重连（指数退避，spec 第 4 节）。
7. 实现 Gateway 事件 → OpcEvent 转换。
8. UI Settings 页增加连接配置。
9. Token 安全：不进 localStorage 明文、不进日志。

**验收**：

- mock mode 仍可运行
- 配置真实 Gateway URL 后能显示 connected/offline
- 实时 chat/agent/presence/health 事件进入前端 Event Store
- 断线后自动重连
- token 不泄漏

---

## Phase 4：Chat Center 与 IM 同步

**预估工时**：2-3 天
**依赖**：Phase 3

**任务**：

1. 实现 Conversation list。
2. 实现消息流 UI。
3. 实现消息输入框，支持 @agent 和 /skill UI autocomplete。
4. 通过 OpenClawAdapter 发送消息。
5. 从 Gateway event 同步外部 IM 消息。
6. 实现 Unmatched Thread Inbox。
7. 输入框支持附件/链接粘贴（至少 UI 展示层）。

**验收**：

- UI 发送消息进入 OpenClaw session
- IM 入口消息以 channel 标记显示
- 同一任务在 IM 和 Panel 两边上下文可见
- 无法匹配 thread 的消息进入 Unmatched Inbox

---

## Phase 5：Task Capsule 与 Notification Center

**预估工时**：2-3 天
**依赖**：Phase 2（可与 Phase 3 并行）

**任务**：

1. 实现 Task store。
2. 实现 Capsule schema 验证（Zod）和文件持久化（`data/capsules/YYYY/MM/DD/<taskId>.json`）。
3. 实现 Notification schema（spec 5.6）。
4. 实现 Notification Center 页面。
5. 实现右侧 Notification Rail。
6. 实现审批操作：approve / reject / request_changes / open。
7. 任务完成后自动生成 capsule。
8. S3/S4 动作自动生成 approval notification。

**验收**：

- mock/真实任务能生成 capsule
- 高风险任务生成 approval notification
- 通知中心能按 waiting_action / risk / agent / type 筛选
- capsule 可查看、复制、导出

---

## Phase 6：Skill Center

**预估工时**：2-3 天
**依赖**：Phase 2（可与 Phase 3 并行）

**任务**：

1. 扫描 skills 目录。
2. 解析 SKILL.md frontmatter。
3. 建立 Skill Registry。
4. 实现 Skill 列表、搜索、过滤。
5. 实现 Skill 详情页（Tabs：README / Metadata / Procedure / Permissions / Evals / Usage / Evolution / Files）。
6. 实现 Markdown viewer/editor。
7. 实现 diff viewer。
8. 实现 eval 状态占位。

**验收**：

- 能展示 stable / experimental / draft / quarantined Skill
- 能看到 risk / owner / writesTo / usage / eval
- 能编辑 draft Skill，不直接覆盖 stable
- 能展示 Hermes patch diff

---

## Phase 7：Hermes Bridge

**预估工时**：2-3 天
**依赖**：Phase 5 + Phase 6

**前提**：先检查本地 Hermes 实例版本和可用 CLI/HTTP API。

**任务**：

1. 实现 `packages/hermes-adapter/` 的 `HermesAdapter` 接口（spec 第 6 节）。
2. 实现 mock adapter（含 contextPack / reflectTask / proposeSkill / patchSkill 的 mock 响应）。
3. 实现 CLI adapter：通过 `hermes` CLI 命令调用。
4. 实现 HTTP adapter：连接 Hermes admin server（如可用）。
5. 运行时自动探测可用传输方式（CLI → HTTP → mock fallback）。
6. UI 展示 Hermes Context Pack（Task Detail 页）。
7. UI 展示 Hermes Reflection（Capsule 详情页）。
8. Hermes 的 memory candidate / skill patch → 通知中心。

**验收**：

- Task Detail 可请求 Hermes Context Pack
- Capsule 可发送给 Hermes Reflection
- Reflection 结果生成通知
- Skill patch 进入 Skill Evolution Inbox
- Hermes 不全程接收完整日志，只接收 capsule 或用户确认后的相关片段
- Hermes 不可用时 UI 优雅降级（隐藏 Hermes 操作按钮，不阻塞其他功能）

---

## Phase 8：Obsidian Panel

**预估工时**：2 天
**依赖**：Phase 7（可与 Phase 9 并行）

**任务**：

1. 实现 `packages/obsidian-adapter/` 的 `ObsidianAdapter` 接口（spec 5.5）。
2. 实现 LocalREST adapter（`https://127.0.0.1:27124`，Bearer token）。
3. 预留 MCP adapter 接口。
4. 实现 vault tree 浏览。
5. 实现 note viewer（Markdown 渲染）。
6. 实现全文搜索。
7. 实现 Review Queue 展示。
8. 实现从通知打开 Obsidian note。
9. 写入时默认写 Review Queue，`WriteOptions` 支持 `createOnly` / `appendOnly` / `ifMatch`。
10. Obsidian 不可达时缓存写入操作到 Bridge SQLite，恢复后重放。

**验收**：

- 能连接本地 Obsidian vault
- 能浏览和读取 Markdown
- 能搜索
- 能写入 `08_Review_Queue`
- 知识入库通知能打开对应 note
- Obsidian 离线时 UI 优雅降级

---

## Phase 9：Codex / Claude Code Adapter

**预估工时**：2 天
**依赖**：Phase 7（可与 Phase 8 并行）

**任务**：

1. 实现 `CodingAgentRun` 数据结构（spec 7.4）。
2. 实现 mock Codex / Claude Code run。
3. 实现 UI 展示：repo / worktree / branch / filesChanged / test / diffSummary。
4. 真实 CLI adapter 放在 feature flag 后。
5. Dev Operator 任务完成后生成 Code Review notification。
6. 实现测试结果面板。

**验收**：

- 能看到 Codex/Claude Code 被谁派发、做什么、改了哪些文件、测试结果
- 代码变更必须进入通知中心审批
- 无审批不得 push/merge/deploy
- 真实执行在 feature flag 后

---

## Phase 10：安全、性能与可用性打磨

**预估工时**：2-3 天
**依赖**：Phase 8 + Phase 9

**任务**：

1. 全局错误边界（React Error Boundary）。
2. 日志脱敏（spec 8.4）。
3. 离线状态和重连提示。
4. 大量事件虚拟列表（react-window 或 @tanstack/virtual）。
5. Agent Graph 性能优化（节点 > 50 时测试）。
6. E2E smoke tests（Playwright）。
7. 安全文档（`docs/security.md`）。
8. 备份/导出：capsules / notifications / skill registry。
9. SQLite schema migration 机制（simple versioned migrations）。

**验收**：

- 断网 / Gateway offline / Hermes offline / Obsidian offline 都有清晰 UI
- 500+ 条消息/事件不卡顿
- 核心 Zod schema 有单元测试
- secrets 不泄漏
- typecheck / lint / test 全通过
- SQLite schema 有版本号和迁移脚本

---

## Codex 首轮执行 Prompt

将以下内容作为 Codex 第一条执行 prompt：

```
你正在实现 OPC SkillOS Agent Center。

请先完整阅读以下三个文档：
1. opc_skillos_spec_main.md — 工程规格（架构、数据模型、接口定义）
2. opc_skillos_ui_system.md — UI 设计系统（色彩、组件、动效）
3. opc_skillos_codex_plan.md — 本执行计划

本轮只做 Phase 0 + Phase 1 + Phase 2：

1. 扫描仓库结构，确认 package manager、构建脚本、现有 UI。
2. 创建 packages/core/ 核心类型和 Zod schemas。
3. 创建 packages/design-tokens/ CSS variables。
4. 创建 packages/ui/ 核心组件（GlassCard / LiquidButton / StatusPill / AgentAvatar / MetricCard）。
5. 创建 apps/web/ React + TypeScript + Vite 主 UI。
6. 实现 AppShell（TopBar / LeftNav / RightNotificationRail / MainWorkspace）。
7. 实现 Command Center mock（5 个状态卡）。
8. 实现 React Flow Agent Constellation mock。
9. 实现 Live Task Timeline mock。
10. 实现前端 Event Store（Zustand，FIFO 2000 条上限）。
11. 所有数据用 mock，不接真实 Gateway。
12. 加入 TypeScript typecheck + 基础测试。

约束：
- 不引入 n8n 或固定 DAG workflow。
- 不提交 secrets。
- 不实现高风险真实执行。
- UI 必须符合 ui-system.md 规范。
- 输出变更摘要、运行方式、后续 Phase 3 待办。
```

后续每轮执行时，参照本文档对应 Phase 的任务和验收标准动态生成 prompt，不再预设固定提示词。
