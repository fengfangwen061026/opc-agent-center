# OPC SkillOS Phase 5：真实 Agent 执行与系统硬化闭环

> 目标：把 Phase 4 的“可控执行 MVP + mock/fake-real artifact”推进到“真实可用、可审计、可回滚、可长期演进”的 OPC 超级中枢。
> 本阶段仍坚持：**Skill-first，不引入固定 DAG 工作流；Hermes 不做全程监督；所有高风险动作必须审批；默认 mock/fallback 可运行。**

---

## 0. 当前基线

截至 Phase 4，系统已经具备：

- `@opc/shared`：事件、任务 capsule、审批、Skill、Integration、Obsidian Review Note、CodingRun、Hermes Candidate 等标准 schema。
- Bridge：SSE Event Bus、Capsule Store、Skill Registry、SkillRun、ApprovalEffectRunner、Coding WorkspaceManager、Hermes candidate apply、Obsidian Review Queue、Integration Service、OpenClaw conversation sync 骨架。
- Web：中文 Agent Center、Skill Center、Knowledge Panel、Chat Center、Notification / Approval Center、Service Center。
- 默认安全边界：
  - `CODING_AGENT_REAL_EXEC=0`
  - `HERMES_REAL_EXEC=0`
  - `OBSIDIAN_MODE=mock`
  - Coding Agent 不 push、不 merge、不 deploy。
  - Hermes candidate 只进入 draft / experimental。
  - Obsidian 只允许 Review Queue create-only。

当前仍未完成的关键真实能力：

1. Codex / Claude Code 真实执行分支仍是 TODO。
2. Test command 真实执行仍是 TODO。
3. OpenClaw WS/RPC 双向消息仍是骨架。
4. Hermes 真实 provider 反思仍需要更严格的 schema validation、retry、fallback、cost/usage 记录。
5. Obsidian REST 真写入需要 readback verification、冲突检测、token 测试、UI 引导。
6. Service Center 还需要 onboarding wizard 和可操作诊断路径。
7. 权限策略还分散在多个 service/store，需要收敛为 Policy Engine。
8. runtime state 需要迁移、备份、恢复和导出能力增强。

---

## 1. Phase 5 总目标

本阶段要完成 6 条真实闭环：

```text
用户在 Chat / Agent Center 发起开发任务
  → Conductor dispatch
  → S3 approval
  → ApprovalEffectRunner 恢复执行
  → CodingRun 创建隔离 workspace
  → Codex / Claude Code 真执行
  → 收集 stdout/stderr/jsonl/final/diff/test result
  → 生成 capsule
  → Hermes 反思 candidate
  → Approval Center 审核
  → memory draft / experimental skill / Obsidian review note 落地
```

```text
用户配置 Obsidian REST
  → Service Center 测试 token
  → 创建 Review Queue note
  → readback verification
  → UI 展示真实 note path / URL / content preview
```

```text
用户配置 Hermes provider
  → Service Center 测试 hermes chat -q
  → capsule reflection 真执行
  → JSON schema parse / repair / fallback
  → candidate 进入 Approval Center
```

```text
OpenClaw Gateway 可用时
  → Service Center 显示 gateway / pairing / auth / channels 状态
  → Chat Center 同步来自 OpenClaw/IM 的 conversation event
  → 面板发送消息可进入同一 conversation/thread
```

```text
Skill eval / promotion
  → safe eval run
  → eval result
  → promotion request
  → approval
  → backup stable skill
  → promote experimental skill to stable
```

```text
运行时状态治理
  → JSONL / JSON state 可备份
  → 可导出 support bundle
  → 可清理 old runs
  → 可迁移 schema version
```

---

## 2. 非目标与禁止项

### 2.1 禁止引入固定 DAG 工作流

不要引入 n8n、Temporal、Airflow、Dagster 作为核心编排层。
自动化能力继续通过 **Skill + Conductor + Agent dispatch + approval effect** 实现。

