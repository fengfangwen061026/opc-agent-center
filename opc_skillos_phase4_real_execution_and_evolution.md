# OPC SkillOS Phase 4：真执行与自我进化闭环 MVP

> 版本：Phase 4
> 目标：把 Phase 3 的“可控执行骨架”推进为“真实可执行、可审批、可回滚、可反思、可沉淀”的 OPC 超级中枢 MVP。
> 核心原则：**Skill-first，不引入固定 DAG 工作流；所有真实执行必须可观测、可审计、可审批、可回滚。**

---

## 0. 当前基线

Phase 3 已完成：

- `@opc/shared` 已有事件、任务胶囊、Skill、SkillRun、Approval、AgentRun、CodingRun、HermesCandidate 等 schema。
- Bridge 已有：
  - Skill Registry 1.0
  - SkillRun store
  - ApprovalRequest store/API
  - 规则式 OPC Conductor dispatch
  - CodingRun mock/fallback
  - Hermes Reflection Loop mock/fallback
  - Obsidian Review Queue preview/write API 骨架
  - Event Bus + SSE
  - Capsule Store
  - Conversation Store
- 前端已有：
  - Command Center 指标
  - Agent Center / CodingRun 展示
  - Skill Center 真实 registry + run history
  - Chat dispatch
  - Notification Center approvals / Hermes candidates
  - Knowledge / Obsidian Review Queue 提示
- 验证命令已通过：
  - `pnpm install --frozen-lockfile`
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm test`
  - `pnpm build`
  - `pnpm test:e2e`
  - `pnpm format`

Phase 4 不要推倒重做。必须在现有 Phase 3 基础上增量实现。

---

## 1. Phase 4 总目标

Phase 4 的目标是让系统完成 5 条真实闭环：

### 1.1 服务接入闭环

```text
Settings / Service Center
  → 检查 OpenClaw / Hermes / Obsidian / Codex / Claude Code
  → 引导用户补齐 token / provider / roots / gateway pairing
  → Bridge 持续监测
  → UI 实时展示真实状态、日志和修复建议
```

### 1.2 可恢复审批闭环

```text
用户发起 S3/S4 或 approvalRequired 动作
  → 创建 ApprovalRequest
  → Notification Center 审批
  → ApprovalEffectRunner 恢复原动作
  → 写事件、更新 Run、生成 Capsule
```

当前 Phase 3 的审批更多是“状态层”。Phase 4 要把审批变成真正可恢复执行的 continuation。

### 1.3 Codex / Claude Code 受控真执行闭环

```text
@dev-operator 任务
  → Conductor 生成 CodingRun
  → Approval required
  → 创建隔离 worktree / workspace
  → 调 Codex 或 Claude Code
  → 捕获日志、JSONL、diff、测试结果
  → 生成 Capsule
  → UI 展示
  → 不 push、不 merge、不 deploy
```

### 1.4 Hermes 反思与候选落地闭环

```text
Capsule
  → Hermes reflect
  → memory candidate / skill patch candidate / eval suggestion
  → Approval
  → 应用到 draft / experimental，不直接写 stable
  → 生成事件和审计记录
```

### 1.5 Obsidian Review Queue 闭环

```text
Knowledge / Skill 输出
  → Review note preview
  → Approval
  → 写入 Obsidian Review Queue
  → 可选 promotion preview
  → Approval
  → 复制到正式目录，不覆盖、不删除
