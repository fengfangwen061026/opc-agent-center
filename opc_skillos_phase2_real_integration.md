# OPC SkillOS Agent Center：真实接入闭环 Phase 2 执行规格

> 适用状态：系统已经完成前端 mock 驾驶舱、Bridge、本地 service adapter、OpenClaw/Hermes/Obsidian Local REST API 源码拉取与构建。下一阶段目标不是继续堆 mock 页面，而是打通“真实服务状态 → 真实事件 → 任务胶囊 → 通知/审核 → Hermes 反思/Skill 进化候选”的最小闭环。

---

## 0. 当前状态判断

当前系统已经从纯前端 mock 进入“可接真实服务”的阶段：

- Web 与 Bridge 已能启动。
- OpenClaw CLI 已安装并可执行。
- Hermes CLI 已安装，`hermes doctor` 可运行。
- Obsidian Local REST API 插件已构建，但仍需用户安装进真实 vault 并配置 token。
- Codex / Claude Code CLI 已可探测。
- Bridge health 已能展示 gateway / hermes / obsidian / codingAgents 状态。
- Chat、通知审批、export bundle 已有可用 API。

但是目前还没有形成真正的 OPC 工作闭环：

```text
用户消息 / IM 消息
  → OpenClaw Gateway / OPC Conductor
  → Agent / Skill 执行
  → Task Capsule
  → Notification / Approval
  → Hermes Reflection
  → Memory Candidate / Skill Patch Candidate
  → UI 审核
```

Phase 2 的目标就是建立这个闭环的骨架，并且保持所有旧 mock/fallback 继续可运行。

---

## 1. 总原则

### 1.1 不再扩大 mock 范围

允许 mock/fallback 存在，但新增工作必须优先服务真实接入：

- 真实服务状态检测。
- 真实 OpenClaw Gateway 启动/诊断/日志。
- 真实 Obsidian token 测试和只读读取。
- 真实 Hermes `chat -q` 结构化调用骨架。
- 真实 Task Capsule schema、持久化和 UI 展示。
- 真实通知/审批状态机。

### 1.2 不引入固定 DAG 工作流

不要引入 n8n、Temporal、Airflow 一类固定工作流核心。OPC 的复用层是 Skill，不是固定 DAG。

可以有“状态机”和“任务胶囊”，但不要把个人自动化固化成不可灵活组合的流水线。

### 1.3 Bridge 是本地可信中介

前端不直接持有 OpenClaw token、Obsidian token、Hermes provider token、Codex/Claude 权限。

```text
Web UI
  → Bridge API / Bridge SSE
  → Local Adapters
  → OpenClaw / Hermes / Obsidian / Codex / Claude
```

所有本地秘密只存在于：

- `.env.local`
- 用户 home 配置
- OS keychain，若已有封装
- 外部工具自己的配置目录

Bridge 返回给 Web 的配置必须 redacted。

### 1.4 默认安全模式

- 不自动发布。
- 不自动删除。
- 不自动执行生产运维写操作。
- 不自动让 Codex / Claude Code 改真实 repo，除非 feature flag 显式打开。
- 不把 Obsidian token 暴露给浏览器。
- 不把 Hermes/Codex/Claude 的完整原始日志默认塞进前端，只展示摘要和可展开日志。

---

## 2. Phase 2 的交付目标

完成后，用户应该能做到：

1. 在 Settings / Service Center 里看到 OpenClaw、Hermes、Obsidian、Codex、Claude Code 的真实状态。
2. 一键尝试启动 OpenClaw Gateway dev/local 进程，或看到明确的人工启动命令。
3. 看到 OpenClaw Gateway 的诊断结果、日志摘要和下一步修复建议。
4. 配置 Obsidian REST endpoint/token 后，Bridge 能测试连接并读取 vault 基础信息。
5. 在 Chat Center 发送消息时，消息会创建一个真实 conversation event 和 task candidate；OpenClaw 不可用时仍 fallback。
6. 每个执行动作都能生成标准 Task Capsule，并在 UI 中展开查看。
7. 通知中心能聚合：审批、失败、Hermes memory candidate、Skill patch candidate、Obsidian review item。
8. Hermes Bridge 能在 feature flag 开启且 provider 可用时，用 `hermes chat -q` 生成 `context_pack` 或 `reflection` 的结构化 JSON；不可用时 fallback。
9. Skill Center 可以展示 stable/experimental/draft 三类 Skill，并展示 Hermes 提议的 patch candidate。
10. 所有新增内容必须通过 typecheck、lint、test、build、e2e、format。