### 2.2 禁止默认真实执行

所有真实执行必须显式开启 feature flag，并通过审批。

```env
CODING_AGENT_REAL_EXEC=1
HERMES_REAL_EXEC=1
OBSIDIAN_MODE=rest
OPENCLAW_MODE=ws
```

没有配置时必须继续 fallback 到 mock，不允许让 UI 崩溃。

### 2.3 禁止危险 Coding Agent 权限

默认不得使用任何绕过权限、全盘文件访问、自动提交、自动推送、自动部署、自动删除的模式。

如果 Codex / Claude Code CLI 的参数在本机版本中变化，必须先通过：

```bash
codex --help
codex exec --help
claude --help
claude code --help || true
```

或等效方式探测本机可用参数，不能硬编码不确定命令。

### 2.4 禁止 Hermes 直接修改稳定记忆/稳定 Skill

Hermes 只能产生候选：

- memory candidate
- skill patch candidate
- new skill candidate
- eval candidate
- project preference candidate

候选必须进入 Approval Center。
批准后也只能写入 draft 或 experimental；promote stable 另走 Skill Promotion 审批。

### 2.5 禁止 Obsidian 覆盖/删除/移动

Phase 5 仍只允许 create-only 写入 Review Queue。
Promotion 到正式目录可以做 preview，但不得默认执行覆盖。

---

## 3. Phase 5 重点模块

## 3.1 Policy Engine 1.0

### 目标

把散落在 SkillRun、CodingRun、Obsidian、Hermes、ApprovalEffectRunner 中的权限判断收敛到统一策略层。

### 新增文件建议

```text
apps/bridge/src/services/policyEngine.ts
apps/bridge/src/services/pathSafety.ts
apps/bridge/src/services/commandSafety.ts
apps/bridge/test/policyEngine.test.ts
apps/bridge/test/pathSafety.test.ts
apps/bridge/test/commandSafety.test.ts
```

### Policy Engine 输入

```ts
interface PolicyDecisionInput {
  actor: {
    type: "user" | "agent" | "system";
    id: string;
  };
  action: {
    type:
      | "skill.execute"
      | "coding.run"
      | "coding.test"
      | "obsidian.review.write"
      | "hermes.reflect"
      | "hermes.candidate.apply"
      | "skill.promote"
      | "openclaw.message.send"
      | "service.start"
      | "service.stop";
    risk: "S0" | "S1" | "S2" | "S3" | "S4";
    approvalRequired?: boolean;
  };
  resource?: {
    path?: string;
    repoPath?: string;
    skillId?: string;
    serviceId?: string;
  };
  context?: Record<string, unknown>;
}
```

### Policy Engine 输出

```ts
interface PolicyDecision {
  allowed: boolean;
  requiresApproval: boolean;
  reason: string;
  severity: "info" | "warning" | "danger";
  requiredEnv?: string[];
  blockedBy?: string[];
  normalizedPaths?: Record<string, string>;
}
```

### 必须覆盖的规则

- S3/S4 必须审批。
- `CODING_AGENT_REAL_EXEC !== '1'` 时，真实 coding run 不允许执行，只能 mock。
- `repoPath` 必须在 `CODING_AGENT_ALLOWED_ROOTS` 内。
- `workspacePath` 必须在 `CODING_AGENT_WORKSPACE_ROOT` 内。
- 必须阻止 symlink escape。
- 必须阻止 shell metacharacter 注入。
- test command 必须在 allowlist 内。
- Obsidian 只能写入 `OBSIDIAN_REVIEW_QUEUE_PATH`。
- Hermes candidate apply 不能写 stable skill 或真实 MEMORY。
- OpenClaw send message 需要 gateway connected；高风险通道可要求审批。
- service start/stop 只能管理 Bridge 自己启动的进程。

---

## 3.2 Coding Agent 真执行闭环 1.0

### 目标