```

---

## 2. Phase 4 非目标

本轮不要做：

- 不引入 n8n、Temporal、Airflow 等固定 DAG 编排系统。
- 不允许执行任意第三方 Skill 脚本。
- 不允许自动发布文章。
- 不允许自动 push / merge / deploy。
- 不允许直接修改生产服务器、数据库、DNS、支付、云厂商资源。
- 不允许 Hermes 自动写入 stable `SKILL.md`、真实 `MEMORY.md`、真实 `USER.md`。
- 不允许 Obsidian 自动删除、覆盖、移动已有笔记。
- 不允许把 token/API key 明文写入 git-tracked 文件。
- 不允许使用 `--dangerously-bypass-approvals-and-sandbox`、`--yolo`、`danger-full-access` 作为默认执行策略。

---

## 3. 关键设计：Phase 4 的“真执行”仍然必须受控

### 3.1 默认安全状态

```env
CODING_AGENT_REAL_EXEC=0
HERMES_REAL_EXEC=0
OBSIDIAN_MODE=mock
OPENCLAW_MODE=cli
```

Phase 4 可以实现真执行代码，但默认不自动启用。用户必须在 Service Center 完成配置并显式开启。

### 3.2 真实执行的最低条件

Codex / Claude Code 真实执行必须同时满足：

```text
CODING_AGENT_REAL_EXEC=1
repoPath 在 CODING_AGENT_ALLOWED_ROOTS 内
CODING_AGENT_WORKSPACE_ROOT 已配置
用户审批通过 coding_run approval
workspace 隔离创建成功
不使用危险 bypass/yolo 模式
执行超时、日志捕获、取消能力已启用
```

Hermes 真实反思必须同时满足：

```text
HERMES_REAL_EXEC=1
hermes CLI 可用
Hermes provider/profile 已配置
结构化 JSON parser 可恢复
失败可 fallback，不打断主流程
```

Obsidian 真实写入必须同时满足：

```text
OBSIDIAN_MODE=rest
OBSIDIAN_REST_TOKEN 已配置
OBSIDIAN_REVIEW_QUEUE_PATH 已配置
只创建新 review note
不覆盖已有文件
不删除、不移动
```

OpenClaw Gateway 真实同步必须同时满足：

```text
OpenClaw CLI 可用
gateway status 可诊断
Gateway daemon 已启动或可由 Bridge 托管启动
pairing/auth 已配置
adapter 能安全订阅读事件
```

---

## 4. 共享 Schema 增强

在 `packages/shared/src/` 中新增或扩展以下 schema。

### 4.1 IntegrationStatusV1

```ts
type IntegrationStatusV1 = {
  id: "openclaw" | "hermes" | "obsidian" | "codex" | "claude-code";
  label: string;
  status: "not_configured" | "configured" | "connected" | "degraded" | "offline" | "error";
  mode: "mock" | "cli" | "ws" | "rest" | "http" | "real";
  version?: string;
  lastCheckedAt: string;
  capabilities: Array<{
    id: string;
    label: string;
    status: "available" | "missing" | "disabled" | "blocked" | "unknown";
    reason?: string;
  }>;
  requiredActions: Array<{
    id: string;
    label: string;
    severity: "info" | "warning" | "error";
    command?: string;
    docsUrl?: string;
  }>;
  redactedConfig: Record<string, string | boolean | number | null>;
};
```

### 4.2 ApprovalEffectV1

审批请求必须带有可恢复动作描述，不能只是 UI 状态。

```ts
type ApprovalEffectV1 = {
  id: string;
  targetType:
    | "skill_run"
    | "coding_run"
    | "hermes_candidate"
    | "obsidian_review_note"
    | "skill_promotion"
    | "memory_candidate"
    | "openclaw_message";
  targetId: string;
  action: "resume" | "execute" | "apply" | "write" | "promote" | "send" | "archive";
  paramsHash: string;
  createdAt: string;
  expiresAt?: string;
  idempotencyKey: string;
};
```

`ApprovalRequestV1` 增加：

```ts
effect?: ApprovalEffectV1;
```

### 4.3 SkillEvalV1

```ts
type SkillEvalV1 = {
  id: string;
  skillId: string;
  status: "queued" | "running" | "passed" | "failed" | "cancelled";
  casesTotal: number;
  casesPassed: number;
  casesFailed: number;
  startedAt?: string;
  finishedAt?: string;
  reportPath?: string;
  summary?: string;
  failures?: Array<{
    caseId: string;
    reason: string;
    expected?: unknown;
    actual?: unknown;
  }>;
};
```

### 4.4 SkillPromotionRequestV1

```ts
type SkillPromotionRequestV1 = {
  id: string;
  skillId: string;
  from: "draft" | "experimental";
  to: "experimental" | "stable";
  sourcePath: string;
  targetPath: string;
  diffPath?: string;
  evalId?: string;
  status: "draft" | "waiting_approval" | "approved" | "applied" | "rejected" | "failed";
  createdAt: string;
  updatedAt: string;
};
```

### 4.5 ObsidianReviewNoteV1

```ts
type ObsidianReviewNoteV1 = {
  id: string;
  title: string;
  slug: string;
  status: "preview" | "waiting_approval" | "written" | "failed" | "archived";
  reviewQueuePath: string;
  targetPath?: string;
  frontmatter: Record<string, unknown>;
  markdown: string;
  capsuleId?: string;
  sourceRefs?: string[];
  createdAt: string;
  updatedAt: string;
};
```

### 4.6 OpenClawConversationEventV1

```ts
type OpenClawConversationEventV1 = {
  id: string;
  source: "openclaw";
  channel?: string;
  threadId?: string;
  sessionId?: string;
  direction: "inbound" | "outbound";
  author?: string;
  content: string;
  receivedAt: string;
  rawPath?: string;
};
```

---

## 5. Bridge：Service Center 2.0

### 5.1 新增 API

```text
GET  /api/integrations
GET  /api/integrations/:id
POST /api/integrations/:id/check
POST /api/integrations/:id/start
POST /api/integrations/:id/stop
GET  /api/integrations/:id/logs
GET  /api/integrations/:id/config
POST /api/integrations/:id/config/test
```

### 5.2 配置与密钥策略

实现本地运行配置，但注意安全：

```text
data/runtime/config/local.json        # 非敏感配置，可持久化，gitignored
data/runtime/secrets/secrets.local.json # 敏感配置，chmod 600，gitignored
```

规则：

- 所有 API 返回必须 redacted。
- 默认不在 UI 展示完整 token。
- `.env.example` 只给变量名，不给真实值。
- 如果保存 token，必须：
  - 写入 gitignored 文件
  - 尽量 chmod 600
  - health/config API 只能返回 `configured: true` 或 `sk-***abcd`
- 不允许将 token 写入 Obsidian、capsule、event、log、diff。

### 5.3 OpenClaw 诊断与启动

已有只读诊断能力，Phase 4 增强：

```text
openclaw --version
openclaw status --json
openclaw gateway status --json
openclaw gateway status --require-rpc --json
openclaw logs --follow / bounded logs
```

要求：

- Bridge 只管理自己启动的 gateway 进程。
- 如果系统已有外部 gateway，不要 kill。
- 如果 Gateway offline，Service Center 给出：
  - 当前 CLI path
  - version
  - gateway status
  - pairing/auth 是否缺失
  - 建议命令
- 若实现 start，优先使用配置：
  - `OPENCLAW_MANAGED_GATEWAY=1`
  - `OPENCLAW_GATEWAY_PORT=18789`
  - `OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789` 或项目当前实际格式
- 不确定 OpenClaw WS/RPC 路径时，Codex 必须在 `external/openclaw` 或官方文档内检查当前实现，不要硬编码猜测路径。

### 5.4 Hermes 配置检查

新增：

```text
hermes --version
hermes doctor
hermes model / provider 检测，若 CLI 支持
test prompt：要求返回严格 JSON
```

测试 prompt：

```text
Return only JSON:
{"ok": true, "service": "hermes", "capability": "structured_output"}
```

### 5.5 Obsidian 配置检查

新增：

```text
GET /api/integrations/obsidian/config/test
```

检查项：

- `OBSIDIAN_MODE=rest`
- `OBSIDIAN_REST_URL`
- `OBSIDIAN_REST_TOKEN`
- token 是否可用
- Review Queue 路径是否存在或可创建
- 禁止删除/覆盖测试

### 5.6 Codex / Claude Code 检查

检查项：

- CLI path
- version
- auth 状态可探测则探测
- allowed roots
- workspace root
- real exec flag
- 可创建临时工作区
- 禁用危险参数

---

## 6. Bridge：ApprovalEffectRunner

### 6.1 目的

当前 approvals 可以 approve/reject/request-changes/archive。Phase 4 要让 approve 后能恢复原动作。

新增：

```text
apps/bridge/src/services/approvalEffectRunner.ts
```

### 6.2 行为

审批通过时：

```text
POST /api/approvals/:id/approve
  → mark approval approved
  → load approval.effect
  → validate paramsHash / idempotencyKey
  → call corresponding continuation
  → emit event approval.applied / approval.apply_failed
  → update related notification
