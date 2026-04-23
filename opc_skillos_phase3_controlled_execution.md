# OPC SkillOS Agent Center：Phase 3 可控执行闭环执行规格

> 适用状态：Phase 2 已完成 `@opc/shared`、Bridge SSE Event Bus、Capsule Store、Conversation Store、Service Supervisor、OpenClaw/Hermes/Obsidian 诊断 API、通知状态机、中文 Service Center、Chat 关联 Capsule、Skill 生命周期展示等基础能力。当前系统已经具备“真实可观测底座”，Phase 3 的目标是推进到“可控执行底座”：让 Skill、Agent 派发、审批、Codex/Claude Code 执行、Obsidian 写入、Hermes 反思形成最小真实闭环。

---

## 0. 当前状态判断

根据本轮 Codex 总结，当前系统状态如下：

- Web + Bridge 可运行。
- Bridge 已有 SSE 事件流、recent events、JSONL 持久化。
- Bridge 已有 Capsule Store，支持 CRUD 与 `data/runtime/capsules/*.json` 持久化。
- Chat 发送会生成 conversation event 和 capsule draft。
- Notification Center 已支持 `resolved` / `rejected` / `changes_requested` / `archived` 状态机。
- OpenClaw CLI 已安装并可诊断，但 Gateway pairing/auth 仍需用户配置。
- Hermes CLI 已安装并可诊断，真实执行受 `HERMES_REAL_EXEC=1` 和 provider/profile 配置控制。
- Obsidian Local REST API 插件已构建，但真实 vault 插件安装、token 配置仍需用户操作。
- Codex / Claude Code CLI 可探测，但真实执行仍在 feature flag 后。
- 所有基础验证已通过：`pnpm install --frozen-lockfile`、`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`、`pnpm test:e2e`、`pnpm format`。

Phase 2 已经解决了“看得到、记录得到、诊断得到”。Phase 3 要解决：

```text
用户在 Chat / IM / 面板中提出任务
  → OPC Conductor 识别意图与风险
  → 选择 Skill 或派发 Agent
  → 低风险任务可控执行
  → 高风险任务进入 Approval Center
  → Codex / Claude Code 在隔离工作区执行
  → 产出 Task Capsule、diff、日志、测试结果
  → Hermes 低成本读取 Capsule 进行反思
  → 生成 memory candidate / skill patch candidate
  → 用户在通知中心审核
```

---

## 1. Phase 3 总目标

### 1.1 一句话目标

把系统从“真实可观测驾驶舱”推进到“可控执行型 OPC 中枢”：

```text
Skill Registry
  → Skill Run
  → Agent Dispatch
  → Approval Gate
  → Coding Agent Run
  → Task Capsule
  → Hermes Reflection
  → Skill / Memory Candidate Review
```

### 1.2 本阶段必须完成的能力

1. **Skill Registry 1.0**
   从本地目录扫描 Skill，解析 metadata，展示生命周期、风险、owner agent、依赖、eval 状态。

2. **Skill Run 0.1**
   支持安全、可审计、可回滚的 Skill 执行骨架。先支持内置安全 Skill 和 dry-run，不允许随便执行第三方脚本。

3. **OPC Conductor Dispatch 0.1**
   支持从 Chat / UI 派发任务给指定 Agent 或 Skill，生成 `AgentRun` / `SkillRun` / `TaskCapsule`。

4. **Approval Gate 2.0**
   高风险动作必须先生成 approval ticket，用户批准后才能执行。

5. **Codex / Claude Code 真实执行闭环 0.1**
   在 feature flag 和 sandbox workspace 下，让 Codex / Claude Code 执行一个受控任务，产出 diff、测试结果、日志和 capsule。默认不 merge、不 push、不部署。

6. **Hermes Reflection Loop 0.1**
   对完成的 capsule 进行低成本反思，生成 memory candidate 和 skill patch candidate，但不自动写入 stable memory/skill。

7. **Obsidian Review Queue 写入 0.1**
   如果用户配置真实 Obsidian REST token，则允许低风险内容写入 Obsidian 的 Review Queue；否则继续 mock/fallback。

8. **UI 执行可视化**
   在 Agent Center / Skill Center / Chat / Notification Center 中清晰展示任务执行、审批、日志、diff、Hermes 候选变更。

---

## 2. 严格非目标

Phase 3 不做这些事情：

- 不引入 n8n、Temporal、Airflow 或类似固定 DAG 工作流作为核心编排。
- 不让 HermesAgent 做常驻主 Agent，也不让 Hermes 全程旁听所有任务。
- 不自动发布文章、发送邮件、发送 IM、合并 PR、push 代码或部署生产。
- 不让 Codex / Claude Code 直接修改用户任意目录。
- 不自动执行 S3/S4 高风险动作。
- 不把 Obsidian token、Hermes provider key、OpenClaw auth 信息暴露给 Web 前端。
- 不自动安装或执行第三方 unknown skill 脚本。
- 不把 mock/fallback 删除；真实服务不可用时仍需可演示、可测试。

---

## 3. 架构定位

### 3.1 Phase 3 后的系统链路

