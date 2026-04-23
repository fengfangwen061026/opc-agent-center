# OPC 超级中枢规格文档 v2.0

> 去除 Hermes，以 OpenClaw + Evolver + LanceDB + Obsidian 为核心重建。
> 本文档是唯一真理来源，Codex/Claude Code 执行时以此为准。

---

## 1. 产品定位

个人 AI 总部驾驶舱。不是管理后台，不是 n8n 流程引擎。

核心价值：**看得见、管得住、会进化、能扩展**。

OpenClaw 负责执行编排，Evolver 负责系统进化，Obsidian 是知识库，前端负责观测、交互、审核。

---

## 2. 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                        前端驾驶舱 (React 19 + Vite)           │
│   Dashboard │ Chat │ Agents │ Skills │ Memory │ Notifications │
└────────────────────────────┬────────────────────────────────┘
                             │ WebSocket + REST
┌────────────────────────────▼────────────────────────────────┐
│                        Bridge 中间层 (Node.js)                │
│              聚合所有 adapter，前端唯一数据来源                  │
└──────┬──────────┬──────────┬────────────┬───────────────────┘
       │          │          │            │
  OpenClaw    LanceDB    Obsidian      Evolver
  Gateway    :8080/local   Vault      sub-agent
  :18789     Ollama:11434
```

### 2.1 外部系统依赖

| 系统 | 角色 | 接入方式 | 离线降级 |
|---|---|---|---|
| OpenClaw Gateway | 执行中枢 | WebSocket ws://127.0.0.1:18789 | MockAdapter |
| LanceDB | 本地向量记忆库 | HTTP :8080 或 embedded | 内存临时存储 |
| Ollama | Embedding 模型 | HTTP :11434 | 关闭 auto-recall |
| Obsidian | 知识库 | Local REST Plugin :27123 | 写入本地队列 |
| Evolver | 进化 sub-agent | OpenClaw sub-agent API | 禁用进化功能 |

---

## 3. 记忆层架构

### 3.1 两层分工

**Layer 1: Active Memory Plugin（pre-reply 触发）**
- 每次主 agent 回复前自动运行
- 从 LanceDB 拉取语义相关记忆，注入系统 context
- 支持三种 context 模式：message（默认）/ recent / full
- 配置路径：`~/.openclaw/openclaw.json` → `plugins.slots.memory`

**Layer 2: LanceDB 本地向量库（持久化存储）**
- Embedding 模型：nomic-embed-text（Ollama 本地运行）
- 模型拉取：`ollama pull nomic-embed-text`
- LanceDB 数据目录：`~/.openclaw/memory/lancedb/`

### 3.2 Memory 数据模型

```typescript
// packages/core/src/schemas/memory.ts

export const MemoryTypeSchema = z.enum([
  'episodic',    // 对话片段，事件记录
  'semantic',    // 提炼的事实、偏好、知识
  'procedural',  // Skill 使用经验
]);

export const MemoryEntrySchema = z.object({
  id: z.string().uuid(),
  content: z.string(),
  type: MemoryTypeSchema,
  tags: z.array(z.string()),
  source: z.string(),           // 来源 skill id 或 conversation id
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  quality_score: z.number().min(0).max(1),  // Evolver 维护
  is_core: z.boolean().default(false),      // 用户标记为核心，不被自动删除
  merged_from: z.array(z.string()).optional(), // 合并来源 id 列表
  archived_at: z.string().datetime().optional(), // 软删除时间
});

export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;
```

### 3.3 LanceDB 表结构

```
lancedb/
├── episodic/          # 对话片段
├── semantic/          # 事实/偏好
├── procedural/        # Skill 经验
└── evolver_log/       # 整理操作审计
```

每张表的向量维度：768（nomic-embed-text 输出维度）

### 3.4 OpenClaw Plugin 配置

```json
// ~/.openclaw/openclaw.json 片段
{
  "plugins": {
    "slots": {
      "memory": "lancedb-memory"
    },
    "entries": {
      "active-memory": {
        "enabled": true,
        "config": {
          "contextMode": "message",
          "maxRecallResults": 8,
          "verbose": false
        }
      },
      "lancedb-memory": {
        "enabled": true,
        "config": {
          "dbPath": "~/.openclaw/memory/lancedb",
          "ollamaUrl": "http://localhost:11434",
          "embeddingModel": "nomic-embed-text",
          "autoCapture": true,
          "autoRecall": true
        }
      }
    }
  }
}
```

---

## 4. Evolver Agent

### 4.1 定位

OpenClaw sub-agent，专职系统进化。使用 claude-opus-4-5 模型，独立 workspace。

### 4.2 SOUL.md（Evolver 人格）

```markdown
你是 OPC 超级中枢的进化专员。你的唯一职责是让系统越用越好。
你不执行用户任务，只观察、分析、改进。
你对 Skill 质量有洁癖。你对记忆噪音零容忍。
你提交的每一个 patch 都要有数据支撑，不凭感觉改。
你明白自己有权自动修改小细节，但逻辑变更必须经用户审核。
```

### 4.3 SKILL.md（Evolver 配置）

```yaml
---
name: evolver
description: 系统进化专员，负责 Skill 质量维护和记忆整理
model: claude-opus-4-5
triggers:
  - type: event
    event: skill.execution.completed
    condition: "executionCount >= 10 OR failureRate > 0.2"
  - type: event
    event: task.rejected_by_user
  - type: cron
    schedule: "0 3 * * 0"   # 每周日凌晨 3 点
  - type: manual             # 前端手动触发