```

### 6.3 continuation 映射

| targetType             | action               | 执行                                     |
| ---------------------- | -------------------- | ---------------------------------------- |
| `skill_run`            | `resume` / `execute` | 继续 SkillRun                            |
| `coding_run`           | `execute`            | 启动真实或 mock CodingRun                |
| `hermes_candidate`     | `apply`              | 应用到 memory draft / skill experimental |
| `obsidian_review_note` | `write`              | 写入 Review Queue                        |
| `skill_promotion`      | `promote`            | 从 experimental 复制到 stable            |
| `openclaw_message`     | `send`               | 经 OpenClaw adapter 发出消息             |

### 6.4 幂等要求

- 重复 approve 不得重复执行。
- 每个 effect 有 `idempotencyKey`。
- runner 要记录：
  - `data/runtime/approval-effects/<id>.json`
- 如果 continuation 已完成，直接返回已完成结果。

---

## 7. Bridge：SkillRun 真执行最小集

### 7.1 仍然不执行任意 scripts

Phase 4 只允许内置 runner：

```text
builtin.echo
builtin.create_task_capsule
builtin.obsidian_review_note
builtin.hermes_reflect_capsule
builtin.codex_controlled_run
builtin.claude_code_controlled_run
builtin.skill_eval_run
builtin.skill_patch_to_experimental
builtin.memory_candidate_to_draft
```

### 7.2 SkillDescriptor 增加 runner 字段

从 `SKILL.md` frontmatter 读取：

```yaml
metadata:
  opc:
    runner: builtin.obsidian_review_note
    risk: S2
    approval_required: true