```text
Web / IM / Chat
  ↓
Bridge Conversation Store
  ↓
OPC Conductor Adapter
  ↓
Intent + Risk + Skill Selection
  ↓
┌───────────────────────┬───────────────────────┐
│ Low Risk Skill Run     │ High Risk Approval     │
└──────────┬────────────┴──────────┬────────────┘
           ↓                       ↓
     Skill Runner            Notification Center
           ↓                       ↓ approve
     Agent / Tool Run         Controlled Execution
           ↓                       ↓
     Capsule Store ←───────────────┘
           ↓
     Hermes Reflection Candidate
           ↓
     Memory / Skill Patch Review
```

### 3.2 OpenClaw 与内部 Bridge 的分工

- **OpenClaw**：长期目标仍是入口、多通道、Gateway、subagents、tools、skills 的真实运行环境。
- **Bridge**：当前阶段作为本地可信控制面，负责服务诊断、事件总线、审批、capsule、UI API、adapter 汇聚。
- **OPC Conductor**：Phase 3 先作为 Bridge 内部 orchestration service 实现，后续可以迁移或映射到 OpenClaw Agent / Skill。
- **HermesAgent**：不参与每个 token 的在线执行，只做 `context_pack`、`reflect_task`、`propose_skill`、`patch_skill`。
- **Codex / Claude Code**：作为 coding worker，被 Dev Operator / Conductor 有边界地调用。

---

## 4. 新增核心数据模型

所有新模型优先放进 `@opc/shared`，用 Zod schema + TypeScript type 双输出。Bridge 和 Web 都必须复用 shared schema。

### 4.1 SkillDescriptorV1

```ts
export const SkillDescriptorV1Schema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(""),
  version: z.string().default("0.0.0"),
  path: z.string(),
  source: z.enum(["workspace", "shared", "personal", "external", "mock"]),
  lifecycle: z.enum(["draft", "experimental", "stable", "deprecated"]),
  trust: z.enum(["trusted", "review_required", "untrusted", "blocked"]),
  domain: z.enum([
    "core",
    "knowledge",
    "research",
    "coding",
    "ops",
    "publishing",
    "learning",
    "memory",
    "unknown",
  ]),
  ownerAgent: z.string().optional(),
  risk: z.enum(["S0", "S1", "S2", "S3", "S4"]),
  approvalRequired: z.boolean(),
  reads: z.array(z.string()).default([]),
  writes: z.array(z.string()).default([]),
  requires: z
    .object({
      bins: z.array(z.string()).default([]),
      env: z.array(z.string()).default([]),
      services: z.array(z.string()).default([]),
    })
    .default({ bins: [], env: [], services: [] }),
  capabilities: z.array(z.string()).default([]),
  evalStatus: z.enum(["none", "passing", "failing", "unknown"]).default("none"),
  usage: z
    .object({
      totalRuns: z.number().int().nonnegative().default(0),
      successRuns: z.number().int().nonnegative().default(0),
      lastRunAt: z.string().optional(),
    })
    .default({ totalRuns: 0, successRuns: 0 }),
  frontmatter: z.record(z.unknown()).default({}),
  updatedAt: z.string(),
});
```

### 4.2 SkillRunV1

```ts
export const SkillRunV1Schema = z.object({
  id: z.string(),
  skillId: z.string(),
  taskId: z.string().optional(),
  capsuleId: z.string().optional(),
  requestedBy: z.string().default("user"),
  agentId: z.string().optional(),
  mode: z.enum(["dry_run", "preview", "execute"]),
  status: z.enum([
    "queued",
    "waiting_approval",
    "running",
    "succeeded",
    "failed",
    "cancelled",
    "blocked",
  ]),
  risk: z.enum(["S0", "S1", "S2", "S3", "S4"]),
  input: z.record(z.unknown()).default({}),
  output: z.record(z.unknown()).default({}),
  events: z.array(z.string()).default([]),
  logsPath: z.string().optional(),
  approvalId: z.string().optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  error: z.string().optional(),
});
```

### 4.3 ApprovalRequestV1

```ts
export const ApprovalRequestV1Schema = z.object({
  id: z.string(),
  kind: z.enum([
    "skill_run",
    "coding_run",
    "obsidian_write",
    "publish_draft",
    "memory_update",
    "skill_patch",
    "ops_action",
  ]),
  status: z.enum([
    "waiting_action",
    "approved",
    "rejected",
    "changes_requested",
    "resolved",
    "archived",
    "expired",
  ]),
  title: z.string(),
  summary: z.string(),
  risk: z.enum(["S0", "S1", "S2", "S3", "S4"]),
  requestedBy: z.string(),
  related: z
    .object({
      taskId: z.string().optional(),
      capsuleId: z.string().optional(),
      skillRunId: z.string().optional(),
      codingRunId: z.string().optional(),
      hermesCandidateId: z.string().optional(),
    })
    .default({}),
  proposedAction: z.object({
    label: z.string(),
    commandPreview: z.string().optional(),
    filesTouched: z.array(z.string()).default([]),
    diffPreview: z.string().optional(),
    reversible: z.boolean().default(false),
    rollbackPlan: z.string().optional(),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
  expiresAt: z.string().optional(),
});
```

### 4.4 AgentRunV1