workspace: ~/.openclaw/evolver/
subagent:
  maxSpawnDepth: 1
permissions:
  memory_write: true
  memory_delete: true        # 软删除，归档而非物理删除
  notification_create: true
  skill_patch_auto:
    - description
    - comments
    - tags
    - examples
    - non_logic_prompt_wording
  skill_patch_review_required:
    - tool_calls
    - steps
    - conditional_logic
    - output_schema
    - s3_s4_actions
---
```

### 4.4 Eval 机制

Evolver 评估 Skill 质量时结合两种方式：

**方式 A：历史任务结果评分**
- 数据来源：OpenClaw task log
- 信号：用户接受率、任务完成率、重试次数、用户否决记录
- 计算：`quality_score = (accepted / total) * 0.6 + (no_retry / total) * 0.4`

**方式 B：Evolver 生成测试用例**
- Evolver 读取 Skill 的 `description` 和 `examples`
- 生成 3-5 个测试 input，调用 Skill，对照预期 output 评分
- 使用 Opus 模型作为 judge

**综合评分**：`final_score = A * 0.6 + B * 0.4`
- 历史数据不足 5 条时，权重调整为 A * 0.2 + B * 0.8

### 4.5 Skill Patch 流程

```
Evolver 检测到优化点
    │
    ▼
判断变更类型
    │
    ├── 小改动（description/注释/tags/examples）
    │       │
    │       └── 直接写入 Skill 文件
    │           推送 notification(type: skill_auto_patched)
    │           前端 Skill Center 显示变更徽章
    │
    └── 逻辑变更（工具调用/步骤/schema）
            │
            └── 创建 patch candidate 文件
                推送 notification(type: skill_patch_pending)
                前端显示 diff 视图 + eval 结果
                等待用户 [批准] / [拒绝] / [运行 eval]
```

### 4.6 Memory 整理流程

**触发**：每周 cron，或 memory 总量超过阈值（默认 10000 条）

**步骤**：
1. 扫描 episodic 表，找出 >90 天且 quality_score < 0.3 的条目
2. 扫描全库，找出语义相似度 > 0.92 的重复对
3. 对重复对：保留 quality_score 最高的，其余软删除（写入 archived_at）
4. 对低质量老条目：软删除
5. 归档文件写入 `~/.openclaw/evolver/archive/YYYY-MM-DD.jsonl`
6. 写入整理日志到 LanceDB evolver_log 表
7. 推送 notification(type: memory_maintenance_report)

**软删除保留期**：90 天，之后物理删除
**核心记忆**（is_core: true）：永不自动删除

---

## 5. Bridge 中间层

### 5.1 职责

- 聚合 OpenClaw / LanceDB / Obsidian / Evolver 的数据
- 向前端暴露统一 REST + WebSocket API
- 管理所有 adapter 连接状态
- 处理 token/credential，不透传到前端

### 5.2 API 端点

```
GET  /api/health                    # 全系统健康状态
GET  /api/agents                    # Agent 列表
GET  /api/skills                    # Skill 列表
GET  /api/skills/:id/diff           # Skill patch diff
POST /api/skills/:id/approve        # 批准 patch
POST /api/skills/:id/reject         # 拒绝 patch
POST /api/skills/:id/eval           # 手动触发 eval

GET  /api/memory                    # 分页 memory 列表
GET  /api/memory/search?q=          # 语义搜索
GET  /api/memory/:id                # 单条 memory
PATCH /api/memory/:id               # 编辑（content/tags/is_core）
DELETE /api/memory/:id              # 软删除
GET  /api/memory/evolver-log        # Evolver 整理日志