```

如果没有 runner：

```text
runner = builtin.echo
trust = review_required
risk = S3
approvalRequired = true
```

### 7.3 SkillRun 生命周期

```text
requested
  → previewed
  → waiting_approval
  → running
  → succeeded / failed / cancelled
```

### 7.4 新增 API

```text
POST /api/skills/:id/preview
POST /api/skills/:id/execute
POST /api/skill-runs/:id/resume
GET  /api/skill-runs/:id/events
```

---

## 8. Bridge：真实 CodingRun 受控实现

### 8.1 新增 WorkspaceManager

```text
apps/bridge/src/services/codingWorkspaceManager.ts
```

职责：

```text
validateRepoPath(repoPath)
createRunWorkspace(runId, repoPath)
createGitWorktreeOrCopy()
writePromptFile()
runCommandWithTimeout()
collectStdoutStderr()
collectDiff()
collectTestResults()
cleanupPolicy()
```

### 8.2 路径安全

必须实现并测试：

```text
repoPath realpath 必须在 CODING_AGENT_ALLOWED_ROOTS 内
workspace realpath 必须在 CODING_AGENT_WORKSPACE_ROOT 内
不允许 symlink escape
不允许 path traversal
不允许把 workspace root 指到 /
不允许操作 .env / secret files
```

### 8.3 workspace 策略

优先级：

1. 如果 repo 是 git repo：使用 `git worktree add` 创建隔离 worktree。
2. 如果失败：使用本地 copy，但要明确标注 `workspaceMode=copy`。
3. 不允许直接在原始 repo 中执行 agent。

目录：

```text
data/runtime/coding-workspaces/
  <runId>/
    repo/
    prompt.md
    stdout.log
    stderr.log
    codex.jsonl
    final.md
    diff.patch
    test.log
    metadata.json
```

### 8.4 Codex 真执行

当 `CODING_AGENT_REAL_EXEC=1` 且用户审批通过时，执行：

```bash
codex exec \
  --cd <workspaceRepo> \
  --json \
  --sandbox workspace-write \
  --ask-for-approval never \
  --output-last-message <runDir>/final.md \
  - < <runDir>/prompt.md
```

要求：

- 不使用 `--yolo`。
- 不使用 `--dangerously-bypass-approvals-and-sandbox`。
- 不使用 `--sandbox danger-full-access`。
- 必须设置 timeout。
- stdout JSONL 写入 `codex.jsonl`。
- 退出码非 0 时标记 failed，但仍收集 diff/log。
- 如果 Codex CLI 版本不支持某 flag，adapter 要 graceful fallback，并在 run 中记录 unsupported flag。

### 8.5 Claude Code 真执行

默认 Phase 4 只实现 plan mode 真执行：

```bash
claude --permission-mode plan -p "<prompt>"
```

或 stdin 方式，按当前 CLI 支持实现。

如果实现编辑模式，必须另加显式 feature flag：

```env
CLAUDE_CODE_REAL_EDIT=1
```

编辑模式只能在隔离 workspace 内使用：

```bash
claude --permission-mode acceptEdits -p "<prompt>"
```

禁止默认使用：

```text
bypassPermissions
--dangerously-skip-permissions
```

### 8.6 测试命令

允许用户指定 `testCommand`，但必须：

```text
testCommand 在 CODING_AGENT_ALLOWED_TEST_COMMANDS 中
或是 package.json scripts 中的安全命令
或用户单独审批
```

默认自动检测：

```text
pnpm test
npm test
yarn test
pytest
```

但只在安全 allowlist 命中时运行。

### 8.7 diff 与结果

每个 CodingRun 完成后生成：

```text
diff.patch
changedFiles[]
insertions/deletions
testResult
finalSummary
capsule
Hermes reflection trigger candidate
```

不自动应用回原 repo。后续可做：

```text
Apply Patch Approval
```

但 Phase 4 可以只展示 patch，不合并。

---

## 9. Bridge：Hermes 候选应用

### 9.1 Hermes 真实调用

新增：

```text
POST /api/hermes/context-pack
POST /api/hermes/reflect/:capsuleId
POST /api/hermes/candidates/:id/apply
```

真实执行仅在 `HERMES_REAL_EXEC=1` 时启用。

要求 Hermes 输出严格 JSON。失败时 fallback 为 mock candidate，但要标记：

```text
source = "mock_fallback"
```

### 9.2 Candidate 类型

```text
memory_candidate
skill_patch_candidate
new_skill_candidate
eval_candidate
risk_policy_candidate
```

### 9.3 memory candidate 应用策略

审批通过后，不直接写 Hermes 真实 memory 文件。先写：

```text
data/runtime/hermes/approved-memory-candidates.jsonl
obsidian review note 可选
```

UI 显示：

```text
已批准为记忆候选
等待人工合并到 Hermes MEMORY/USER 或 Obsidian
```

如需实现“写入 Hermes memory draft”，只写：

```text
hermes/memory-drafts/<candidateId>.md
```

### 9.4 skill patch candidate 应用策略

审批通过后：

```text
读取目标 skill
生成 diff
复制到 shared-skills/experimental/<skill-id>-patch-<candidate-id>/
写入 PATCH_NOTES.md
创建 SkillPromotionRequest
```

不直接覆盖 stable skill。

### 9.5 new skill candidate 应用策略

审批通过后：

```text
shared-skills/experimental/<new-skill-id>/
  SKILL.md
  README.md
  evals/cases.json