---

## 3. 服务编排与诊断

### 3.1 新增 Service Supervisor

新增 Bridge 内部模块：

```text
apps/bridge/src/services/supervisor.ts
```

职责：

- 管理由 Bridge 启动的本地子进程。
- 只管理 Bridge 自己启动的进程，不随意 kill 用户已有进程。
- 记录 stdout/stderr ring buffer。
- 提供 start/stop/status/logs。
- 支持超时、退出码、最近错误。

建议接口：

```ts
export interface ManagedProcessState {
  id: string;
  label: string;
  command: string;
  args: string[];
  status: "stopped" | "starting" | "running" | "exited" | "failed";
  pid?: number;
  startedAt?: string;
  exitedAt?: string;
  exitCode?: number | null;
  lastError?: string;
  logs: Array<{
    ts: string;
    stream: "stdout" | "stderr";
    line: string;
  }>;
}
```

### 3.2 新增服务 API

新增 Bridge routes：

```text
GET  /api/services/status
GET  /api/services/status/deep
POST /api/services/openclaw/start
POST /api/services/openclaw/stop
GET  /api/services/openclaw/logs
POST /api/services/openclaw/doctor
POST /api/services/obsidian/test
POST /api/services/hermes/test
POST /api/services/hermes/model-check
GET  /api/services/redacted-config
```

返回结构必须稳定、可测：

```ts
export interface ServiceStatusResponse {
  bridge: "running";
  openclaw: {
    mode: "mock" | "cli" | "ws";
    status: "connected" | "offline" | "starting" | "error";
    gatewayUrl?: string;
    cliPath?: string;
    version?: string;
    diagnostics: DiagnosticItem[];
  };
  hermes: {
    mode: "mock" | "cli" | "http";
    status: "connected" | "offline" | "needs_provider" | "error";
    cliPath?: string;
    version?: string;
    diagnostics: DiagnosticItem[];
  };
  obsidian: {
    mode: "mock" | "rest";
    status: "connected" | "offline" | "needs_token" | "error";
    endpoint?: string;
    diagnostics: DiagnosticItem[];
  };
  codingAgents: {
    codex: "idle" | "unavailable" | "running" | "error";
    claudeCode: "idle" | "unavailable" | "running" | "error";
  };
}
```

### 3.3 OpenClaw Gateway 启动策略

不要默认强制启动 Gateway。新增环境变量：

```bash
OPENCLAW_AUTOSTART_GATEWAY=0
OPENCLAW_GATEWAY_PORT=18789
OPENCLAW_GATEWAY_ALLOW_UNCONFIGURED=0
OPENCLAW_GATEWAY_FORCE=0
OPENCLAW_GATEWAY_VERBOSE=1
```

Bridge 启动时：

- 如果 `OPENCLAW_AUTOSTART_GATEWAY=1`，尝试启动 Gateway。
- 默认命令：`openclaw gateway --port 18789`。
- 仅当 `OPENCLAW_GATEWAY_ALLOW_UNCONFIGURED=1` 时添加 `--allow-unconfigured`。
- 仅当 `OPENCLAW_GATEWAY_FORCE=1` 时添加 `--force`。
- 不要默认使用 `--force`，避免误杀用户已有进程。

Settings 页面提供两种操作：

```text
- “复制人工启动命令”
- “由 Bridge 启动本地 dev Gateway”
```

### 3.4 OpenClaw Doctor 诊断

