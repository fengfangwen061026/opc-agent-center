# OPC 超级中枢 — 项目全景文档

> 版本：v2.1 | 更新：2026-04-23

---

## 背景说明（对话上下文）

本文档是 Claude 与项目负责人之间的持久对话背景。以下信息在每次对话中默认已知，无需重复解释：

**项目负责人偏好**：
- 所有高风险动作（发布内容、推送代码、部署）必须经本人审批后才执行，不接受全自动
- 需要将控制中枢打包成 Electron 桌面应用（.app / .exe），不想每次开终端跑命令
- 技术决策需要给出理由，不接受"两个都行"的模糊回答
- 发现文档/代码有误直接指出并修正，不需要客气

**当前项目状态**（2026-04-23）：
- Phase 0–11 全部完成，Phase 12 进行中
- Phase 12 目标：Obsidian 桌面端、WeChat ClawBot、飞书、Evolver 真实接入
- Phase 13（规划中）：Electron 桌面应用封装

**GitHub 仓库**：`https://github.com/fengfangwen061026/opc-agent-center`

---

## 一、项目定位

**OPC 超级中枢**是一个运行在本地的个人 AI 总部驾驶舱。

它不是管理后台，不是 n8n 流程引擎，不是聊天机器人。它是一个**可观测、可审核、会进化**的个人 AI 操作系统界面——你在这里看见所有 Agent 如何协作、Skill 如何复用和进化、记忆如何积累、任务如何被审核和交付。

**四个核心价值**：
- **看得见**：所有 Agent、任务、Skill、通知、知识入库都能被观察
- **管得住**：高风险动作（发消息/推送/写代码/发布内容）必须经审批，不全自动
- **会进化**：Evolver 持续优化 Skill 质量，整理记忆噪音
- **能扩展**：后续可接更多 IM 渠道、Coding Agent、知识源

---

## 二、系统架构

```
┌─────────────────────────────────────────────────────────────┐
│              Electron 桌面壳（Phase 13，规划中）              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │               前端驾驶舱 (React 19 + Vite)             │  │
│  │  Dashboard │ Chat │ Agents │ Skills │ Memory │         │  │
│  │  Knowledge │ Notifications │ Settings                  │  │
│  └────────────────────────┬──────────────────────────────┘  │
│                           │ WebSocket + REST                 │
│  ┌────────────────────────▼──────────────────────────────┐  │
│  │              Bridge 中间层 (Node.js + Hono)             │  │
│  │      聚合所有 adapter，前端唯一数据来源，:3001           │  │
│  └──────┬──────────┬──────────┬────────────┬─────────────┘  │
└─────────┼──────────┼──────────┼────────────┼────────────────┘
          │          │          │            │
     OpenClaw    LanceDB    Obsidian      Evolver
     Gateway    本地向量库  Vault REST   sub-agent
     :18789     embedded   :27123
          │
     ┌────┴────┐
     WeChat   飞书
     ClawBot  (主力)
```

### 外部系统一览

| 系统 | 角色 | 接入方式 | 离线降级 |
|---|---|---|---|
| OpenClaw Gateway | 执行中枢 | WebSocket ws://127.0.0.1:18789 | MockAdapter |
| LanceDB | 本地向量记忆库 | embedded，`~/.openclaw/memory/lancedb` | MockAdapter |
| Ollama | Embedding 模型 | HTTP :11434 | 关闭语义搜索 |
| Obsidian | 知识库 | Local REST Plugin :27123 | MockAdapter |
| Evolver | 进化 sub-agent | OpenClaw sub-agent | MockAdapter |
| WeChat ClawBot | 通知推送渠道 | 腾讯官方插件，QR 扫码绑定 | 降级提示 |
| 飞书 | 主力对话渠道 | lark-cli + OpenClaw 内置插件 | 降级提示 |

---

## 三、技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19, TypeScript, Vite, Tailwind CSS |
| 状态管理 | Zustand（本地）+ TanStack Query（服务端） |
| 可视化 | React Flow（Agent 拓扑图）|
| Bridge | Node.js, TypeScript, Hono |
| Schema | Zod（全项目统一，packages/core）|
| 测试 | Vitest（单元）+ Playwright（E2E）|
| 包管理 | pnpm workspaces |
| 向量数据库 | LanceDB embedded |
| Embedding | nomic-embed-text（Ollama 本地运行）|
| 桌面封装 | Electron（Phase 13，将 React 前端 + Node.js Bridge 一体打包）|