实现 Codex / Claude Code 的真实执行分支，但仍默认关闭。
真实执行必须：审批、隔离 workspace、限制路径、记录日志、收集 diff、生成 capsule。

### 环境变量

```env
CODING_AGENT_REAL_EXEC=0
CODING_AGENT_ALLOWED_ROOTS=/Users/me/projects,/Users/me/opc-work/repos
CODING_AGENT_WORKSPACE_ROOT=/Users/me/opc-work/workspaces
CODEX_CLI_PATH=/Users/me/.local/bin/codex
CLAUDE_CLI_PATH=/Users/me/.local/bin/claude
CODING_AGENT_TEST_COMMAND_ALLOWLIST=pnpm test,pnpm typecheck,pnpm lint,pnpm build,npm test,pytest,uv run pytest
CODING_AGENT_MAX_RUNTIME_MS=900000
CODING_AGENT_MAX_OUTPUT_BYTES=3000000
```

### Workspace 策略

1. 输入 `repoPath`。
2. normalize + realpath。
3. 检查是否位于 allowed roots。
4. 创建 run directory：

```text
${CODING_AGENT_WORKSPACE_ROOT}/runs/<codingRunId>/
```

5. 优先使用 git worktree：

```bash
git worktree add <workspacePath> -b opc-run/<short-id>
```

6. 如果 repo 不是 git repo 或 worktree 失败，可以 fallback copy，但必须记录原因。
7. 所有命令只在 workspacePath 执行。
8. 执行完成后收集：

```text
stdout.log
stderr.log
events.jsonl
final.md
diff.patch
changed-files.json
test-results.json
capsule.json
```

### Codex 执行策略

实现前必须探测本机 CLI：

```bash
<CODEX_CLI_PATH> --version
<CODEX_CLI_PATH> --help
<CODEX_CLI_PATH> exec --help || true
```

根据本机支持参数构造命令，不要硬编码未知参数。
如果支持非交互 exec 模式，优先使用非交互模式。
如果支持 JSON/JSONL 输出，写入 `events.jsonl`。
如果不支持稳定机器输出，至少写 stdout/stderr/final。

禁止：

```text
--yolo
--dangerously-bypass
--bypass-permissions
任何自动 push / merge / deploy 参数
```

如果 Codex CLI 参数不支持安全非交互执行，则真实执行应失败为 `blocked`，并生成清晰诊断通知，而不是尝试危险 fallback。

### Claude Code 执行策略

实现前必须探测本机 CLI：

```bash
<CLAUDE_CLI_PATH> --version
<CLAUDE_CLI_PATH> --help
```

Phase 5 允许两种模式：

```text
claudePlanOnly：只读分析，生成 plan/final，不改文件。
claudeEdit：仅当 CLAUDE_CODE_REAL_EDIT=1 且审批通过时允许。
```

如果本机 CLI 无法明确进入安全只读/受控编辑模式，则只允许 mock/fallback。

### CodingRun 状态机

```text
requested
  → waiting_approval
  → approved
  → preparing_workspace
  → running
  → collecting_artifacts
  → testing_optional
  → completed | failed | cancelled | blocked
```

### API 增强

已有 API 保持兼容，新增/增强：

```text
POST /api/coding-runs/:id/approve-and-run
POST /api/coding-runs/:id/run-tests
GET  /api/coding-runs/:id/artifacts
GET  /api/coding-runs/:id/changed-files
GET  /api/coding-runs/:id/workspace
POST /api/coding-runs/:id/cleanup
```

### 前端要求

Agent Center / CodingRun detail 需要展示：

- repo path
- workspace path
- branch/worktree 信息
- command preview
- approval 状态
- live logs
- diff viewer
- changed files
- test result
- capsule link
- Hermes reflection link
- cleanup 按钮

---

## 3.3 Test Command Runner 1.0

### 目标

CodingRun 完成后，用户可以从 UI 选择 allowlist 内测试命令运行。
测试命令必须在 workspacePath 内执行，并产出 structured result。

