import { z } from "zod";

export const riskLevelSchema = z.enum(["S0", "S1", "S2", "S3", "S4"]);
export type RiskLevel = z.infer<typeof riskLevelSchema>;

export const opcAgentTypeSchema = z.enum([
  "conductor",
  "hermes",
  "openclaw-agent",
  "worker",
  "coding-agent",
  "external-tool",
]);
export type OpcAgentType = z.infer<typeof opcAgentTypeSchema>;

export const opcAgentStatusSchema = z.enum([
  "idle",
  "planning",
  "running",
  "waiting_approval",
  "blocked",
  "failed",
  "completed",
  "evolving",
  "offline",
]);
export type OpcAgentStatus = z.infer<typeof opcAgentStatusSchema>;

export const runtimeSchema = z.enum(["host", "docker", "ssh", "modal", "daytona", "unknown"]);

export const opcAgentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: opcAgentTypeSchema,
  status: opcAgentStatusSchema,
  role: z.string().min(1),
  currentTaskId: z.string().min(1).optional(),
  currentSkill: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  provider: z.string().min(1).optional(),
  workspace: z.string().min(1).optional(),
  runtime: runtimeSchema.optional(),
  riskCeiling: riskLevelSchema,
  allowedSkills: z.array(z.string()),
  upstreamAgentIds: z.array(z.string()),
  downstreamAgentIds: z.array(z.string()),
  metrics: z
    .object({
      activeTasks: z.number().int().nonnegative(),
      successRate: z.number().min(0).max(1).optional(),
      avgDurationMs: z.number().nonnegative().optional(),
      tokensToday: z.number().int().nonnegative().optional(),
      costTodayUsd: z.number().nonnegative().optional(),
    })
    .optional(),
});
export type OpcAgent = z.infer<typeof opcAgentSchema>;

export const opcSkillSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  version: z.string().min(1).optional(),
  domain: z.enum([
    "governance",
    "knowledge",
    "research",
    "dev",
    "ops",
    "publishing",
    "learning",
    "other",
  ]),
  ownerAgent: z.string().min(1),
  risk: riskLevelSchema,
  status: z.enum(["enabled", "disabled", "draft", "deprecated"]),
  trustState: z.enum(["bundled", "local", "verified", "experimental", "quarantined"]),
  path: z.string().min(1),
  writesTo: z.array(z.string()),
  externalActions: z.array(z.string()),
  usage: z.object({
    count: z.number().int().nonnegative(),
    lastUsedAt: z.string().datetime().optional(),
    successRate: z.number().min(0).max(1).optional(),
  }),
  eval: z.object({
    status: z.enum(["unknown", "passing", "failing", "not_configured"]),
    lastRunAt: z.string().datetime().optional(),
  }),
});
export type OpcSkill = z.infer<typeof opcSkillSchema>;

export const taskCapsuleStatusSchema = z.enum([
  "planned",
  "running",
  "waiting_approval",
  "blocked",
  "failed",
  "completed",
]);

export const taskCapsuleSchema = z.object({
  taskId: z.string().min(1),
  title: z.string().min(1),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  status: taskCapsuleStatusSchema,
  requester: z.object({
    type: z.enum(["user", "agent", "cron", "system"]),
    channel: z.string().optional(),
    conversationId: z.string().optional(),
  }),
  conductorAgentId: z.string().min(1),
  workerAgentIds: z.array(z.string()),
  externalAgentIds: z.array(z.string()).optional(),
  goal: z.string().min(1),
  risk: riskLevelSchema,
  skillsUsed: z.array(z.string()),
  inputsSummary: z.array(z.string()),
  actionsSummary: z.array(z.string()),
  outputs: z.array(
    z.object({
      type: z.string().min(1),
      label: z.string().min(1),
      uri: z.string().optional(),
    }),
  ),
  verification: z.array(z.string()),
  problems: z.array(z.string()),
  memoryCandidates: z.array(z.string()),
  skillCandidates: z.array(z.string()),
  notificationsCreated: z.array(z.string()),
  metrics: z.object({
    durationMs: z.number().nonnegative().optional(),
    tokensIn: z.number().int().nonnegative().optional(),
    tokensOut: z.number().int().nonnegative().optional(),
    estimatedCostUsd: z.number().nonnegative().optional(),
    toolCalls: z.number().int().nonnegative().optional(),
  }),
  confidence: z.number().min(0).max(1).optional(),
});
export type TaskCapsule = z.infer<typeof taskCapsuleSchema>;