---

## 四、Monorepo 结构

```
opc-agent-center/
├── apps/
│   ├── web/                    # React 前端
│   │   ├── src/
│   │   │   ├── layouts/        # AppShell（TopBar + LeftNav + RightRail）
│   │   │   ├── pages/          # 各功能页面
│   │   │   ├── stores/         # Zustand stores
│   │   │   ├── components/     # 共用组件（ErrorBoundary 等）
│   │   │   └── lib/            # bridgeClient.ts
│   │   └── e2e/                # Playwright 测试
│   ├── bridge/                 # Node.js 中间层
│   │   └── src/
│   │       ├── adapters/       # 所有 adapter（Mock + Real）
│   │       ├── routes/         # Hono 路由
│   │       └── server.ts
│   └── desktop/                # Electron 主进程（Phase 13，待建）
│       ├── main.ts             # Electron main process，内嵌启动 Bridge
│       ├── preload.ts
│       └── electron-builder.yml
├── packages/
│   ├── core/                   # Zod schemas + 类型（所有数据结构定义）
│   ├── ui/                     # 液态玻璃组件库
│   └── design-tokens/          # --opc-* CSS variables
├── skills/
│   └── evolver/                # Evolver sub-agent 配置
│       ├── SKILL.md
│       └── SOUL.md
├── data/mock/                  # 所有 mock JSON 数据
└── docs/
    ├── spec.md                 # 完整工程规格
    ├── ui_system.md            # UI 设计系统
    ├── memory-setup.md         # LanceDB + Ollama 配置
    ├── feishu-setup.md         # 飞书渠道配置
    ├── obsidian-setup.md       # Obsidian 接入说明
    └── security.md             # 安全边界文档
```

---

## 五、前端页面

| 路由 | 页面 | 核心功能 |
|---|---|---|
| `/` | Dashboard | 6 个系统状态卡、Agent 拓扑图（React Flow）、任务时间线 |
| `/chat` | Chat Center | 三栏布局，多渠道会话，@agent /skill 命令，mock 自动回复 |
| `/agents` | Agent Center | Agent 详情、状态、日志（占位页，后续扩展）|
| `/skills` | Skill Center | 技能列表、搜索筛选、健康评分、patch 审核、进化历史 |
| `/memory` | Memory 面板 | 三栏浏览/搜索/编辑，Evolver 整理日志，软删除/恢复 |
| `/notifications` | 通知中心 | 分类筛选，审批操作，diff 预览，批量归档 |
| `/knowledge` | Knowledge | Obsidian vault 文件树，Markdown 预览，Review Queue，深链接 |
| `/settings` | Settings | Bridge URL、Gateway 模式、Token 配置 |

---

## 六、记忆层架构

### 两层分工

**Active Memory Plugin**（OpenClaw 官方，pre-reply 触发）
- 每次主 agent 回复前自动从 LanceDB 召回相关记忆
- 注入系统 context，无需手动干预
- 支持 message / recent / full 三种 context 模式

**LanceDB 本地向量库**（embedded，无独立进程）
- Embedding 模型：nomic-embed-text（768 维，Ollama 本地）
- 数据目录：`~/.openclaw/memory/lancedb/`
- 三张表：episodic（对话片段）/ semantic（事实偏好）/ procedural（Skill 经验）

### Memory 数据模型

```typescript
type MemoryEntry = {
  id: string           // UUID
  content: string      // 记忆内容
  type: 'episodic' | 'semantic' | 'procedural'
  tags: string[]
  source: string       // 来源 skill / conversation id
  created_at: string
  updated_at: string
  quality_score: number // 0-1，Evolver 维护
  is_core: boolean     // true = 永不自动删除
  merged_from?: string[] // 合并来源
  archived_at?: string   // 软删除时间
}
```

### 操作权限

- **用户**：浏览、搜索、编辑内容、打标签、标记核心、手动软删除
- **Evolver**：自动合并重复、清理低质量旧条目（软删除）、写入整理日志
- **is_core = true**：任何自动化操作均不可删除