```ts
export const AgentRunV1Schema = z.object({
  id: z.string(),
  agentId: z.string(),
  parentRunId: z.string().optional(),
  taskId: z.string(),
  capsuleId: z.string().optional(),
  status: z.enum([
    "queued",
    "running",
    "waiting_approval",
    "blocked",
    "succeeded",
    "failed",
    "cancelled",
  ]),
  goal: z.string(),
  assignedSkills: z.array(z.string()).default([]),
  children: z.array(z.string()).default([]),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  summary: z.string().optional(),
  error: z.string().optional(),
});
```

### 4.5 CodingRunV1

```ts
export const CodingRunV1Schema = z.object({
  id: z.string(),
  provider: z.enum(["codex", "claude_code"]),
  status: z.enum([
    "queued",
    "waiting_approval",
    "running",
    "succeeded",
    "failed",
    "cancelled",
    "blocked",
  ]),
  repoPath: z.string(),
  workspacePath: z.string(),
  branchName: z.string().optional(),
  worktreePath: z.string().optional(),
  prompt: z.string(),
  model: z.string().optional(),
  timeoutMs: z.number().int().positive(),
  stdoutPath: z.string().optional(),
  stderrPath: z.string().optional(),
  diffPath: z.string().optional(),
  changedFiles: z.array(z.string()).default([]),
  testCommand: z.string().optional(),
  testStatus: z.enum(["not_run", "passed", "failed", "skipped"]).default("not_run"),
  approvalId: z.string().optional(),
  capsuleId: z.string().optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  error: z.string().optional(),
});
```

### 4.6 HermesCandidateV1

```ts
export const HermesCandidateV1Schema = z.object({
  id: z.string(),
  kind: z.enum(["memory_update", "skill_patch", "new_skill", "user_profile_update"]),
  status: z.enum(["draft", "waiting_review", "approved", "rejected", "applied", "archived"]),
  sourceCapsuleId: z.string(),
  title: z.string(),
  rationale: z.string(),
  content: z.string(),
  targetPath: z.string().optional(),
  patch: z.string().optional(),
  risk: z.enum(["S0", "S1", "S2", "S3", "S4"]).default("S1"),
  createdAt: z.string(),
  updatedAt: z.string(),
});
```

---

## 5. 新增事件类型

`OpcEvent` 需要扩展，至少支持以下事件类型：

```text
skill.registry.scanned
skill.run.created
skill.run.waiting_approval
skill.run.started
skill.run.completed
skill.run.failed

agent.run.created
agent.run.started
agent.run.completed
agent.run.failed

approval.created
approval.approved
approval.rejected
approval.changes_requested
approval.expired

coding.run.created
coding.run.waiting_approval
coding.run.started
coding.run.completed
coding.run.failed

obsidian.note.preview_created
obsidian.note.write_requested
obsidian.note.written
obsidian.note.write_failed

hermes.reflection.requested
hermes.reflection.completed
hermes.candidate.created
hermes.candidate.approved
hermes.candidate.rejected

capsule.created
capsule.updated
capsule.completed
```

所有事件必须包含：

```ts
{
  id: string;
  type: string;
  ts: string;
  source: string;
  severity: "debug" | "info" | "warning" | "error";
  summary: string;
  related?: {
    taskId?: string;
    capsuleId?: string;
    skillRunId?: string;
    agentRunId?: string;
    codingRunId?: string;
    approvalId?: string;
  };
  payload?: Record<string, unknown>;
}
```

---

## 6. 文件与持久化结构

在不引入数据库的前提下，继续使用 `data/runtime` 文件系统持久化。

```text
data/runtime/
  events/
    events-YYYY-MM-DD.jsonl
  capsules/
    <capsuleId>.json
  conversations/
    <conversationId>.json
  skills/
    registry-cache.json
    runs/
      <skillRunId>.json
  agents/
    runs/
      <agentRunId>.json
  approvals/
    <approvalId>.json
  coding-runs/
    <codingRunId>/
      run.json
      stdout.log
      stderr.log
      diff.patch
      changed-files.json
  hermes/
    candidates/
      <candidateId>.json
    reflections/
      <capsuleId>.json
  obsidian/
    previews/
      <previewId>.md
```

不要把 token、API key、provider key、OpenClaw auth 文件复制进 `data/runtime`。

---

## 7. Skill Registry 1.0

### 7.1 扫描目录

支持通过环境变量配置 Skill 根目录：

```bash
OPC_SKILL_ROOTS="./shared-skills/stable:./shared-skills/experimental:./openclaw/workspace/skills"
```

默认扫描：

```text
shared-skills/stable/
shared-skills/experimental/
openclaw/workspace/skills/
```

如果目录不存在，不报错，返回 warning event。

### 7.2 支持的 Skill 目录结构

```text
some-skill/
  SKILL.md
  README.md                 optional
  scripts/                  optional，默认不执行
  templates/                optional
  evals/                    optional
    cases.json
```

### 7.3 frontmatter 解析规则

优先读取 `SKILL.md` YAML frontmatter：