`OpenClawAdapter` 增加：

```ts
getVersion(): Promise<string | null>
gatewayStatus(): Promise<GatewayStatus>
doctor(): Promise<DoctorResult>
channelsStatusProbe(): Promise<ChannelsProbeResult>
getRecentLogs(): Promise<LogLine[]>
```

优先调用：

```bash
openclaw --version
openclaw status
openclaw gateway status --json
openclaw doctor
openclaw channels status --probe
```

如果 `--json` 不可用或返回非 JSON，必须 graceful fallback 到文本解析，不允许前端崩溃。

诊断要归因：

```text
- daemon_not_running
- gateway_config_missing_local_mode
- port_not_listening
- auth_or_device_pairing_required
- token_mismatch
- cli_missing
- command_timeout
- unknown
```

---

## 4. Bridge Event Bus 与 SSE

### 4.1 新增标准事件模型

新增共享类型：

```text
packages/shared/src/events.ts
```

事件类型：

```ts
export type OpcEventType =
  | "service.health.changed"
  | "chat.message.created"
  | "agent.status.changed"
  | "task.created"
  | "task.started"
  | "task.progress"
  | "task.completed"
  | "task.failed"
  | "capsule.created"
  | "notification.created"
  | "notification.resolved"
  | "skill.changed"
  | "hermes.context_pack.created"
  | "hermes.reflection.created"
  | "obsidian.note.changed"
  | "coding_agent.run.started"
  | "coding_agent.run.completed"
  | "coding_agent.run.failed";
```

基础结构：

```ts
export interface OpcEvent<TPayload = unknown> {
  id: string;
  ts: string;
  type: OpcEventType;
  source: "web" | "bridge" | "openclaw" | "hermes" | "obsidian" | "codex" | "claude" | "mock";
  correlationId?: string;
  taskId?: string;
  conversationId?: string;
  agentId?: string;
  payload: TPayload;
}
```

### 4.2 新增 Bridge SSE

新增：

```text
GET /api/events/stream
GET /api/events/recent?limit=100
```

前端通过 SSE 订阅 Bridge，而不是直接连 OpenClaw Gateway。这样可以避免把 gateway token 暴露给浏览器，并统一 mock/real 事件。

### 4.3 持久化

开发阶段先用 JSONL：

```text
data/runtime/events.jsonl
```

要求：

- `data/runtime/` 加入 `.gitignore`。
- 事件写入失败不能影响主流程。
- export bundle 可包含最近事件。

---

## 5. Task Capsule 1.0

### 5.1 新增 schema

新增：

```text
packages/shared/src/capsule.ts
```

结构：

```ts
export interface TaskCapsule {
  id: string;
  createdAt: string;
  updatedAt: string;
  taskId: string;
  conversationId?: string;
  userRequest: string;
  goal: string;
  intent: string;
  riskLevel: "S0" | "S1" | "S2" | "S3" | "S4";
  status: "draft" | "running" | "completed" | "failed" | "cancelled" | "waiting_approval";
  conductorAgentId: string;
  workerAgentIds: string[];
  skillsUsed: string[];
  inputs: string[];
  actionsSummary: string[];
  outputs: Array<{
    kind: "message" | "file" | "obsidian_note" | "draft" | "diff" | "url" | "log" | "other";
    label: string;
    uri?: string;
    preview?: string;
  }>;
  verification: string[];
  problems: string[];
  memoryCandidates: string[];
  skillCandidates: Array<{
    type: "new_skill" | "patch_skill" | "eval_case" | "pitfall";
    skillName?: string;
    summary: string;
    rationale: string;
  }>;
  approvals: Array<{
    id: string;
    type: "publish" | "ops" | "code" | "skill_patch" | "memory_update" | "obsidian_write";
    status: "waiting" | "approved" | "rejected" | "changes_requested";
    title: string;
    summary: string;
    createdAt: string;
    resolvedAt?: string;
  }>;
  confidence: number;
  rawTraceRefs: string[];
}
```