### 规则

- test command 必须命中 `CODING_AGENT_TEST_COMMAND_ALLOWLIST`。
- 不允许任意 shell。
- 不允许 `rm`, `curl | sh`, `sudo`, `docker`, `kubectl`, `terraform apply`, `git push` 等危险命令，除非未来单独实现 S4 审批策略。
- command 需要 tokenized，不通过 shell 拼接执行。
- 超时、最大输出长度可配置。

### 产物

```text
test-results/<timestamp>-<slug>.json
test-results/<timestamp>-stdout.log
test-results/<timestamp>-stderr.log
```

### Capsule 更新

测试后更新关联 capsule：

```json
{
  "verification": ["pnpm typecheck passed", "pnpm test failed: 2 failing tests"],
  "problems": ["..."]
}
```

---

## 3.4 Hermes 真实反思闭环 1.0

### 目标

在 `HERMES_REAL_EXEC=1` 且 provider/profile 可用时，Bridge 能对 capsule 调用 Hermes 真反思。
失败必须 fallback 为 mock candidate，不阻断主流程。

### 输入

Hermes 不读完整日志，默认只读：

```text
capsule summary
skills used
agent runs summary
approval decisions
coding diff summary
test result summary
user feedback if any
```

只有用户点击“包含完整日志反思”时，才追加 stdout/stderr 片段，并限制 token/字符长度。

### 输出 JSON Schema

Hermes 输出必须尝试解析为：

```ts
interface HermesReflectionOutput {
  summary: string;
  confidence: number;
  memoryCandidates: Array<{
    title: string;
    content: string;
    reason: string;
    scope: "user" | "project" | "tool" | "agent" | "skill";
  }>;
  skillCandidates: Array<{
    type: "new_skill" | "patch_skill" | "eval_case" | "pitfall";
    skillId?: string;
    title: string;
    content: string;
    reason: string;
  }>;
  riskNotes: string[];
  nextActions: string[];
}
```

### Robust JSON 流程

1. 尝试直接 parse。
2. 尝试从 markdown code fence 提取 JSON。
3. 尝试定位第一段 JSON object。
4. schema validate。
5. 如果失败，生成 fallback candidate，并把原始输出截断保存到 debug artifact。

### Candidate Apply

批准后只能落地到：

```text
data/runtime/hermes/memory-drafts/*.md
shared-skills/experimental/<skill-id>/SKILL.md
shared-skills/experimental/<skill-id>/evals/*.json
```

不能修改：

```text
stable skill
OpenClaw global prompt
Hermes real MEMORY.md / USER.md
生产配置
```

---

## 3.5 Obsidian REST 真写入与验证

### 目标

实现 Obsidian Local REST API 的完整测试、create-only 写入、readback 验证、错误提示。

### 环境变量

```env
OBSIDIAN_MODE=rest
OBSIDIAN_REST_URL=http://127.0.0.1:27123
OBSIDIAN_REST_TOKEN=...
OBSIDIAN_REVIEW_QUEUE_PATH=08_Review_Queue
```

### Service Center 测试

`/api/integrations/obsidian/config/test` 应检查：

- URL 可达。
- token 有效。
- 能读取 vault 根目录或执行一个只读 endpoint。
- Review Queue path 是否存在。
- 若不存在，提示用户在 Obsidian 内创建，不自动创建正式目录。

### Review Note 写入

写入前：

- sanitize file name。
- 生成 unique path：

```text
08_Review_Queue/YYYY-MM-DD/<slug>-<short-id>.md
```

- 如果路径已存在，换新 suffix，不覆盖。
- 写入后 readback。
- 比对 hash。
- 记录 ObsidianReviewNote 状态：

```text
previewed
waiting_approval
writing
written
verified
failed
```

### UI 要求

Knowledge Panel 展示：