```yaml
---
name: capture-webpage-to-obsidian
description: Save a webpage into Obsidian Review Queue.
version: 0.1.0
metadata:
  opc:
    domain: knowledge
    risk: S2
    owner_agent: knowledge-curator
    approval_required: false
    lifecycle: stable
    trust: trusted
    reads:
      - "web:public"
    writes:
      - "obsidian:/08_Review_Queue"
    capabilities:
      - "obsidian.write.review_queue"
---
```

如果 frontmatter 缺失字段：

- `domain = unknown`
- `risk = S3`
- `approvalRequired = true`
- `lifecycle = draft`
- `trust = review_required`

### 7.4 API

新增或完善：

```http
GET  /api/skills
GET  /api/skills/:skillId
POST /api/skills/rescan
GET  /api/skills/:skillId/readme
GET  /api/skills/:skillId/source
```

返回值必须用 `SkillDescriptorV1Schema` 校验。

### 7.5 UI

Skill Center 要新增：

- 搜索。
- domain 过滤。
- risk 过滤。
- lifecycle 过滤。
- trust 过滤。
- owner agent 过滤。
- eval 状态展示。
- last run / success rate。
- Skill Detail 中展示：
  - metadata。
  - `SKILL.md` 预览。
  - 依赖检查结果。
  - 近期 runs。
  - Hermes patch candidates。

---

## 8. Skill Run 0.1

### 8.1 原则

Phase 3 不允许默认执行任意 Skill 中的脚本。Skill Run 先支持三类安全模式：

1. `dry_run`：只解析 Skill，生成执行计划，不做写操作。
2. `preview`：生成输出预览，例如 Obsidian note preview、coding prompt preview。
3. `execute`：只允许内置 allowlist runner 执行，不执行第三方 arbitrary scripts。

### 8.2 内置 allowlist runner

Phase 3 只实现这些 runner：

```text
builtin.echo
builtin.create_task_capsule
builtin.obsidian_review_note
builtin.hermes_reflect_capsule
builtin.codex_controlled_run
builtin.claude_code_controlled_run
```

Skill metadata 可以声明：

```yaml
metadata:
  opc:
    runner: builtin.obsidian_review_note
```

没有 runner 的 Skill 只能 dry-run / preview，不能 execute。

### 8.3 API

```http
POST /api/skills/:skillId/run
GET  /api/skill-runs
GET  /api/skill-runs/:runId
POST /api/skill-runs/:runId/cancel
```

请求示例：

```json
{
  "mode": "preview",
  "input": {
    "title": "AI Agent 今日观察",
    "content": "...",
    "target": "obsidian:/08_Review_Queue"
  },
  "requestedBy": "user",
  "agentId": "knowledge-curator"
}
```

### 8.4 风险门控

执行前必须检查：

```text
if risk in S3/S4 or approvalRequired=true:
  create approval
  status = waiting_approval
  do not execute
else:
  execute
```

S2 写入 Obsidian Review Queue 可以自动执行，但必须：

- 只能写 `/08_Review_Queue` 或配置允许的 review path。
- 不能 delete。
- 不能覆盖已有笔记，除非显式 `overwrite=false` 且自动生成唯一文件名。
- 必须生成 capsule 和 event。

---

## 9. OPC Conductor Dispatch 0.1

### 9.1 目标

让 Chat 消息可以转化为结构化任务，而不是只生成 conversation event 和 draft capsule。

### 9.2 最小意图识别

先实现规则式 intent，不急着调用 LLM：

```text
包含 /skill <skillId>         → 直接运行指定 Skill
包含 @<agentId>               → 派发给指定 Agent
包含 “保存到知识库/入库/Obsidian” → knowledge intent
包含 “让 Codex/写代码/改代码”     → coding intent
包含 “反思/总结经验/沉淀技能”     → hermes reflection intent
否则                           → general chat intent
```

### 9.3 API

```http
POST /api/conductor/dispatch
GET  /api/agent-runs
GET  /api/agent-runs/:runId
```

请求：

```json
{
  "message": "@dev-operator 让 Codex 给当前仓库增加一个健康检查测试",
  "conversationId": "conv-main",
  "source": "web",
  "context": {
    "repoPath": "/absolute/path/to/repo"
  }
}
```

返回：

```json
{
  "agentRun": { "...": "AgentRunV1" },
  "capsule": { "...": "TaskCapsuleV1" },
  "events": ["event-id-1", "event-id-2"],
  "nextAction": "waiting_approval | running | completed | blocked"
}
```

### 9.4 Chat Center 集成

Chat 输入框支持：

```text
/skill capture-webpage-to-obsidian 保存这个网页：https://example.com
@knowledge-curator 把这段内容保存到知识库 Review Queue
@dev-operator 让 Codex 看一下这个 repo 的测试问题
@hermes 反思最近这个 capsule
```

消息发送后 UI 要显示：

- 关联 capsule。
- 关联 agent run。
- 当前状态。
- 如果需要审批，展示“去通知中心审批”。

---

## 10. Approval Gate 2.0

### 10.1 目标

审批中心不只是通知列表，而是所有高风险动作的集中 gate。

### 10.2 必须支持的审批类型

```text
skill_run
coding_run
obsidian_write
memory_update
skill_patch
ops_action
publish_draft
```

Phase 3 至少实现：