```

然后触发 registry rescan。

### 9.6 eval candidate 应用策略

生成或更新：

```text
<skill>/evals/cases.json
```

但只在 experimental 目录内写入。stable eval 修改需要 promotion request。

---

## 10. Bridge：Skill Eval 与 Promotion

### 10.1 EvalRunner

新增：

```text
apps/bridge/src/services/skillEvalRunner.ts
```

支持：

```text
POST /api/skills/:id/evals/run
GET  /api/skill-evals
GET  /api/skill-evals/:id
```

### 10.2 eval 执行范围

Phase 4 只运行安全 eval：

- schema validation
- frontmatter validation
- dry-run output contract
- builtin runner 的 mock/preview 测试
- 禁止执行任意脚本

### 10.3 promotion

新增：

```text
POST /api/skills/:id/promotion-request
POST /api/skill-promotions/:id/approve
POST /api/skill-promotions/:id/reject
```

Promotion 规则：

```text
draft → experimental：需要 approval，可不要求 eval 通过
experimental → stable：必须 eval passed + approval
stable 不能被直接覆盖，必须先备份
```

备份目录：

```text
data/runtime/skill-backups/<timestamp>/<skill-id>/
```

---

## 11. Bridge：Obsidian Review Queue 真写入

### 11.1 API

```text
POST /api/obsidian/review-notes
GET  /api/obsidian/review-notes
GET  /api/obsidian/review-notes/:id
POST /api/obsidian/review-notes/:id/write
POST /api/obsidian/review-notes/:id/promotion-preview
POST /api/obsidian/review-notes/:id/promote
```

### 11.2 写入限制

真实 REST 写入只能：

```text
create new note under OBSIDIAN_REVIEW_QUEUE_PATH
```

禁止：

```text
overwrite existing file
delete
move
patch existing note
```

### 11.3 Review note frontmatter

```yaml
---
opc_id: "<id>"
capsule_id: "<capsuleId>"
source: "opc-skillos"
status: "review"
created_at: "<iso>"
skill_id: "<skillId>"
agent_id: "<agentId>"
risk: "S2"
---
```

### 11.4 promotion

Promotion 只允许：

```text
copy Review Queue note to selected target folder
```

要求：

- target path 必须在 `OBSIDIAN_ALLOWED_WRITE_PATHS` 内。
- 如果目标存在，创建 `-copy-<timestamp>`，不覆盖。
- promotion 必须 approval。

---

## 12. Bridge：OpenClaw Gateway 会话同步

### 12.1 目标

让 Chat Center 看到来自 IM / OpenClaw 的消息，并能把 UI 消息发送回同一条 OpenClaw conversation。

### 12.2 实现方式

在 `packages/openclaw-adapter` 增加两种模式：

```text
cli: 只读 status/logs/doctor
ws: 订阅 gateway events，支持收发消息
```

如果当前 OpenClaw Gateway API 路径不确定，Codex 必须：

1. 检查 `external/openclaw` 当前源码。
2. 检查官方 docs。
3. 在 adapter 中把 endpoint 配成可配置项。
4. 不硬编码不可验证的路径。

### 12.3 Conversation 同步

新增：

```text
GET  /api/openclaw/conversations
GET  /api/openclaw/conversations/:id/messages
POST /api/openclaw/conversations/:id/send
```

事件映射：

```text
openclaw.message.received → conversation.message.received
openclaw.message.sent     → conversation.message.sent
openclaw.agent.started    → agent.run.started
openclaw.agent.completed  → agent.run.completed
```

### 12.4 去重

消息必须有 dedupe key：

```text
source + channel + threadId + messageId
```

如果 OpenClaw event 没有 messageId，则用内容 hash + timestamp bucket 兜底。

---

## 13. 前端：Service Center Onboarding

### 13.1 设置页改造

Settings 页面分成：

```text
服务总览
OpenClaw Gateway
Hermes Agent
Obsidian
Codex
Claude Code
安全策略
本地配置
```

### 13.2 每个服务卡片展示

```text
状态
模式
版本
能力
缺失项
最近错误
建议命令
一键复制命令
重新检测
查看日志
```

### 13.3 OpenClaw 卡片

展示：

```text
CLI path
version
gateway status
RPC probe
pairing/auth 状态
最近 100 行日志
启动/停止按钮，仅限 Bridge 管理的进程
```

### 13.4 Obsidian 卡片

展示：

```text
REST URL
token configured
vault reachable
review queue path
write test
禁止危险操作说明
```

### 13.5 Coding Agents 卡片

展示：

```text
Codex version
Claude version
real exec enabled?
allowed roots
workspace root
last run
dangerous flags blocked
```

---

## 14. 前端：Approval Center 2.0

### 14.1 展示审批 effect

每个审批卡片必须清楚展示：

```text
要恢复的动作
目标对象
风险等级
会写哪些路径
会调用哪个服务
预期输出
可回滚方式
参数 hash
```

### 14.2 approve 后实时反馈

Approve 后不是简单改状态，而是展示：

```text
审批通过
正在执行 effect
effect succeeded / failed
关联 run / capsule / event
```

### 14.3 request changes

`request_changes` 应该允许用户填写：

```text
修改意见
是否重新生成 plan
是否通知对应 agent
```

写入 related event。

---

## 15. 前端：Agent Center 真实运行态

### 15.1 Agent 状态来源

Agent Center 状态来自：

```text
AgentRun store
CodingRun store
SkillRun store
OpenClaw events
HermesCandidate store
Capsule store
```

### 15.2 CodingRun 详情

显示：

```text
运行状态
agent 类型：codex / claude-code
workspace path
repo path
branch / worktree
stdout
stderr
JSONL events
diff.patch
changed files
test result
final summary
capsule
approval
```

### 15.3 Agent 关系图

关系图节点：

```text
OPC Conductor
Knowledge Curator
Dev Operator
Hermes Kernel
Codex Worker
Claude Code Worker
OpenClaw Gateway
Obsidian
Skill Registry
```

边：

```text
dispatches
uses_skill
writes_capsule
requires_approval
reflects
writes_review_note
produces_diff
```

---

## 16. 前端：Skill Center 2.0

### 16.1 Skill 详情页增加

```text
frontmatter
runner
risk
approvalRequired
trust
lifecycle
owner agent
eval status
usage history
related capsules
Hermes candidates
promotion requests
```

### 16.2 操作

```text
Preview
Dry-run
Run
Run eval
Create promotion request
View source
View diff
Apply Hermes patch to experimental
```

### 16.3 安全提示

如果 Skill：

```text
risk=S3/S4
trust=review_required
runner missing
approvalRequired=true
```

UI 必须明确提示。

---

## 17. 前端：Obsidian Panel 2.0

### 17.1 Review Queue

展示：

```text
review notes
preview markdown
write status
promotion status
capsule link
source link
```

### 17.2 写入前预览

用户必须能看到：

```text
目标路径
frontmatter
正文
是否会覆盖
关联 capsule
```

### 17.3 promotion

Promotion 需要 approval，并显示：

```text
from review queue
to target path
copy only
no overwrite
```

---

## 18. 数据持久化与审计

### 18.1 JSON 文件组织

```text
data/runtime/
  events/
    events-YYYY-MM-DD.jsonl
  capsules/
  approvals/
  approval-effects/
  skill-runs/
  coding-runs/
  hermes-candidates/
  obsidian-review-notes/
  skill-evals/
  skill-promotions/
  coding-workspaces/
  config/
  secrets/