### 5.2 Capsule Store

新增：

```text
apps/bridge/src/stores/capsuleStore.ts
```

持久化到：

```text
data/runtime/capsules/*.json
```

API：

```text
GET  /api/capsules
GET  /api/capsules/:id
POST /api/capsules
PATCH /api/capsules/:id
POST /api/capsules/:id/reflect
```

### 5.3 UI

在 Command Center / Task Timeline / Notifications 中都能跳到 Capsule Detail。

Capsule Detail 必须展示：

- 目标。
- 状态。
- Agent 分工。
- Skill 调用。
- 输出物。
- 验证项。
- 问题。
- 记忆候选。
- Skill 候选。
- 审批项。
- 原始 trace refs。

---

## 6. Notification / Approval Center 2.0

### 6.1 通知来源

通知中心聚合以下来源：

```text
- Task failed
- Waiting approval
- Obsidian write review
- Publish draft review
- Code diff review
- Ops command approval
- Hermes memory candidate
- Hermes skill patch candidate
- Service health degraded
```

### 6.2 通知状态机

```ts
export type NotificationStatus =
  | "unread"
  | "waiting_action"
  | "resolved"
  | "rejected"
  | "changes_requested"
  | "archived";
```

### 6.3 动作

每条通知支持：

```text
approve
reject
request_changes
open_capsule
open_related_note
open_related_skill
archive
```

动作必须写入 event bus：

```text
notification.resolved
notification.rejected
notification.changes_requested
```

### 6.4 高风险规则

S3/S4 类型通知不能被 silent auto-approve。

---

## 7. Hermes Bridge 最小真实能力

### 7.1 Hermes 不做常驻主链路

Hermes 只做：

```text
context_pack
reflect_task
propose_skill
patch_skill
```

不要全程旁听所有任务。

### 7.2 Feature flag

新增：

```bash
HERMES_REAL_EXEC=0
HERMES_CONTEXT_TIMEOUT_MS=60000
HERMES_REFLECTION_TIMEOUT_MS=90000
HERMES_PROFILE=opc-kernel
```

默认 `HERMES_REAL_EXEC=0`。如果未配置 provider 或 `hermes chat -q` 失败，自动 fallback mock。

### 7.3 Hermes profile

新增脚本：

```text
scripts/setup-hermes-opc-profile.sh
```

目标：

- 检查 `hermes profile` 是否可用。
- 如果 profile `opc-kernel` 不存在，提示创建命令。
- 不自动复制 secrets。
- 允许用户手动运行 provider setup。

可建议用户执行：

```bash
hermes profile create opc-kernel --clone
opc-kernel setup
# 或按 Hermes 当前 CLI 文档使用 hermes model 配置 provider
```

注意：profile 不是 sandbox；不要把 profile 当权限边界。

### 7.4 Hermes 调用方式

先采用 CLI 单次查询模式：

```bash
hermes chat -q '<structured prompt>'
```

如果启用 profile alias，则用：

```bash
opc-kernel chat -q '<structured prompt>'
```

不要假设不存在的 JSON API。必须通过 adapter 封装，后续可以替换为 Hermes API server / ACP / MCP。

### 7.5 输出格式

HermesAdapter 方法：

```ts
contextPack(input: ContextPackRequest): Promise<ContextPackResult>
reflectTask(capsule: TaskCapsule): Promise<HermesReflectionResult>
```

必须要求 Hermes 返回 JSON：

```ts
export interface ContextPackResult {
  status: "ok" | "fallback" | "error";
  summary: string;
  userPreferences: string[];
  projectContext: string[];
  relevantMemories: string[];
  constraints: string[];
  suggestedSkills: string[];
  confidence: number;
  raw?: string;
}

export interface HermesReflectionResult {
  status: "ok" | "fallback" | "error";
  memoryCandidates: Array<{
    text: string;
    reason: string;
    scope: "user" | "project" | "tool" | "agent" | "skill";
  }>;
  skillPatchCandidates: Array<{
    skillName: string;
    patchSummary: string;
    rationale: string;
    proposedDiff?: string;
  }>;
  newSkillCandidates: Array<{
    name: string;
    description: string;
    rationale: string;
  }>;
  riskNotes: string[];
  confidence: number;
  raw?: string;
}
```