- `coding_run`
- `skill_run`
- `obsidian_write`
- `memory_update`
- `skill_patch`

### 10.3 API

```http
GET  /api/approvals
GET  /api/approvals/:approvalId
POST /api/approvals/:approvalId/approve
POST /api/approvals/:approvalId/reject
POST /api/approvals/:approvalId/request-changes
POST /api/approvals/:approvalId/archive
```

注意：当前已有 `/api/notifications/:id/act`。可以保留兼容，但 Phase 3 应新增 approvals 语义层。Notification 可以引用 ApprovalRequest。

### 10.4 UI 要求

Approval detail drawer 必须展示：

- 风险等级。
- proposed action。
- command preview。
- affected files。
- diff preview。
- reversible。
- rollback plan。
- related capsule。
- related skill/coding run。
- approve / reject / request changes。

---

## 11. Codex / Claude Code 真实执行闭环 0.1

### 11.1 Feature flag

真实执行必须默认关闭。

```bash
CODING_AGENT_REAL_EXEC=0
CODING_AGENT_ALLOWED_ROOTS=""
CODING_AGENT_WORKSPACE_ROOT="./data/runtime/workspaces"
CODING_AGENT_MAX_TIMEOUT_MS=600000
CODING_AGENT_ALLOW_PUSH=0
CODING_AGENT_ALLOW_DEPLOY=0
```

只有满足：

```text
CODING_AGENT_REAL_EXEC=1
repoPath 位于 CODING_AGENT_ALLOWED_ROOTS 中
用户批准 coding_run approval
```

才允许执行真实 Codex / Claude Code。

### 11.2 执行约束

真实执行必须：

- 在 `CODING_AGENT_WORKSPACE_ROOT` 下创建隔离工作区。
- 优先使用 `git worktree` 或 repo copy。
- 不直接修改原始 repo，除非明确配置允许。
- 不允许自动 push。
- 不允许自动 merge。
- 不允许自动 deploy。
- 捕获 stdout/stderr。
- 执行后生成 diff。
- 可选执行 test command。
- 产出 CodingRunV1、TaskCapsuleV1、事件和通知。

### 11.3 Codex prompt 包装

Bridge 不应把用户原话裸传给 Codex。需要包装成受控 prompt：

```text
你是被 OPC SkillOS 调用的 coding worker。
你只能在当前工作区完成任务。
不要读取工作区之外的文件。
不要提交、push、部署或删除用户数据。
完成后说明：
1. 修改了什么
2. 涉及哪些文件
3. 如何验证
4. 风险和后续建议

用户任务：
<task>
```

### 11.4 API

```http
POST /api/coding-runs
GET  /api/coding-runs
GET  /api/coding-runs/:runId
GET  /api/coding-runs/:runId/logs/stdout
GET  /api/coding-runs/:runId/logs/stderr
GET  /api/coding-runs/:runId/diff
POST /api/coding-runs/:runId/cancel
```

### 11.5 UI

新增或完善 Coding Run drawer：

- provider：Codex / Claude Code。
- repo path。
- workspace path。
- status。
- prompt preview。
- stdout/stderr tabs。
- changed files。
- diff viewer。
- test status。
- capsule link。
- approval link。

### 11.6 MVP 验收场景

在一个允许根目录下创建测试 repo：

```text
tmp/demo-repo
  package.json
  src/math.ts
  src/math.test.ts
```

用户在 Chat 中输入：

```text
@dev-operator 让 Codex 给 demo repo 增加一个 add 函数测试，并确保测试通过
```

期望：

```text
1. 生成 coding_run approval。
2. 用户批准后运行 Codex。
3. 在隔离工作区产生修改。
4. 生成 diff.patch。
5. 如果 test command 配置存在，执行测试。
6. 生成 capsule。
7. Notification Center 显示“代码执行完成，等待审查 diff”。
```

---

## 12. Hermes Reflection Loop 0.1

### 12.1 调用时机

不要全程调用 Hermes。只在这些情况下调用：

- 用户显式输入 `@hermes 反思 ...`。
- capsule 状态为 completed，且 `reflectionRequested=true`。
- 任务失败且失败原因可复用。
- 用户对结果点了“沉淀经验”。
- Skill run / coding run 完成后，Conductor 判断存在 skill/memory candidate。

### 12.2 Hermes 输入

Hermes 只能收到低成本上下文：

```json
{
  "capsule": "TaskCapsuleV1",
  "relatedRuns": {
    "skillRuns": ["summary only"],
    "codingRuns": ["summary + changedFiles + testStatus"],
    "events": ["last 20 related events"]
  },
  "instruction": "请只输出 JSON，包含 memory_candidates 和 skill_patch_candidates。不要执行任何外部动作。"
}
```

不要把完整 stdout/stderr、完整 diff、完整网页、完整 Obsidian vault 直接发给 Hermes。

### 12.3 Hermes 输出 schema