export const notificationSeveritySchema = z.enum(["info", "success", "warning", "danger"]);
export type NotificationSeverity = z.infer<typeof notificationSeveritySchema>;

export const notificationStatusSchema = z.enum([
  "unread",
  "read",
  "waiting_action",
  "resolved",
  "rejected",
  "changes_requested",
  "archived",
  "dismissed",
]);
export type NotificationStatus = z.infer<typeof notificationStatusSchema>;

export const notificationActionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  type: z.enum([
    "approve",
    "reject",
    "request_changes",
    "open_task",
    "open_agent",
    "open_skill_diff",
    "open_obsidian_note",
    "open_capsule",
    "open_related_note",
    "open_related_skill",
    "ask_agent_followup",
    "mark_resolved",
    "archive",
  ]),
});
export type NotificationAction = z.infer<typeof notificationActionSchema>;

export const notificationLinkSchema = z.object({
  label: z.string().min(1),
  href: z.string().min(1),
  kind: z.enum(["task", "agent", "skill", "obsidian", "capsule", "external"]).optional(),
});
export type NotificationLink = z.infer<typeof notificationLinkSchema>;

export const opcNotificationSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    "approval_required",
    "task_report",
    "task_failed",
    "blocked",
    "skill_patch",
    "new_skill_candidate",
    "memory_candidate",
    "code_review",
    "publish_review",
    "obsidian_review",
    "security_alert",
    "system_health",
  ]),
  severity: notificationSeveritySchema,
  status: notificationStatusSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  createdAt: z.string().datetime(),
  source: z.object({
    agentId: z.string().optional(),
    taskId: z.string().optional(),
    skillName: z.string().optional(),
    connector: z.enum(["openclaw", "hermes", "obsidian", "codex", "claude-code"]).optional(),
  }),
  risk: riskLevelSchema.optional(),
  actions: z.array(notificationActionSchema),
  links: z.array(notificationLinkSchema),
});
export type OpcNotification = z.infer<typeof opcNotificationSchema>;

export const conversationParticipantSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["human", "agent", "tool", "system"]),
  displayName: z.string().min(1),
});
export type ConversationParticipant = z.infer<typeof conversationParticipantSchema>;

export const conversationChannelSchema = z.enum([
  "panel",
  "telegram",
  "wechat",
  "slack",
  "webchat",
  "cli",
  "unknown",
]);

export const conversationSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  channel: conversationChannelSchema,
  openclawSessionId: z.string().optional(),
  openclawThreadId: z.string().optional(),
  focusedAgentId: z.string().optional(),
  participants: z.array(conversationParticipantSchema),
  lastMessageAt: z.string().datetime(),
  status: z.enum(["active", "archived", "waiting_approval", "agent_running"]),
});
export type Conversation = z.infer<typeof conversationSchema>;

export const opcAttachmentSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["link", "file", "image", "note", "capsule"]),
  label: z.string().min(1),
  uri: z.string().min(1),
});
export type OpcAttachment = z.infer<typeof opcAttachmentSchema>;

export const opcMessageSchema = z.object({
  id: z.string().min(1),
  conversationId: z.string().min(1),
  channel: conversationChannelSchema,
  direction: z.enum(["inbound", "outbound", "internal"]),
  role: z.enum(["user", "assistant", "agent", "tool", "system"]),
  author: z.object({
    type: z.enum(["human", "agent", "tool", "system"]),
    id: z.string().optional(),
    displayName: z.string().min(1),
  }),
  content: z.string(),
  createdAt: z.string().datetime(),
  attachments: z.array(opcAttachmentSchema).optional(),
  taskId: z.string().optional(),
  skillName: z.string().optional(),
});
export type OpcMessage = z.infer<typeof opcMessageSchema>;