### 7.6 JSON 解析

Hermes 输出可能包含自然语言。实现 robust parser：

- 优先解析 fenced ```json。
- 其次查找第一个 `{` 到最后一个 `}`。
- 失败则返回 `status: fallback`，把 raw 放入 trace。

### 7.7 Hermes 触发规则

Conductor/Bridge 只在以下条件触发 reflection：

```text
- task failed
- user gave negative feedback
- task risk >= S2
- capsule has memoryCandidates
- capsule has skillCandidates
- same intent happened >= 3 times
- user explicitly asks to improve skill/system
```

不要每条普通聊天都调用 Hermes。

---

## 8. Obsidian REST 接入

### 8.1 环境变量

```bash
OBSIDIAN_MODE=rest
OBSIDIAN_REST_URL=https://127.0.0.1:27124
OBSIDIAN_REST_TOKEN=...
OBSIDIAN_VAULT_NAME=...
OBSIDIAN_WRITE_MODE=review_queue_only
```

Bridge 只能返回 redacted token。

### 8.2 Test Endpoint

`POST /api/services/obsidian/test` 做：

- endpoint reachable。
- token valid。
- 能读取基本信息或执行一个安全的 read-only query。
- 失败时返回明确错误：connection refused、unauthorized、TLS/self-signed、plugin not enabled、unknown。

### 8.3 Adapter 能力

新增/完善：

```ts
listNotes(path?: string): Promise<ObsidianNoteSummary[]>
readNote(path: string): Promise<ObsidianNote>
searchNotes(query: string): Promise<ObsidianSearchResult[]>
writeReviewNote(note: ObsidianWriteRequest): Promise<ObsidianWriteResult>
```

第一阶段禁止任意 delete。

### 8.4 写入策略

默认只允许写：

```text
/08_Review_Queue/
/00_Inbox/
```

任何写入 `/03_Projects`、`/05_Ops`、`/06_Drafts`、`/07_Skills` 必须生成审批通知。

### 8.5 UI

Knowledge 页面增加：

- 连接状态。
- Token 未配置引导。
- Vault tree / fallback tree。
- Note preview。
- Search。
- “写入 Review Queue”按钮。

---

## 9. Skill Center 2.0

### 9.1 Skill Registry 数据源

扫描来源：

```text
shared-skills/stable/
shared-skills/experimental/
shared-skills/drafts/
openclaw workspace skills，若存在
Hermes generated skill candidates，若存在
```

不要扫描 external 第三方源码作为用户 Skill。

### 9.2 Skill 状态

```ts
export type SkillLifecycle = "draft" | "experimental" | "stable" | "deprecated";
export type SkillTrust = "local" | "third_party" | "untrusted" | "reviewed";
```

### 9.3 Skill Detail 增强

展示：

- frontmatter。
- markdown body。
- risk。
- owner agent。
- allowed agents。
- usage count。
- last used。
- eval status。
- Hermes patch candidates。
- approve / reject patch。

### 9.4 Hermes patch 不直接合并

Hermes 生成的 Skill patch 写到：

```text
shared-skills/drafts/<skill-name>/patches/<timestamp>.md
```

同时创建通知：

```text
type: skill_patch_review
status: waiting_action
```

用户在 UI approve 后才应用到 experimental/stable。

---

## 10. Chat Center 与 IM 消息同步骨架

### 10.1 Conversation Store

新增：

```text
apps/bridge/src/stores/conversationStore.ts
```

模型：

```ts
export interface Conversation {
  id: string;
  title: string;
  source: "web" | "openclaw" | "telegram" | "wechat" | "slack" | "discord" | "unknown";
  participants: string[];
  createdAt: string;
  updatedAt: string;
  status: "active" | "archived";
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  ts: string;
  role: "user" | "assistant" | "agent" | "system" | "tool";
  source: Conversation["source"];
  authorLabel: string;
  content: string;
  relatedTaskId?: string;
  relatedCapsuleId?: string;
}
```

### 10.2 UI 要求

Chat 页面：

- 左侧 conversation list。
- 中间 message stream。
- 右侧 contextual panel：相关 Agent、Skill、Capsule、Notifications。
- Web 发送的消息进入同一个 conversation store。
- IM 来源的消息通过 event bus 进入 conversation store。

### 10.3 OpenClaw 暂不可用时

如果 Gateway offline：

- Web 仍可发送消息。
- Bridge 创建本地 message event。
- 返回 fallback assistant message。
- 创建一个 capsule draft 或 task candidate。
- UI 明确标注：OpenClaw 未连接，当前为 fallback。

---

## 11. Codex / Claude Code 真实执行前置骨架

### 11.1 默认不执行真实改代码任务

新增：

```bash
CODING_AGENT_REAL_EXEC=0
CODING_AGENT_WORKDIR_ROOT=./data/runtime/worktrees
CODING_AGENT_REQUIRE_APPROVAL=1
```

### 11.2 Run 模型

```ts
export interface CodingAgentRun {
  id: string;
  agent: "codex" | "claudeCode";
  status: "queued" | "running" | "completed" | "failed" | "cancelled" | "waiting_approval";
  repoPath?: string;
  worktreePath?: string;
  branch?: string;
  prompt: string;
  summary?: string;
  changedFiles: string[];
  testResults: string[];
  logsRef?: string;
  createdAt: string;
  updatedAt: string;
}
```

### 11.3 UI

Agent Center / Coding Worker Detail 展示：

- CLI detected。
- auth likely ok / unknown。
- latest run。
- changed files。
- tests。
- approve diff / reject / request changes。

真实执行后续 Phase 再开。当前 Phase 只做安全骨架和 dry-run。

---

## 12. 前端体验要求

保持原有淡色多巴胺 + 液态玻璃风格。

新增组件必须统一：

- 玻璃卡片。
- 柔和渐变。
- 明确状态色。
- 中文优先。
- 空状态友好。
- 错误信息可操作。

新增页面/模块：

```text
Settings / Service Center:
  - 服务状态
  - 启动 OpenClaw Gateway
  - OpenClaw doctor
  - Obsidian token test
  - Hermes provider check