- REST status
- vault/review queue status
- note path
- write approval
- write result
- readback preview
- copy path
- open in Obsidian URI，如果可构造

---

## 3.6 OpenClaw 双向 Conversation Sync 1.0

### 目标

在 OpenClaw Gateway 可用时，让 Chat Center 能看到来自 OpenClaw/IM 的 conversation event，并允许 UI 发送消息进入同一 conversation/thread。

### 实现原则

不要猜 endpoint。
Codex 必须先检查：

```text
external/openclaw 源码中的 gateway/websocket/rpc API
external/openclaw docs
openclaw gateway --help
openclaw status --json
```

如果没有稳定 API，就保留 adapter interface + mock/fallback，不要硬编码脆弱路径。

### Adapter interface

```ts
interface OpenClawConversationAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  listConversations(): Promise<OpenClawConversation[]>;
  listMessages(conversationId: string): Promise<OpenClawMessage[]>;
  sendMessage(input: {
    conversationId?: string;
    channel?: string;
    text: string;
    metadata?: Record<string, unknown>;
  }): Promise<OpenClawMessageSendResult>;
  onMessage(handler: (event: OpenClawConversationEventV1) => void): () => void;
}
```

### 事件映射

所有 OpenClaw inbound/outbound message 都映射成 OpcEvent：

```text
openclaw.conversation.message.received
openclaw.conversation.message.sent
openclaw.conversation.thread.created
openclaw.conversation.sync.failed
```

### Chat Center UI

- 左侧 conversation list 显示来源：Panel / Telegram / WeChat / Slack / WebChat / unknown。
- 消息标注 origin。
- 用户从面板发送消息后，必须显示 pending/sent/failed。
- 来自 IM 的消息应进入同一会话流，并可以触发 Conductor dispatch。

---

## 3.7 Skill Eval 与 Promotion 硬化

### 目标

让 experimental skill 进入 stable 前必须经过：eval、diff、approval、backup、promotion、rescan。

### Promotion 流程

```text
experimental skill
  → run safe eval
  → eval passed
  → create promotion request
  → approval
  → backup existing stable skill
  → copy experimental to stable
  → rescan registry
  → emit event
```

### Backup 路径

```text
data/runtime/backups/skills/<skill-id>/<timestamp>/
```

### 禁止

- 未通过 eval 的 skill 不能 promote，除非用户在 approval 中选择 override，并记录 reason。
- 不允许覆盖 stable skill 而不备份。
- 不允许 promote 缺少 `SKILL.md` 的目录。

### UI

Skill Detail 展示：

- stable vs experimental diff
- eval status
- promotion request
- approval status
- backup path
- promote result

---

## 3.8 Runtime State Backup / Export / Cleanup

### 目标

系统运行一段时间后会积累大量 runtime 数据。需要基础治理。

### 新增 API

```text
POST /api/runtime/export-bundle
POST /api/runtime/backup
GET  /api/runtime/backups
POST /api/runtime/cleanup/preview
POST /api/runtime/cleanup/apply
GET  /api/runtime/state-summary
```

### Export Bundle 内容

```text
capsules
approvals
notifications
events recent window
skill runs
coding runs metadata
hermes candidates
obsidian review notes
integration config redacted
service logs recent window
```

禁止导出：

```text
tokens
API keys
full .env
private ssh keys
large raw stdout/stderr unless explicitly requested
```

### Cleanup 策略

支持 preview：

- 清理 completed mock coding runs older than N days。
- 清理 old event JSONL beyond size threshold。
- 清理 orphan workspaces。
- 清理 failed temporary files。

apply 前必须审批或至少二次确认。

---

## 3.9 Service Center Onboarding Wizard

### 目标

把“仍需用户配置”的事项变成 UI 可执行的分步向导。

### Wizard 列表

#### OpenClaw

- CLI path test。
- version。
- gateway status。
- pairing/auth status。
- managed gateway start/stop，如果 `OPENCLAW_MANAGED_GATEWAY=1`。
- logs。
- next action instruction。