```ts
export const HermesReflectionOutputSchema = z.object({
  summary: z.string(),
  memoryCandidates: z
    .array(
      z.object({
        title: z.string(),
        rationale: z.string(),
        content: z.string(),
        target: z.enum(["USER", "MEMORY", "PROJECT", "OPS"]),
      }),
    )
    .default([]),
  skillPatchCandidates: z
    .array(
      z.object({
        skillId: z.string(),
        rationale: z.string(),
        patch: z.string(),
      }),
    )
    .default([]),
  newSkillCandidates: z
    .array(
      z.object({
        name: z.string(),
        rationale: z.string(),
        draft: z.string(),
      }),
    )
    .default([]),
  confidence: z.number().min(0).max(1).default(0.5),
});
```

Hermes adapter 已有 robust JSON parser；Phase 3 要把 parser 输出转成 HermesCandidateV1 并进入审核中心。

### 12.4 API

```http
POST /api/hermes/reflect/:capsuleId
GET  /api/hermes/candidates
GET  /api/hermes/candidates/:candidateId
POST /api/hermes/candidates/:candidateId/approve
POST /api/hermes/candidates/:candidateId/reject
POST /api/hermes/candidates/:candidateId/archive
```

### 12.5 应用候选的规则

Phase 3 默认只做：

```text
candidate → approval → approved status
```

不要自动写入 Hermes Memory 或 stable Skill。最多允许把 approved candidate 写入：

```text
data/runtime/hermes/approved-candidates/
```

真正 apply 到 `MEMORY.md`、`USER.md`、`SKILL.md` 留到 Phase 4。

---

## 13. Obsidian Review Queue 写入 0.1

### 13.1 真实模式要求

配置：

```bash
OBSIDIAN_MODE=rest
OBSIDIAN_REST_BASE_URL=http://127.0.0.1:27123
OBSIDIAN_REST_TOKEN=...
OBSIDIAN_REVIEW_QUEUE_PATH=08_Review_Queue
```

前端永远不显示 token。

### 13.2 API

```http
GET  /api/obsidian/status
GET  /api/obsidian/vault/tree?path=...
GET  /api/obsidian/notes?path=...
POST /api/obsidian/review-notes/preview
POST /api/obsidian/review-notes/write
```

### 13.3 写入限制

Phase 3 只允许写入 Review Queue：

```text
/08_Review_Queue/<yyyy-mm-dd>-<slug>.md
```

规则：

- 不删除。
- 不覆盖。
- 不移动。
- 不改已有 note。
- 只创建新 review note。
- 生成 preview 后再写入。
- 写入事件必须进入 event bus。
- 写入结果必须关联 capsule。

### 13.4 Review note 模板

```markdown
---
type: review_note
source: opc-skillos
created: <iso>
capsule_id: <capsuleId>
skill_run_id: <skillRunId>
status: pending_review
tags:
  - opc/review
---

# <title>

## 来源

- Capsule: <capsuleId>
- Skill Run: <skillRunId>

## 内容

<content>

## 待审核事项

- [ ] 内容是否准确
- [ ] 是否需要移动到正式目录
- [ ] 是否需要创建双链
```

---

## 14. UI 改造要求

### 14.1 Command Center

新增：

- 今日 Skill runs 数。
- 待审批数量。
- Coding runs 状态。
- Hermes candidates 数。
- 最近 capsule 完成率。
- Service Center quick status。

### 14.2 Agent Center

Agent graph 上要能看到：

```text
OPC Conductor
  → Knowledge Curator
  → Dev Operator
  → Hermes Kernel
  → Codex Worker
  → Claude Code Worker
```

点击节点展示：

- 当前 runs。
- 近期 capsules。
- 可用 skills。
- 最后一次事件。
- 健康状态。

### 14.3 Skill Center

新增：

- registry scan 按钮。
- run skill 按钮。
- dry-run / preview / execute 模式。
- skill run 历史。
- Hermes patch candidate 区域。

### 14.4 Chat Center

新增：

- `/skill` 自动补全可以后置，Phase 3 先支持文本命令。
- 发送消息后显示 associated capsule。
- 如果等待审批，显示审批卡片。
- 如果执行中，显示状态 timeline。
- 如果完成，显示 capsule summary。

### 14.5 Notification / Approval Center

改造成两个层级：

```text
Notifications = 所有消息流
Approvals = 需要用户决策的事项
```

可以在同一个页面里做 tabs：

- 全部通知
- 待审批
- 代码审查
- Skill 变更
- Memory 候选
- Obsidian Review
- 失败/告警

### 14.6 Knowledge Panel

新增：

- Obsidian REST 状态。
- Review Queue path。
- 最近写入的 review notes。
- 预览内容。
- 关联 capsule。

---

## 15. 安全要求

### 15.1 路径安全

所有用户传入 path 必须：

- resolve 成绝对路径。
- 检查是否在 allowed roots 下。
- 禁止 `..` 越界。
- 禁止 symlink escape，尽可能检测真实路径。

### 15.2 命令安全

Bridge 不提供任意 shell API。

Codex/Claude Code 执行只允许：

- 通过 adapter 内部构造 command。
- 参数数组形式调用，不拼接 shell string。
- timeout。
- stdout/stderr 限长或落盘。
- 环境变量白名单。

### 15.3 Secret redaction

所有 logs、events、capsules、doctor output 都要 redaction：

```text
OPENAI_API_KEY
ANTHROPIC_API_KEY
OBSIDIAN_REST_TOKEN
HERMES_*_KEY
*_TOKEN
*_SECRET
*_PASSWORD
```