```

### 18.2 事件规范

所有关键动作必须 emit event：

```text
integration.checked
approval.created
approval.approved
approval.effect.started
approval.effect.succeeded
approval.effect.failed
skill.run.started
skill.run.completed
coding.run.started
coding.run.completed
hermes.candidate.created
hermes.candidate.applied
obsidian.review_note.written
openclaw.message.received
```

### 18.3 日志脱敏

必须脱敏：

```text
API key
Bearer token
Cookie
Authorization header
.env 内容
Obsidian token
OpenClaw gateway token
Hermes provider key
Codex / Claude auth token
```

---

## 19. 测试要求

### 19.1 单元测试

必须覆盖：

```text
IntegrationStatus schema
ApprovalEffect schema
ApprovalEffectRunner idempotency
paramsHash mismatch
path validation
symlink escape prevention
Skill runner allowlist
Codex command builder：不包含 yolo / danger-full-access
Claude command builder：默认 plan mode
Obsidian no-overwrite
Hermes JSON parser
Skill promotion backup
```

### 19.2 集成测试

使用临时目录：

```text
fake repo
fake skill roots
fake obsidian vault
fake codex CLI
fake claude CLI
fake hermes CLI
```

覆盖：

```text
approval approve → effect runner → skill run completes
coding run mock → workspace → diff → capsule
codex fake real exec → JSONL → diff → capsule
obsidian review write → creates note
hermes reflect → candidate → approval → draft applied
skill eval → promotion request
```

### 19.3 E2E

至少增加：

1. Service Center 显示集成状态。
2. Chat 发 `/skill builtin-echo`，生成 SkillRun 和 Capsule。
3. 执行需要审批的 Skill，approve 后真正 resume。
4. `@dev-operator` 创建 CodingRun，approve 后显示 logs/diff/capsule。
5. Hermes candidate approve 后进入 applied/draft 状态。
6. Obsidian review note preview/write 流程可见。

### 19.4 必须通过

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
pnpm format
```