#### Hermes

- CLI path test。
- version。
- doctor。
- provider/profile status。
- `HERMES_REAL_EXEC` status。
- test reflection。

#### Obsidian

- REST URL。
- token。
- read-only test。
- Review Queue path check。
- create-only dry run。
- real write verification。

#### Codex

- CLI path。
- version。
- allowed roots。
- workspace root。
- real exec flag。
- safe command support。
- test dry run。

#### Claude Code

- CLI path。
- version。
- safe mode support。
- plan-only test。
- edit feature flag status。

### UI 要求

每个集成展示：

```text
未配置 / 可探测 / 可用 / 受限可用 / 错误 / 需要人工操作
```

每个错误必须有“下一步怎么做”。

---

## 4. API 汇总

Phase 5 新增或增强 API：

```text
# Policy
POST /api/policy/check

# Coding real execution
POST /api/coding-runs/:id/approve-and-run
POST /api/coding-runs/:id/run-tests
GET  /api/coding-runs/:id/artifacts
GET  /api/coding-runs/:id/changed-files
GET  /api/coding-runs/:id/workspace
POST /api/coding-runs/:id/cleanup

# Hermes real reflection
POST /api/hermes/reflect/:capsuleId?mode=summary|with_logs
POST /api/hermes/candidates/:id/apply
GET  /api/hermes/runs
GET  /api/hermes/runs/:id

# Obsidian
POST /api/obsidian/config/test
POST /api/obsidian/review-notes/:id/write
POST /api/obsidian/review-notes/:id/verify

# OpenClaw
POST /api/openclaw/connect
POST /api/openclaw/disconnect
GET  /api/openclaw/conversations
GET  /api/openclaw/conversations/:id/messages
POST /api/openclaw/conversations/:id/send

# Runtime
GET  /api/runtime/state-summary
POST /api/runtime/export-bundle
POST /api/runtime/backup
GET  /api/runtime/backups
POST /api/runtime/cleanup/preview
POST /api/runtime/cleanup/apply
```

---

## 5. 前端页面验收标准

## 5.1 Command Center

新增卡片：

- Real Execution Status
- Approval Queue
- Coding Runs Active
- Hermes Candidates Pending
- Obsidian Review Writes
- Service Health
- Runtime State Size

必须能从卡片跳转对应详情。

## 5.2 Agent Center

CodingRun Detail 必须支持：

- mock / real 标识。
- command preview。
- approval effect。
- workspace path。
- logs。
- diff。
- changed files。
- tests。
- capsule。
- reflect 按钮。
- cleanup 按钮。

## 5.3 Skill Center

Skill Detail 必须支持：

- stable / experimental。
- eval run。
- eval history。
- promotion request。
- approval。
- promotion result。
- backup path。
- source preview。

## 5.4 Knowledge Panel

必须支持：

- Obsidian REST status。
- Review Queue notes。
- write approval。
- write result。
- readback verification。
- failed reason。

## 5.5 Notification / Approval Center

必须展示：

- approval effect type。
- paramsHash。
- idempotency key。
- policy decision。
- rollback note。
- related run/capsule/skill/candidate links。
- approve 后的 resumed action 状态。

## 5.6 Service Center

必须提供 onboarding wizard：

- check。
- logs。
- redacted config。
- test config。
- next action。
- start/stop if managed。

## 5.7 Chat Center

必须支持：

- Panel conversation。
- OpenClaw conversation list，如果可用。
- message origin 标识。
- pending/sent/failed。
- dispatch result/capsule 展示。

---

## 6. 数据持久化

### 新增目录

```text
data/runtime/
  coding-runs/
    <id>/
      run.json
      stdout.log
      stderr.log
      events.jsonl
      final.md
      diff.patch
      changed-files.json
      test-results/
      capsule.json
  hermes-runs/
    <id>/
      input.json
      raw-output.txt
      parsed.json
      candidate-ids.json
  backups/
    skills/
    runtime/
  exports/
  cleanup-previews/
```