export const testRunSummarySchema = z.object({
  name: z.string().min(1),
  status: z.enum(["passed", "failed", "skipped", "not_run"]),
  durationMs: z.number().nonnegative().optional(),
  summary: z.string().optional(),
});
export type TestRunSummary = z.infer<typeof testRunSummarySchema>;

export const codingAgentRunSchema = z.object({
  id: z.string().min(1),
  provider: z.enum(["codex", "claude-code", "openhands", "roo", "other"]),
  status: z.enum(["queued", "running", "blocked", "failed", "completed"]),
  taskId: z.string().min(1),
  repoPath: z.string().min(1),
  worktreePath: z.string().min(1).optional(),
  branch: z.string().min(1).optional(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
  filesChanged: z.array(z.string()),
  tests: z.array(testRunSummarySchema),
  diffSummary: z.string().optional(),
  approvalNotificationId: z.string().optional(),
});
export type CodingAgentRun = z.infer<typeof codingAgentRunSchema>;

export const opcEventSchema = z.object({
  id: z.string().min(1),
  timestamp: z.string().datetime(),
  source: z.enum(["gateway", "hermes", "obsidian", "bridge", "ui"]),
  type: z.string().min(1),
  payload: z.unknown(),
});
export type OpcEvent = z.infer<typeof opcEventSchema>;

export const systemHealthSchema = z.object({
  gateway: z.enum(["connected", "reconnecting", "offline"]),
  hermes: z.enum(["connected", "available", "unavailable"]),
  obsidian: z.enum(["connected", "unavailable"]),
  codingAgents: z.object({
    codex: z.enum(["idle", "active", "unavailable"]),
    claudeCode: z.enum(["idle", "active", "unavailable"]),
  }),
  bridge: z.enum(["running", "error"]),
});
export type SystemHealth = z.infer<typeof systemHealthSchema>;

export const openClawConnectionConfigSchema = z.object({
  mode: z.enum(["mock", "ws", "cli"]).default("mock"),
  gatewayUrl: z.string().default("ws://127.0.0.1:18789"),
  token: z.string().optional(),
  password: z.string().optional(),
  cliPath: z.string().optional(),
  deviceName: z.string().optional(),
});
export type OpenClawConnectionConfig = z.infer<typeof openClawConnectionConfigSchema>;

export const openClawStatusSchema = z.object({
  connected: z.boolean(),
  mode: z.enum(["mock", "ws", "cli"]),
  gatewayUrl: z.string().optional(),
  authStatus: z.enum(["unknown", "authenticated", "failed", "not_required"]).default("unknown"),
  latencyMs: z.number().nonnegative().optional(),
  lastError: z.string().optional(),
});
export type OpenClawStatus = z.infer<typeof openClawStatusSchema>;

export const openClawEventSchema = z.object({
  id: z.string(),
  timestamp: z.string().datetime(),
  type: z.string(),
  source: z.string().optional(),
  payload: z.unknown(),
});
export type OpenClawEvent = z.infer<typeof openClawEventSchema>;

export const sendMessageInputSchema = z.object({
  conversationId: z.string().optional(),
  channel: conversationChannelSchema.default("panel"),
  content: z.string().min(1),
  focusedAgentId: z.string().optional(),
  taskId: z.string().optional(),
});
export type SendMessageInput = z.infer<typeof sendMessageInputSchema>;

export const sendMessageResultSchema = z.object({
  message: opcMessageSchema,
  autoReply: opcMessageSchema.optional(),
  event: opcEventSchema.optional(),
});
export type SendMessageResult = z.infer<typeof sendMessageResultSchema>;

export const opcSubagentSchema = z.object({
  id: z.string(),
  parentAgentId: z.string(),
  sessionKey: z.string(),
  status: opcAgentStatusSchema,
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
});
export type OpcSubagent = z.infer<typeof opcSubagentSchema>;

export const taskLogSchema = z.object({
  taskId: z.string(),
  entries: z.array(
    z.object({
      id: z.string(),
      timestamp: z.string().datetime(),
      level: z.enum(["debug", "info", "warning", "error"]),
      message: z.string(),
    }),
  ),
});
export type TaskLog = z.infer<typeof taskLogSchema>;

export const contextPackInputSchema = z.object({
  taskId: z.string().optional(),
  conversationId: z.string().optional(),
  goal: z.string().optional(),
  agentId: z.string().optional(),
});
export type ContextPackInput = z.infer<typeof contextPackInputSchema>;

export const contextPackResultSchema = z.object({
  userPreferences: z.array(z.string()),
  projectContext: z.array(z.string()),
  relevantHistory: z.array(z.string()),
  warnings: z.array(z.string()),
  suggestedSkills: z.array(z.string()),
});
export type ContextPackResult = z.infer<typeof contextPackResultSchema>;

export const skillPatchSchema = z.object({
  id: z.string(),
  skillName: z.string(),
  title: z.string(),
  summary: z.string(),
  before: z.string(),
  after: z.string(),
  status: z.enum(["proposed", "approved", "rejected", "experimental"]),
  createdAt: z.string().datetime(),
});
export type SkillPatch = z.infer<typeof skillPatchSchema>;

export const reflectionResultSchema = z.object({
  lessons: z.array(z.string()),
  memoryCandidates: z.array(z.string()),
  skillPatches: z.array(skillPatchSchema),
  issues: z.array(z.string()),
});
export type ReflectionResult = z.infer<typeof reflectionResultSchema>;

export const hermesStatusSchema = z.object({
  available: z.boolean(),
  transport: z.enum(["cli", "http", "mock"]),
  version: z.string().optional(),
  memoryStatus: z.string().optional(),
  pendingReflections: z.number().int().nonnegative().optional(),
});
export type HermesStatus = z.infer<typeof hermesStatusSchema>;

export const skillProposalSchema = z.object({
  title: z.string(),
  goal: z.string(),
  ownerAgent: z.string(),
  risk: riskLevelSchema,
});
export type SkillProposal = z.infer<typeof skillProposalSchema>;

export const skillCandidateSchema = z.object({
  name: z.string(),
  skill: opcSkillSchema,
  markdown: z.string(),
});
export type SkillCandidate = z.infer<typeof skillCandidateSchema>;

export const skillPatchInputSchema = z.object({
  skillName: z.string(),
  currentMarkdown: z.string(),
  goal: z.string(),
});
export type SkillPatchInput = z.infer<typeof skillPatchInputSchema>;

export const obsidianStatusSchema = z.object({
  connected: z.boolean(),
  mode: z.enum(["mock", "rest"]),
  apiUrl: z.string().optional(),
  vaultName: z.string().optional(),
  pendingWrites: z.number().int().nonnegative().optional(),
  lastError: z.string().optional(),
});
export type ObsidianStatus = z.infer<typeof obsidianStatusSchema>;

export const obsidianFileSchema = z.object({
  path: z.string(),
  name: z.string(),
  type: z.enum(["file", "folder"]),
  children: z.array(z.lazy((): z.ZodType<ObsidianFile> => obsidianFileSchema)).optional(),
});
export type ObsidianFile = {
  path: string;
  name: string;
  type: "file" | "folder";
  children?: ObsidianFile[];
};

export const obsidianNoteSchema = z.object({
  path: z.string(),
  title: z.string(),
  content: z.string(),
  tags: z.array(z.string()).default([]),
  updatedAt: z.string().datetime(),
  etag: z.string().optional(),
});
export type ObsidianNote = z.infer<typeof obsidianNoteSchema>;

export const obsidianSearchResultSchema = z.object({
  path: z.string(),
  title: z.string(),
  excerpt: z.string(),
  score: z.number().optional(),
});
export type ObsidianSearchResult = z.infer<typeof obsidianSearchResultSchema>;

export const writeOptionsSchema = z.object({
  mode: z.enum(["overwrite", "createOnly", "appendOnly"]),
  ifMatch: z.string().optional(),
});
export type WriteOptions = z.infer<typeof writeOptionsSchema>;

export const codingRunActionSchema = z.object({
  runId: z.string(),
  action: z.enum(["approve", "reject", "request_changes"]),
});
export type CodingRunAction = z.infer<typeof codingRunActionSchema>;