---

## 20. 验收 Demo

Phase 4 完成后，必须能演示：

### Demo A：服务中心

```text
打开 Settings
看到 OpenClaw/Hermes/Obsidian/Codex/Claude 状态
点击重新检测
看到真实版本、配置缺失项、建议命令
```

### Demo B：审批恢复执行

```text
Chat 输入：/skill <approvalRequired skill>
系统创建 approval
到 Notification Center approve
SkillRun 从 waiting_approval → running → succeeded
生成 capsule
```

### Demo C：Codex 隔离真执行或 fake-real 执行

```text
配置 fake repo
@dev-operator 修改 README 中的一行
创建 approval
approve 后创建 coding workspace
运行 codex fake/real
生成 diff.patch
UI 展示 diff、logs、capsule
原 repo 不被直接修改
```

### Demo D：Hermes 反思候选应用

```text
选择一个 capsule
点击 Hermes reflect
生成 memory candidate 或 skill patch candidate
approve
memory candidate 写入 draft
skill patch candidate 写入 experimental skill
不改 stable skill
```

### Demo E：Obsidian Review Queue

```text
创建 review note preview
approve write
写入 Review Queue
UI 展示路径和内容
不覆盖已有笔记
```

---

## 21. 实现顺序建议

严格按以下顺序做，避免大面积返工：

```text
1. shared schema 增强
2. IntegrationStatus / Service Center API
3. ApprovalEffectRunner
4. SkillRun resume / execute
5. Coding WorkspaceManager
6. Codex fake-real + real command builder
7. Claude plan-mode command builder
8. Hermes candidate apply
9. Skill eval / promotion
10. Obsidian Review Queue 真写入
11. OpenClaw conversation sync 骨架
12. 前端 Service Center
13. 前端 Approval Center 2.0
14. 前端 CodingRun / Skill / Obsidian / Hermes 展示
15. 测试与修复
```

---

## 22. Codex 本轮执行 Prompt

把下面提示词交给 Codex 执行：