### 注意

- `data/runtime` 继续 gitignored。
- 不保存 token。
- config export 必须 redacted。
- 大日志默认截断展示，但原始文件可本地查看。

---

## 7. 测试要求

### Unit tests

必须新增或更新：

```text
policyEngine.test.ts
pathSafety.test.ts
commandSafety.test.ts
codingWorkspaceManager.test.ts
codingRealExecCommandBuilder.test.ts
hermesReflectionParser.test.ts
obsidianReviewWrite.test.ts
skillPromotion.test.ts
runtimeExportCleanup.test.ts
```

### Integration tests

mock 模式必须通过：

```bash
pnpm test
```

真实集成测试放 behind env，不在默认 CI 中跑：

```env
OPC_RUN_REAL_INTEGRATION_TESTS=1
```

可包括：

- real obsidian token test，如果 env 存在。
- real hermes reflection smoke，如果 env 存在。
- real codex plan-only smoke，如果 env 存在。

### E2E

更新 smoke：

- Service Center wizard 可见。
- Skill eval/promotion UI 可见。
- Approval effect approve 后有 resumed 状态。
- CodingRun detail 展示 logs/diff/test/capsule 区域。
- Knowledge Review Queue 显示 write/verify 状态。

---

## 8. 验收命令

Codex 完成后必须运行并修复直到通过：

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
pnpm format
```

如果有 chunk size warning 可以记录，不必强行解决。
如果真实 CLI 不可用，测试必须仍然在 mock/fallback 下通过。

---

## 9. 手动验收场景

### 场景 A：CodingRun mock 不回退

```text
CODING_AGENT_REAL_EXEC=0
用户在 Chat 输入：@dev-operator 修改 demo repo 中 README，加一段 OPC 说明
系统生成 approval
用户 approve
系统生成 mock/fake-real artifacts
Agent Center 可见 logs/diff/capsule
Hermes 可反思 capsule
```

### 场景 B：CodingRun real blocked

```text
CODING_AGENT_REAL_EXEC=1
repoPath 不在 allowed roots
用户 approve 后
Policy Engine 阻止执行
生成 blocked notification
不创建危险 workspace
```

### 场景 C：CodingRun real success

```text
CODING_AGENT_REAL_EXEC=1
repoPath 在 allowed roots
workspace root 有权限
Codex CLI 支持安全非交互模式
用户 approve
系统创建 workspace
执行 Codex
收集 diff/log/final
不 push、不 merge
生成 capsule
```

### 场景 D：Hermes real fallback

```text
HERMES_REAL_EXEC=1
provider 未配置或失败
用户点击 reflect
系统不崩溃
产生 fallback candidate
Service Center 显示 Hermes 需要配置 provider/profile
```

### 场景 E：Obsidian real write verified

```text
OBSIDIAN_MODE=rest
token 可用
用户创建 review note preview
approval 后写入 Review Queue
readback hash match
Knowledge Panel 显示 verified
```

### 场景 F：Skill promotion

```text
experimental skill 存在
run eval passed
创建 promotion request
approve
stable 备份
experimental copy to stable
registry rescan
Skill Center 显示 stable version updated
```

---

## 10. 代码质量要求

- TypeScript 严格类型，不使用随意 `any`。
- 所有 API response 使用 shared schema 或明确 DTO。
- 所有 path 操作必须 normalize + realpath 校验。
- 不通过 shell 字符串拼接执行用户命令。
- 大文件读取必须限制大小。
- SSE 不得泄露 token。
- config endpoint 必须 redacted。
- 错误消息中文友好，但日志保留英文技术细节也可以。
- mock/fallback 不能被删除。

---

## 11. 建议实现顺序

### Step 1：Policy Engine

先统一权限判断，不要先写真实执行。

### Step 2：CodingRun 真执行命令构造与 workspace

完成路径安全、命令探测、artifact 收集。

### Step 3：ApprovalEffectRunner 接 CodingRun real resume

approve 后恢复真实 run。

### Step 4：Test Command Runner

只允许 allowlist 命令。

### Step 5：Hermes real reflection hardening

schema validation + retry/fallback + run artifact。

### Step 6：Obsidian REST write/readback verify

create-only + hash verification。

### Step 7：Skill promotion hardening

eval + backup + promote + rescan。

### Step 8：OpenClaw conversation adapter probing

先源码/CLI 探测，再实现稳定部分。

### Step 9：Runtime export/backup/cleanup

给长期运行做治理。

### Step 10：前端串联与 E2E

完成所有页面可见能力与 smoke。

---

## 12. Codex 本轮执行 Prompt

把以下内容直接交给 Codex 执行：

```text
你正在继续实现 OPC SkillOS / Agent Center。当前 Phase 4 已完成：Integration Service、ApprovalEffectRunner、SkillRun preview/execute/resume、Coding WorkspaceManager mock/fake-real artifact、Hermes candidate apply、Obsidian Review Queue createOnly、Skill safe eval / promotion request、OpenClaw conversation sync 骨架、中文 UI。