Capsule Detail Drawer:
  - Task Capsule 完整内容
  - Reflection result
  - Approval items

Notification Center:
  - 按类型筛选
  - approve/reject/request changes

Skill Center:
  - patch candidates
  - lifecycle 标签
  - trust/risk 标签
```

---

## 13. 验收标准

必须通过：

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
pnpm format
```

新增测试至少覆盖：

1. OpenClaw Gateway offline 时 health 不崩溃，显示可操作诊断。
2. OpenClaw Gateway command timeout 时返回 error diagnostic。
3. Service Supervisor 可以启动一个短生命周期 test process 并收集日志。
4. Event Bus 能写入和读取 recent events。
5. SSE endpoint 能推送事件。
6. Capsule Store 能创建、读取、patch capsule。
7. Notification action 能产生 event 并更新状态。
8. Hermes JSON parser 能解析 fenced json、裸 json、失败 fallback。
9. Obsidian adapter 在 missing token 时返回 `needs_token`。
10. Chat fallback 会创建 conversation message 和 capsule draft。

E2E 至少验证：

- 打开设置页，能看到本地服务编排和各服务状态。
- 打开通知页，可以审批一条通知。
- 打开对话页，发送中文消息，生成消息和任务胶囊入口。
- 打开 Skill 页，能看到 Skill lifecycle/risk/trust。
- 打开 Knowledge 页，在未配置 token 时显示清晰引导。

---

## 14. 禁止事项