```text
你正在继续实现 OPC SkillOS 项目。请读取并严格执行 docs 或根目录中的 `opc_skillos_phase4_real_execution_and_evolution.md`。

当前项目已完成 Phase 3：
- @opc/shared 已有 execution schemas；
- Bridge 已有 SSE event bus、capsule store、skill registry、skill run store、approval store、coding run store、Hermes candidate store、Obsidian review store；
- 前端已有中文 Command Center、Agent Center、Skill Center、Knowledge、Chat、Notification、Settings；
- 所有 pnpm 验证命令已通过。

本轮目标是 Phase 4：真执行与自我进化闭环 MVP。

请按以下顺序实现：

1. 扩展 @opc/shared：
   - IntegrationStatusV1
   - ApprovalEffectV1
   - SkillEvalV1
   - SkillPromotionRequestV1
   - ObsidianReviewNoteV1
   - OpenClawConversationEventV1
   - 相关 tests

2. Bridge Service Center 2.0：
   - GET /api/integrations
   - GET /api/integrations/:id
   - POST /api/integrations/:id/check
   - POST /api/integrations/:id/start
   - POST /api/integrations/:id/stop
   - GET /api/integrations/:id/logs
   - GET /api/integrations/:id/config
   - POST /api/integrations/:id/config/test
   - 所有配置必须 redacted，敏感信息不得进入日志、event、capsule。

3. 实现 ApprovalEffectRunner：
   - approve 后根据 effect 恢复目标动作；
   - 支持 skill_run、coding_run、hermes_candidate、obsidian_review_note、skill_promotion、openclaw_message；
   - 必须幂等；
   - paramsHash 不匹配时拒绝执行。

4. SkillRun 真执行最小集：
   - 只支持 builtin allowlist runner；
   - 不执行任意第三方 scripts；
   - 支持 preview / execute / resume；
   - S3/S4 或 approvalRequired 必须先进入 approval。

5. CodingRun 受控执行：
   - WorkspaceManager；
   - allowed roots 校验；
   - symlink escape 防护；
   - worktree/copy 隔离；
   - Codex command builder，默认不包含 yolo / dangerous bypass / danger-full-access；
   - Claude 默认 plan mode；
   - 捕获 stdout/stderr/JSONL/final/diff/test；
   - 不 push、不 merge、不 deploy；
   - 完成后生成 capsule/event。

6. Hermes：
   - context pack / reflect 真实调用骨架；
   - candidate approve 后只应用到 draft / experimental；
   - memory candidate 写入 approved-memory-candidates.jsonl 或 memory-drafts；
   - skill patch/new skill 只写 shared-skills/experimental；
   - 不直接改 stable。

7. Skill eval / promotion：
   - safe eval runner；
   - promotion request；
   - experimental → stable 必须 eval passed + approval；
   - stable 覆盖前必须备份。

8. Obsidian：
   - review note 真写入；
   - 只允许创建 OBSIDIAN_REVIEW_QUEUE_PATH 下新文件；
   - 不覆盖、不删除、不移动；
   - promotion 只 copy，需要 approval。

9. OpenClaw conversation sync：
   - 在 adapter 中实现 cli/ws 两种模式骨架；
   - endpoint 不确定时必须检查 external/openclaw 源码或 docs，不要猜；
   - 至少完成 conversation event normalization 和 UI 显示；
   - 发送消息必须走 approval 或明确低风险策略。

10. 前端：
   - Settings 改成 Service Center 2.0；
   - Notification Center 展示 approval effect 与执行结果；
   - Agent Center 展示真实 CodingRun logs/diff/test/capsule；
   - Skill Center 展示 eval、promotion、Hermes patch；
   - Knowledge 展示 review note preview/write/promote；
   - Chat 能看到 dispatch、approval、capsule 和 OpenClaw conversation event。

11. 测试：
   - 增加 unit/integration/e2e；
   - 所有验证命令必须通过：
     pnpm install --frozen-lockfile
     pnpm typecheck
     pnpm lint
     pnpm test
     pnpm build
     pnpm test:e2e
     pnpm format

严禁：
- 引入 n8n/Temporal/Airflow 作为核心编排；
- 执行任意第三方 Skill scripts；
- 默认开启真实 Codex/Claude/Hermes 执行；
- 自动 push/merge/deploy；
- 自动写 stable skill；
- 自动写 Hermes 真 memory；
- 自动覆盖 Obsidian 笔记；
- 把 secrets 写入 git-tracked 文件、event、capsule、log、diff。
```

---

## 23. Phase 4 完成后的下一阶段预告

如果 Phase 4 完成，Phase 5 再做：

```text
- 更强的 OpenClaw IM 双向同步
- Agent 关系图真实拓扑
- 多 Agent 并发任务树
- Skill 市场 / 安全扫描
- Skill 使用成功率与推荐
- Hermes 周报 / 月报式自我进化报告
- Codex/Claude Patch Apply 审批
- Obsidian 正式知识库 promotion 策略
- 移动端 / PWA 优化
```

Phase 4 的重点不是“更多功能”，而是：

> **第一次把真实执行、审批恢复、反思沉淀、知识库入库、安全边界串成闭环。**