GET  /api/notifications             # 通知列表
POST /api/notifications/:id/action  # 执行审核动作

WS   /ws/events                     # 实时事件流
```

### 5.3 SystemHealth 数据模型

```typescript
export const SystemHealthSchema = z.object({
  gateway: ConnectionStatusSchema,
  lancedb: ConnectionStatusSchema,
  ollama: ConnectionStatusSchema,
  obsidian: ConnectionStatusSchema,
  evolver: z.object({
    status: z.enum(['idle', 'running', 'error']),
    lastRun: z.string().datetime().optional(),
    nextRun: z.string().datetime().optional(),
    pendingPatches: z.number(),
  }),
  memory: z.object({
    totalEntries: z.number(),
    episodic: z.number(),
    semantic: z.number(),
    procedural: z.number(),
    lastMaintenance: z.string().datetime().optional(),
  }),
});
```

---

## 6. 前端页面规格

### 6.1 Memory 面板（/memory）

**布局：三栏**

```
左栏 240px          主栏 flex-1              右栏 320px
─────────────       ──────────────────────   ──────────────────
类型筛选             搜索框（语义+全文）       单条 memory 详情
  episodic           ┌──────────────────┐    ─────────────────
  semantic           │ [tag] [tag]      │    content 全文
  procedural         │ 摘要 (2行截断)    │
                     │ 来源 · 时间       │    来源
标签云               │ quality ●●●○○    │    创建时间
  工作               └──────────────────┘    quality_score
  偏好               ┌──────────────────┐
  项目...            │ ...              │    标签编辑
                     └──────────────────┘    is_core 开关
Evolver 日志
  (独立视图)         虚拟列表，>100条启用      [编辑] [软删除]
```

**Evolver 日志视图**（切换到此视图时替换主栏）：

每条日志条目显示：
- 操作类型（MERGE / PRUNE / ARCHIVE）
- 时间戳
- 涉及条目数
- 操作理由
- [查看详情] 展开受影响的具体条目

### 6.2 Skill Center（/skills）增强

在原有 Skill 列表基础上，每个 Skill 卡片增加：
- Evolver 健康评分（圆形进度，0-1）
- 待审核 patch 徽章（橙色数字）
- 最近自动改动记录（折叠，可展开）

Skill 详情页新增 **进化历史** tab：
- 时间线展示所有 patch（自动 + 审核通过）
- 每个 patch 显示 diff + Evolver 的改动理由 + eval 分数对比
- 支持回滚到任意历史版本

### 6.3 Dashboard 新增 Evolver 状态卡

在原有 5 个 MetricCard 基础上新增 Evolver 卡：
- 当前状态（idle/running/error）
- 下次定时运行时间
- 本周自动 patch 数
- 待审核 patch 数（点击跳转）

---

## 7. Notification 类型扩展

在原有通知类型基础上新增：

```typescript
// packages/core/src/schemas/notification.ts 新增类型