- 不要提交 `external/`。
- 不要提交 token、`.env.local`、运行日志、capsule runtime 数据。
- 不要让 Web 直接拿 Obsidian/OpenClaw/Hermes secret。
- 不要默认 `openclaw gateway --force`。
- 不要默认执行 Codex/Claude Code 真实改代码任务。
- 不要让 Hermes 每次普通聊天都反思。
- 不要把 Hermes patch 直接写进 stable skill。
- 不要引入 n8n/固定 DAG 作为核心编排。
- 不要破坏现有 mock/fallback 可运行性。

---

# Codex 下一轮执行 Prompt

把下面内容直接交给 Codex 执行。

```text
你接手的是 OPC SkillOS Agent Center 项目。当前系统已经完成：前端中文化 mock 驾驶舱、Bridge、本地 service adapter、OpenClaw/Hermes/Obsidian Local REST API 外部源码安装脚本。Web 在 localhost:5174，Bridge 在 localhost:3001。当前 health 显示 Hermes/Obsidian/Codex/Claude 可探测，OpenClaw Gateway offline，因为 Gateway daemon 没启动。

本轮目标：不要继续扩大 mock UI；请把系统推进到“真实服务状态 → Bridge Event Bus → Task Capsule → Notification/Approval → Hermes Reflection 候选”的最小闭环。

请按以下顺序实现，保持小步提交思路，但最终一次性给出完整变更总结和验证结果：

1. Service Supervisor 与服务诊断
- 新增 apps/bridge/src/services/supervisor.ts，用于管理由 Bridge 启动的本地子进程，支持 start/stop/status/log ring buffer。
- 新增 /api/services/status、/api/services/status/deep、/api/services/openclaw/start、/api/services/openclaw/stop、/api/services/openclaw/logs、/api/services/openclaw/doctor、/api/services/obsidian/test、/api/services/hermes/test、/api/services/redacted-config。
- OpenClaw Gateway 启动不要默认 --force；只有 OPENCLAW_GATEWAY_FORCE=1 才添加 --force。只有 OPENCLAW_GATEWAY_ALLOW_UNCONFIGURED=1 才添加 --allow-unconfigured。
- OpenClaw 诊断要归因 daemon_not_running、config_missing、port_not_listening、pairing_required、token_mismatch、cli_missing、command_timeout、unknown。

2. Bridge Event Bus + SSE
- 新增 packages/shared/src/events.ts，定义标准 OpcEvent 类型。
- 新增 Bridge 内部 eventBus，支持 publish、recent、JSONL 持久化到 data/runtime/events.jsonl。
- 新增 GET /api/events/stream 和 GET /api/events/recent。
- Web 不直接连 OpenClaw，统一从 Bridge SSE 接收事件。

3. Task Capsule 1.0
- 新增 packages/shared/src/capsule.ts，按规格定义 TaskCapsule。
- 新增 apps/bridge/src/stores/capsuleStore.ts，持久化到 data/runtime/capsules/*.json。
- 新增 GET /api/capsules、GET /api/capsules/:id、POST /api/capsules、PATCH /api/capsules/:id、POST /api/capsules/:id/reflect。
- Chat fallback 发送消息时也要创建 conversation message 和 capsule draft。

4. Notification / Approval Center 2.0
- 增强通知模型，支持 unread、waiting_action、resolved、rejected、changes_requested、archived。
- 通知 action 支持 approve、reject、request_changes、archive、open_capsule。
- 每次通知动作都 publish event。
- UI 通知页增加筛选和 capsule 跳转。

5. Hermes Bridge 最小真实能力
- 新增 HERMES_REAL_EXEC=0 默认关闭。开启且 provider 可用时，使用 hermes chat -q 做 context_pack 和 reflect_task。
- 新增 Hermes JSON parser，支持 fenced json、裸 json、失败 fallback。
- 新增 contextPack 和 reflectTask 方法，返回结构化结果。
- 不要让 Hermes 每条普通聊天都运行；只在 POST /api/capsules/:id/reflect 或明确触发时运行。
- Hermes reflection 结果生成 memory candidate / skill patch candidate 通知，但不要自动应用。

6. Obsidian REST 接入骨架
- 新增 OBSIDIAN_REST_URL、OBSIDIAN_REST_TOKEN、OBSIDIAN_WRITE_MODE=review_queue_only。
- /api/services/obsidian/test 能识别 needs_token、connection_refused、unauthorized、plugin_not_enabled、unknown。
- Knowledge 页面在 token 未配置时显示安装与配置引导；配置可用时至少能 read-only 测试。
- 不要实现 delete。

7. Skill Center 2.0
- Skill 增加 lifecycle、trust、risk、owner agent、usage count、eval status、Hermes patch candidates 展示。
- Hermes patch candidate 只能写入 drafts/patches 或 notification，不得直接改 stable skill。

8. Chat Center 同步骨架
- 新增 conversationStore，定义 Conversation 与 ConversationMessage。
- Web 发送消息进入 conversationStore，publish chat.message.created。
- Gateway offline 时返回 fallback，但要明确标注 fallback，并生成 capsule draft。

9. 测试和验收
- 新增 unit tests 覆盖 supervisor、eventBus、capsuleStore、notification actions、Hermes JSON parser、Obsidian missing token、OpenClaw command timeout。
- 更新 e2e：设置页服务状态、通知审批、中文消息发送、capsule 入口、Knowledge 未配置 token 引导、Skill lifecycle/risk/trust 展示。
- 最后必须运行并通过：pnpm install --frozen-lockfile、pnpm typecheck、pnpm lint、pnpm test、pnpm build、pnpm test:e2e、pnpm format。

约束：
- 不要提交 external/、runtime 数据、token、.env.local。
- 不要让前端持有 secret。
- 不要默认真实执行 Codex/Claude Code 改代码。
- 不要引入 n8n 或固定 DAG 工作流。
- 保持现有 mock/fallback 可运行。
- 保持中文 UI 和淡色多巴胺液态玻璃审美。

完成后，请输出：
1. 改了哪些文件。
2. 新增了哪些 API。
3. 真实服务接入状态。
4. 还需要用户手动完成的授权/配置。
5. 所有验证命令结果。
```