现在执行 Phase 5：真实 Agent 执行与系统硬化闭环。

严格遵守：
1. 不引入 n8n、Temporal、Airflow 等固定 DAG 工作流。
2. 保持 Skill-first / Agent-first / Capsule-first / Approval-first。
3. 默认 mock/fallback 必须继续可运行。
4. 真实 Codex/Claude 执行必须 behind CODING_AGENT_REAL_EXEC=1，且必须审批，且 repoPath 必须在 CODING_AGENT_ALLOWED_ROOTS 内，workspace 必须在 CODING_AGENT_WORKSPACE_ROOT 内。
5. 不 push、不 merge、不 deploy、不删除生产数据。
6. 不使用危险 bypass/yolo 权限；如果本机 CLI 参数不确定，先通过 --help 探测，不能硬编码猜测。
7. Hermes 不全程监督，只对 capsule 做低成本 reflection；输出只能进入 candidate，不直接改 stable skill 或真实 MEMORY/USER。
8. Obsidian REST 只允许 Review Queue create-only 写入，并必须 readback verify。
9. 所有高风险动作必须走 ApprovalEffectRunner，并记录 paramsHash、idempotencyKey、policy decision、rollback note。
10. 所有新增 UI 保持中文。

请按文档顺序实现：
- Policy Engine 1.0
- Coding Agent 真执行闭环 1.0
- Test Command Runner 1.0
- Hermes 真实反思闭环 1.0
- Obsidian REST 真写入与验证
- OpenClaw 双向 Conversation Sync 1.0
- Skill Eval 与 Promotion 硬化
- Runtime State Backup / Export / Cleanup
- Service Center Onboarding Wizard

完成后运行并修复直到通过：
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
pnpm format

输出最终总结时，请包含：
- 完成模块
- 新增/修改 API
- 新增关键文件
- 真实能力与 fallback 边界
- 仍需用户配置
- 手动验收方法
- 验证命令结果
```

---

## 13. Phase 5 完成后的预期状态

完成后系统应从：

```text
可控执行 MVP + fake-real artifacts
```

升级为：

```text
真实 Coding Agent 可控执行
+ Hermes 真实/兜底反思
+ Obsidian 真写入验证
+ OpenClaw 消息同步骨架可用
+ Skill promote 可审计
+ Runtime 可备份/导出/清理
+ Service Center 可引导用户完成真实配置
```

这将是 OPC 超级中枢第一次真正具备：

```text
能接任务
能审批
能隔离执行
能看过程
能生成结果
能测试验证
能形成 capsule
能反思沉淀
能生成候选能力
能经人工审核后进化
```