'skill_patch_pending'     // Evolver 提交逻辑变更，等待审核
'skill_auto_patched'      // Evolver 自动应用小改动（可查看）
'skill_eval_complete'     // eval 运行完成，附带评分报告
'memory_maintenance_report' // 每周整理报告
'evolver_error'           // Evolver 运行出错
```

每个 skill_patch_pending 通知包含：
- skill 名称和当前版本
- patch 摘要（一句话描述改了什么）
- Evolver 的改动理由
- eval 前后分数对比
- 操作按钮：[查看 diff] [运行 eval] [批准] [拒绝]

---

## 8. Phase 执行计划

### Phase 0-2（已完成）
脚手架、UI、Dashboard mock。

### Phase 3：OpenClaw Gateway Adapter
不变，见原规格。

### Phase 4：Chat + IM
不变，见原规格。

### Phase 5：Notification + 审核中心
新增 skill_patch_pending / skill_auto_patched / memory_maintenance_report 类型处理。

### Phase 6：Skill Center
新增 Evolver 健康评分、待审核 patch 徽章、进化历史 tab、diff 审核视图、回滚功能。

### Phase 7：LanceDB Memory 层（新）

**目标**：建立本地向量记忆系统，替换 memory-core。

**任务清单**：
1. Bridge 新增 LanceDBAdapter
   - 连接 LanceDB（embedded 模式，无需独立进程）
   - 集成 Ollama nomic-embed-text embedding
   - 实现 CRUD + 语义搜索接口
2. packages/core 新增 MemoryEntry schema
3. Bridge 暴露 /api/memory/* 端点
4. 前端实现 Memory 面板（三栏布局，完整操作能力）
5. MockAdapter：内存中模拟 LanceDB，50条 mock memory 数据
6. OpenClaw memory plugin 配置文档（docs/memory-setup.md）

**验收**：
- [ ] LanceDB embedded 模式在 Bridge 启动时自动初始化
- [ ] Ollama 不可用时，auto-recall 自动关闭并在 UI 提示
- [ ] /api/memory/search?q= 返回语义相关结果
- [ ] Memory 面板三栏布局正常，虚拟列表工作
- [ ] 按类型/标签筛选正常
- [ ] 单条 memory 编辑/软删除正常
- [ ] is_core 标记后不出现在删除候选中
- [ ] MockAdapter 提供 50 条分布均匀的 mock 数据

### Phase 8：Evolver Agent + Memory 整理日志（新）

**目标**：Evolver sub-agent 配置，前端接入 Evolver 状态和整理日志。

**任务清单**：
1. Evolver SKILL.md + SOUL.md 创建（`~/.openclaw/evolver/` 或仓库 skills/evolver/）
2. packages/core 新增 EvolverLog schema、EvolverStatus schema
3. Bridge 新增 EvolverAdapter
   - 监听 OpenClaw Evolver sub-agent 事件
   - 读取整理日志
   - 暴露 /api/memory/evolver-log 端点
4. 前端 Memory 面板：Evolver 日志视图（左栏切换入口）
5. 前端 Skill Center：进化历史 tab + diff 视图 + 回滚按钮
6. 前端 Dashboard：新增 Evolver MetricCard
7. MockAdapter：模拟 Evolver 运行状态和日志

**Evolver EvolverLog schema**：
```typescript
export const EvolverLogEntrySchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['merge', 'prune', 'archive', 'skill_patch', 'eval']),
  timestamp: z.string().datetime(),
  summary: z.string(),
  reason: z.string(),
  affected_ids: z.array(z.string()),
  retained_id: z.string().optional(),    // merge 时保留的条目
  score_before: z.number().optional(),   // eval 前分数
  score_after: z.number().optional(),    // eval 后分数
});
```

**验收**：
- [ ] Evolver SKILL.md 在仓库 skills/evolver/ 目录下
- [ ] Dashboard Evolver 卡片显示状态和统计
- [ ] Memory 面板可切换到 Evolver 日志视图
- [ ] 日志条目可展开查看受影响的具体 memory
- [ ] Skill Center 进化历史 tab 显示 patch 时间线
- [ ] Diff 视图清晰展示新旧内容对比
- [ ] 回滚功能：点击历史版本可恢复
- [ ] skill_patch_pending 通知包含 diff 和 eval 分数

### Phase 9：Obsidian Adapter
不变，见原规格。

### Phase 10：安全打磨 + 测试
新增：
- LanceDB 归档文件不暴露到前端 API（只返回日志摘要）
- Evolver 的 Ollama embedding 调用不记录 memory 内容到日志
- Memory 面板的编辑操作需要操作确认（防误操作）

---

## 9. 全局约束

1. UI 严格遵循液态玻璃设计系统（`--opc-*` CSS variables）
2. 所有 adapter 必须有 MockAdapter fallback，离线时系统仍完整运行
3. S3/S4 动作必须经通知中心审批
4. 所有新数据结构必须有 Zod schema（packages/core）
5. Secrets/token 不进前端明文/localStorage/日志
6. 不引入 n8n / Zapier / Electron / Tauri
7. LanceDB 数据目录不进 Git（.gitignore）
8. Evolver 归档文件（.jsonl）不进 Git
9. Ollama 和 LanceDB 均为可选依赖，不可用时降级而非崩溃

---

## 10. 文件结构（新增部分）

```
opc-agent-center/
├── skills/
│   └── evolver/
│       ├── SKILL.md
│       └── SOUL.md
├── packages/
│   └── core/
│       └── src/schemas/
│           ├── memory.ts        # MemoryEntry, MemoryType
│           └── evolver.ts       # EvolverLog, EvolverStatus
├── apps/
│   └── web/src/
│       └── pages/
│           ├── MemoryPage.tsx
│           └── memory/
│               ├── MemoryList.tsx
│               ├── MemoryDetail.tsx
│               ├── MemorySearch.tsx
│               ├── MemorySidebar.tsx
│               ├── EvolverLog.tsx
│               └── MemoryTagCloud.tsx
└── docs/
    └── memory-setup.md          # LanceDB + Ollama 配置指南
```