---

## 15. 用户手动配置清单

在 Codex 完成 Phase 2 后，用户仍需要手动完成：

### 15.1 OpenClaw

```bash
openclaw setup
# 或
openclaw onboard --mode local
openclaw gateway --port 18789
openclaw gateway status
openclaw doctor
```

如果 Control UI 或 Agent Center 连接需要配对：

```bash
openclaw devices list
openclaw devices approve <requestId>
```

### 15.2 Hermes

```bash
hermes model
hermes config check
hermes doctor
```

可选 profile：

```bash
hermes profile create opc-kernel --clone
opc-kernel setup
opc-kernel chat -q "hello"
```

### 15.3 Obsidian

把构建好的插件文件复制到 vault：

```text
<YourVault>/.obsidian/plugins/obsidian-local-rest-api/
  main.js
  manifest.json
  styles.css
```

然后在 Obsidian：

```text
Settings → Community plugins → Local REST API → Enable → Copy API key
```

在项目 `.env.local` 或启动环境里配置：

```bash
OBSIDIAN_MODE=rest
OBSIDIAN_REST_URL=https://127.0.0.1:27124
OBSIDIAN_REST_TOKEN=...
```

---

## 16. Phase 2 完成后的下一阶段

Phase 3 才做真正 Agent 编排：

```text
OpenClaw Gateway WS 事件真实订阅
OPC Conductor Agent
Skill selector
Risk classifier
Subagent dispatch
Codex/Claude Code worktree 安全执行
Obsidian Review Queue 写入
Hermes Skill Patch 审核应用
```

Phase 2 的成功标准不是“Agent 已全自动干活”，而是“系统已经能真实接入、真实观察、真实记录、真实审批、真实反思”。