### 15.4 风险等级

继续使用：

```text
S0 纯展示/总结
S1 公开读取/搜索
S2 写入本地 review queue / 生成草稿
S3 调用外部发送、改代码、执行 coding agent
S4 删除、部署、生产变更、密钥、支付、数据库写入
```

S3/S4 必须 approval。

---

## 16. 测试要求

### 16.1 Unit tests

新增测试：

```text
@opc/shared schemas
skill registry parser
skill risk defaulting
approval state transition
coding allowed root validation
path escape prevention
hermes reflection parser
obsidian review note filename generation
event bus emission
capsule linkage
```

### 16.2 Integration tests

新增：

```text
POST /api/skills/rescan returns descriptors
POST /api/skills/:id/run dry_run creates SkillRun + event
S3 skill run creates approval and does not execute
approve approval resumes pending run
chat /skill command creates capsule
hermes reflect mock creates candidates
obsidian preview creates preview file
coding run with real flag off returns blocked or mock fallback
```

### 16.3 E2E tests

新增中文 smoke：

1. 打开 Skill Center，能看到 Skill 列表和风险标签。
2. 运行一个 dry-run Skill，能看到运行记录。
3. 在 Chat 输入 `/skill builtin-echo 测试任务`，能看到 capsule。
4. 发起一个 coding task，看到待审批通知。
5. 批准后，在 mock/fallback 下看到 coding run 完成。
6. 打开 Hermes candidates 页面，能看到 mock reflection candidate。

所有旧测试必须继续通过。

---

## 17. MVP 演示脚本

Phase 3 完成后，必须能演示以下三条链路。

### 17.1 Skill 执行链路

```text
用户：/skill builtin-echo 生成一个测试 capsule
系统：创建 SkillRun → 创建 Capsule → Event Bus → UI 展示完成
```

### 17.2 Obsidian Review Queue 链路

```text
用户：@knowledge-curator 把这段内容保存到知识库 Review Queue
系统：生成 preview → 若 OBISIDIAN_MODE=rest 且 token 可用则写入 → Capsule → Notification
```

### 17.3 Coding Agent 审批链路

```text
用户：@dev-operator 让 Codex 修改 demo repo 的测试
系统：创建 CodingRun approval → 用户批准 → 受控执行或 fallback → diff/log/test/capsule → 通知中心审查
```

### 17.4 Hermes 反思链路

```text
用户：@hermes 反思刚才的 capsule
系统：读取 capsule summary → Hermes mock/real reflect → 生成 memory candidate / skill patch candidate → 进入审批中心
```

---

## 18. 建议实现顺序

请 Codex 严格按以下顺序实现，不要一次性铺太大。

### Step 1：shared schemas

- 增加 `SkillDescriptorV1`、`SkillRunV1`、`ApprovalRequestV1`、`AgentRunV1`、`CodingRunV1`、`HermesCandidateV1`。
- 增加事件类型常量。
- 增加 schema tests。

### Step 2：Skill Registry

- 实现扫描目录。
- 解析 `SKILL.md` frontmatter。
- 缺省风险策略。
- API：`GET /api/skills`、`POST /api/skills/rescan`。
- Skill Center 接真实 registry。

### Step 3：Skill Run dry-run / preview

- 实现 SkillRun store。
- 支持 dry-run 和 preview。
- 生成 events 和 capsule。
- Chat `/skill` 可触发。

### Step 4：Approval Gate

- 新增 Approval store/API。
- Notification 引用 Approval。
- S3/S4 SkillRun 进入 waiting_approval。
- UI 支持 approve/reject/request changes。

### Step 5：Conductor Dispatch

- 实现规则式 intent parser。
- 实现 `/api/conductor/dispatch`。
- Chat 发送接入 dispatch。
- 生成 AgentRun 和 capsule。

### Step 6：Coding Agent controlled run

- 实现 CodingRun store/API。
- feature flag 默认关闭。
- allowed roots 校验。
- mock/fallback 先完整打通。
- real exec 分支只在 flag 开启后运行。
- diff/log/test artifact 关联 UI。

### Step 7：Hermes Reflection

- 实现 `/api/hermes/reflect/:capsuleId`。
- mock/real 共用输出 schema。
- 生成 HermesCandidate。
- Approval Center 展示 memory/skill candidates。

### Step 8：Obsidian Review Queue

- 实现 preview + write。
- REST 模式可用则真实写入。
- 否则 fallback 到 preview。
- Knowledge Panel 展示最近 review notes。

### Step 9：UI polish + E2E

- Command Center 指标。
- Agent Center run 状态。
- Skill Center run detail。
- Approval tabs。
- Coding run drawer。
- Hermes candidates drawer。
- 中文 E2E 全通过。

---

## 19. Codex 本轮执行 Prompt

下面这段可以直接交给 Codex：