---

## 七、Evolver Agent

### 定位

OpenClaw sub-agent，专职系统进化。模型：claude-opus-4-6（自定义网关）。

### 触发机制

| 触发条件 | 动作 | 需审核 |
|---|---|---|
| Skill 调用 ≥10 次 或失败率 >20% | 质量评估 + patch 生成 | 逻辑变更需审核 |
| 任务被用户否决/回滚 | 反思 + memory 更新 | 自动 |
| 每周日凌晨 3 点 cron | Memory 整理 + Skill 全局扫描 | 自动（日志可查）|
| 前端手动触发 | 指定 Skill 的 eval | 审核 |

### Skill Patch 权限边界

**自动应用（无需审核）**：
- description、注释、tags、examples
- 非逻辑性 prompt 措辞优化

**必须审核**：
- 工具调用序列变更
- 步骤增减
- 条件分支修改
- output schema 变更
- 任何涉及 S3/S4 动作的修改

### Eval 评分公式

```
历史分 = (用户接受数 / 总调用数) * 0.6 + (无重试数 / 总调用数) * 0.4
生成分 = Opus 对自动生成测试用例的评分
综合分 = 历史分 * 0.6 + 生成分 * 0.4

历史数据 < 5 条时：综合分 = 历史分 * 0.2 + 生成分 * 0.8
```

### Memory 整理规则

- 语义相似度 > 0.92 的记忆对：合并，保留质量分最高的
- > 90 天且 quality_score < 0.3：软删除
- 软删除保留 90 天后物理删除
- `is_core = true`：永不自动删除
- 所有操作写入 evolver_log，前端可查看并一键恢复

---

## 八、安全设计

### 核心原则

- 默认本机访问，不暴露公网
- Secrets 不进前端持久化（只用 sessionStorage，不用 localStorage）
- Secrets 不进 Git 仓库
- 外部内容（IM 消息、网页）是数据，不是指令（防 prompt injection）
- 高风险动作（S3/S4）必须经通知中心审批后才执行

### S3/S4 审批清单

以下动作必须经用户在通知中心审批，审批通过后系统才执行：
- 发送 IM 消息 / 邮件
- 推送到 WeChat / 飞书
- 发布内容（发文、发社媒、发邮件群发）
- 修改代码并 push / merge
- 生产部署
- 生产写操作 / 数据库写
- 删除文件
- DNS/cloud 配置变更
- 付款操作

### 日志脱敏字段

Bridge 的 `sanitizeLog()` 会自动脱敏：
`token, password, apikey, api_key, secret, authorization, cookie, private_key, ssh_key, session, bearer`

---

## 九、IM 渠道

### WeChat ClawBot（通知推送）

- 腾讯官方插件，2026-03-22 正式发布
- 安装：`npx -y @tencent-weixin/openclaw-weixin-cli@latest install`
- 扫码绑定个人微信账号
- 用途：接收审批提醒、任务报告、Evolver patch 通知
- 前端：通知卡片有"推送到微信"按钮

### 飞书（主力对话）

- OpenClaw ≥ 2026.2 内置飞书插件
- 配置工具：`lark-cli`（飞书官方开源，MIT 协议）
- 安装：`npm install -g @larksuite/cli`
- 配置：`lark-cli config init --new && lark-cli auth login --recommend`
- 用途：日常对话、任务下发、接收 agent 回复
- 注意：OpenClaw health check 每 60s 调用一次飞书 API，月均消耗 ~27000 次免费配额

---

## 十、开发阶段记录

| Phase | 内容 | 状态 |
|---|---|---|
| 0 | Monorepo 脚手架 + Zod schemas + mock data | ✅ |
| 1 | 液态玻璃 UI 组件库 + AppShell | ✅ |
| 2 | Dashboard + Agent 拓扑图 + Task 时间线 | ✅ |
| 3 | Bridge 中间层 + OpenClaw Gateway Adapter | ✅ |
| 4 | Chat Center + IM 同步 | ✅ |
| 5 | Notification Center + Task Capsule | ✅ |
| 6 | Skill Center + 进化历史 + Eval | ✅ |
| 7 | LanceDB Memory 层 + Memory 面板 | ✅ |
| 8 | Evolver Agent + Memory 整理日志 | ✅ |
| 9 | Obsidian Adapter + Knowledge 页面 | ✅ |
| 10 | 安全打磨 + Playwright E2E + 代码分割 | ✅ |
| 11 | OpenClaw live 接入 + LanceDB real 接入 | ✅ |
| 12（进行中）| Obsidian 桌面端 + WeChat + 飞书 + Evolver 真实接入 | 🔄 |
| 13（规划中）| Electron 桌面应用封装，前端 + Bridge 一体打包 | 📋 |