```text
你正在继续实现 OPC SkillOS Agent Center。当前系统已经完成 Phase 2：@opc/shared、Bridge SSE Event Bus、Capsule Store、Conversation Store、Service Supervisor、OpenClaw/Hermes/Obsidian 诊断 API、通知状态机、中文 UI、Chat 关联 Capsule、Skill 生命周期展示。所有 pnpm install/typecheck/lint/test/build/e2e/format 已通过。

请读取并执行本文档：opc_skillos_phase3_controlled_execution.md。

本轮目标：把系统从“真实可观测底座”推进到“可控执行闭环”。优先完成以下内容：

1. 在 @opc/shared 中新增并测试：
   - SkillDescriptorV1
   - SkillRunV1
   - ApprovalRequestV1
   - AgentRunV1
   - CodingRunV1
   - HermesCandidateV1
   - 新 OpcEvent 类型常量

2. Bridge 实现 Skill Registry 1.0：
   - 扫描 OPC_SKILL_ROOTS。
   - 解析 SKILL.md frontmatter。
   - 缺省 risk=S3、approvalRequired=true、trust=review_required。
   - API：GET /api/skills、GET /api/skills/:id、POST /api/skills/rescan。

3. Bridge 实现 SkillRun store 和 dry-run/preview：
   - POST /api/skills/:id/run。
   - 生成 SkillRun、OpcEvent、TaskCapsule。
   - S3/S4 或 approvalRequired=true 时创建 ApprovalRequest，不执行。

4. Bridge 实现 ApprovalRequest store/API：
   - GET /api/approvals。
   - POST approve/reject/request-changes/archive。
   - 与现有 notifications 兼容，但新增 approvals 语义层。

5. 实现规则式 OPC Conductor dispatch：
   - /skill <skillId> 调用 Skill。
   - @dev-operator / Codex / Claude Code 进入 coding task。
   - @knowledge-curator / 保存到知识库 进入 Obsidian review note preview/write。
   - @hermes / 反思 进入 Hermes reflection。

6. 实现 CodingRun 受控执行闭环：
   - 默认 CODING_AGENT_REAL_EXEC=0，只走 mock/fallback，但要完整生成 approval、run、logs、diff、capsule、events。
   - 如果 CODING_AGENT_REAL_EXEC=1，必须校验 CODING_AGENT_ALLOWED_ROOTS，并在 CODING_AGENT_WORKSPACE_ROOT 下使用隔离 workspace/worktree。
   - 不允许 push、merge、deploy。

7. 实现 Hermes Reflection Loop 0.1：
   - POST /api/hermes/reflect/:capsuleId。
   - 真实模式使用已有 Hermes adapter；默认 mock/fallback。
   - 输出 memory candidate / skill patch candidate，存入 data/runtime/hermes/candidates，并进入审批中心。
   - 不要自动写入 MEMORY.md 或 SKILL.md。

8. 实现 Obsidian Review Queue 0.1：
   - preview + write API。
   - 真实模式只写 OBSIDIAN_REVIEW_QUEUE_PATH。
   - 不删除、不覆盖、不移动、不改已有 note。

9. 前端接入：
   - Skill Center 接真实 registry、run、run history。
   - Chat 支持 /skill、@agent 命令并展示 capsule/run/approval。
   - Notification Center 增加 Approvals tab。
   - Coding run drawer 显示 logs/diff/test。
   - Hermes candidates 显示并可 approve/reject。
   - Command Center 增加待审批、Skill runs、Coding runs、Hermes candidates 指标。

硬性要求：
- 不引入 n8n、Temporal、Airflow 或固定 DAG 工作流。
- 不让 Hermes 常驻全程旁听。
- 不执行任意第三方 Skill 脚本。
- 不把 secrets 暴露给前端、events、capsules、logs。
- 所有 S3/S4 动作必须走 approval。
- 真实 Codex/Claude 执行必须默认关闭，且只在 allowed roots + approval 后运行。
- 保持 mock/fallback 能力，真实服务不可用时 UI 不崩。
- 保持中文 UI。
- 所有旧测试继续通过。

完成后请运行：

pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
pnpm format

最后输出：
- 完成了哪些模块。
- 新增了哪些 API。
- 新增了哪些文件。
- 当前真实能力与 fallback 能力边界。
- 仍需用户配置的项目。
- 验证命令结果。
```

---

## 20. Phase 3 完成标准

Phase 3 完成后，系统应达到：

```text
不是只能看服务状态，
而是可以从 Chat 发起一个任务，
由 Conductor 选择 Skill/Agent，
低风险可执行，
高风险可审批，
Coding Agent 可受控运行，
Obsidian 可写 Review Queue，
Hermes 可基于 Capsule 生成候选记忆/技能补丁，
所有过程都有事件、日志、capsule 和 UI 审核入口。
```

最低验收：

- `/api/skills` 返回真实扫描结果。
- `/api/skills/:id/run` 能 dry-run，并生成 SkillRun + Capsule + Event。
- S3/S4 SkillRun 能生成 ApprovalRequest，不直接执行。
- Chat `/skill builtin-echo ...` 能展示 capsule。
- Chat `@dev-operator ... Codex ...` 能生成 coding approval。
- approval 后 mock coding run 能完成并产出 diff/log/capsule。
- `/api/hermes/reflect/:capsuleId` 能生成 candidate。
- Approval Center 能审核 memory/skill candidates。
- Obsidian preview/write 在 mock/rest 两种模式都有合理行为。
- 所有测试与构建通过。