---

## 十一、启动命令

```bash
# Mock 模式（开发调试，无需任何外部服务）
pnpm dev

# Live 模式（需要 OpenClaw Gateway 运行）
OPENCLAW_MODE=live pnpm dev

# 完整 Live 模式（所有真实系统）
OPENCLAW_MODE=live LANCEDB_MODE=real OBSIDIAN_MODE=real pnpm dev

# Bridge 单独启动
pnpm --filter @opc/bridge dev

# 前端单独启动
pnpm --filter @opc/web dev

# 测试
pnpm test           # Vitest 单元测试
pnpm test:e2e       # Playwright E2E 测试
pnpm typecheck      # TypeScript 类型检查
pnpm lint           # ESLint
pnpm build          # 生产构建

# Electron 开发模式（Phase 13 完成后）
pnpm --filter @opc/desktop dev

# Electron 打包（Phase 13 完成后）
pnpm --filter @opc/desktop build:mac    # macOS .dmg
pnpm --filter @opc/desktop build:win    # Windows .exe
```

---

## 十二、环境变量

`apps/bridge/.env.example`（完整）：

```bash
# Bridge
BRIDGE_PORT=3001

# OpenClaw Gateway
OPENCLAW_MODE=mock              # mock | live
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
OPENCLAW_DEVICE_NAME=opc-bridge
# OPENCLAW_TOKEN=               # 从 openclaw.json 读取，不硬编码

# LanceDB
LANCEDB_MODE=mock               # mock | real
LANCEDB_DB_PATH=~/.openclaw/memory/lancedb
OLLAMA_URL=http://localhost:11434
EMBEDDING_MODEL=nomic-embed-text

# Obsidian
OBSIDIAN_MODE=mock              # mock | real（需要 Obsidian 桌面端运行）
OBSIDIAN_API_URL=http://localhost:27123
OBSIDIAN_API_KEY=               # 从 ~/.openclaw/obsidian-api-token.txt 自动读取

# 飞书（由 lark-cli config init 生成，写入 .env.local）
FEISHU_APP_ID=
FEISHU_APP_SECRET=
```

---

## 十三、边界原则

明确的设计约束：

- **不引入** n8n / Zapier / Make 固定 DAG 流程（用 OpenClaw + Skill 替代）
- **不允许全自动**发布内容、推送代码、生产部署——必须经审批
- **不把** Obsidian 内容全量注入 prompt
- **不把** Agent 日志全量发给任何外部服务
- **不在**前端直接持有高权限密钥

---

## 十四、已知 TODO（后续可接入）

| 项目 | 说明 |
|---|---|
| Obsidian REST API | 需要 Obsidian 桌面端启动后才可用，首次需在 GUI 开启插件 |
| Evolver 真实触发 | sub-agent 注册后需验证 OpenClaw 实际调度 Evolver 的触发链路 |
| WsOpenClawAdapter 完整事件映射 | 已完成 v3 握手，完整事件字段映射待真实 Gateway 运行验证 |
| Obsidian Sync | 服务器 vault 和本地桌面 vault 同步（可用 git 或 Obsidian Sync）|
| Claude Code 接入 | Coding Agent 可通过 OpenClaw sub-agent 调度，前端 Agent Graph 已预留节点 |
| 更多 IM 渠道 | Telegram / Discord / Signal 均有 OpenClaw 官方/社区插件 |
| nomic-embed-text 替换 | 可换 mxbai-embed-large（本机已有）获得更好的中文 embedding 效果 |
| Electron 打包 | Phase 13：apps/desktop，main process 内嵌启动 Bridge，electron-builder 打包 |
