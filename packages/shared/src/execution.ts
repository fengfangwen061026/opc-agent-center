import { z } from "zod";
import { riskLevelSchema } from "./capsule";

export const skillLifecycleSchema = z.enum(["draft", "experimental", "stable", "deprecated"]);
export const skillTrustSchema = z.enum(["trusted", "review_required", "untrusted", "blocked"]);
export const skillDomainSchema = z.enum([
  "core",
  "knowledge",
  "research",
  "coding",
  "ops",
  "publishing",
  "learning",
  "memory",
  "unknown",
]);
export type SkillDomain = z.infer<typeof skillDomainSchema>;

export const integrationIdV1Schema = z.enum([
  "openclaw",
  "hermes",
  "obsidian",
  "codex",
  "claude-code",
]);
export const integrationStatusV1Schema = z.object({
  id: integrationIdV1Schema,
  label: z.string().min(1),
  status: z.enum(["not_configured", "configured", "connected", "degraded", "offline", "error"]),
  mode: z.enum(["mock", "cli", "ws", "rest", "http", "real"]),
  version: z.string().optional(),
  lastCheckedAt: z.string().datetime(),
  capabilities: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1),
      status: z.enum(["available", "missing", "disabled", "blocked", "unknown"]),
      reason: z.string().optional(),
    }),
  ),
  requiredActions: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1),
      severity: z.enum(["info", "warning", "error"]),
      command: z.string().optional(),
      docsUrl: z.string().url().optional(),
    }),
  ),
  redactedConfig: z.record(z.union([z.string(), z.boolean(), z.number(), z.null()])),
});
export type IntegrationStatusV1 = z.infer<typeof integrationStatusV1Schema>;

export const policyActionTypeV1Schema = z.enum([
  "skill.execute",
  "coding.run",
  "coding.test",
  "obsidian.review.write",
  "hermes.reflect",
  "hermes.candidate.apply",
  "skill.promote",
  "openclaw.message.send",
  "service.start",
  "service.stop",
]);
export const policyDecisionInputV1Schema = z.object({
  actor: z.object({
    type: z.enum(["user", "agent", "system"]),
    id: z.string().min(1),
  }),
  action: z.object({
    type: policyActionTypeV1Schema,
    risk: riskLevelSchema,
    approvalRequired: z.boolean().optional(),
  }),
  resource: z
    .object({
      path: z.string().optional(),
      repoPath: z.string().optional(),
      workspacePath: z.string().optional(),
      skillId: z.string().optional(),
      serviceId: z.string().optional(),
      command: z.string().optional(),
      channel: z.string().optional(),
    })
    .optional(),
  context: z.record(z.unknown()).optional(),
});
export type PolicyDecisionInputV1 = z.infer<typeof policyDecisionInputV1Schema>;

export const policyDecisionV1Schema = z.object({
  allowed: z.boolean(),
  requiresApproval: z.boolean(),
  reason: z.string().min(1),
  severity: z.enum(["info", "warning", "danger"]),
  requiredEnv: z.array(z.string()).optional(),
  blockedBy: z.array(z.string()).optional(),
  normalizedPaths: z.record(z.string()).optional(),
  rollbackNote: z.string().optional(),
});
export type PolicyDecisionV1 = z.infer<typeof policyDecisionV1Schema>;

export const skillDescriptorV1Schema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  version: z.string().default("0.0.0"),
  path: z.string().min(1),
  source: z.enum(["workspace", "shared", "personal", "external", "mock"]),
  lifecycle: skillLifecycleSchema,
  trust: skillTrustSchema,
  domain: skillDomainSchema,
  ownerAgent: z.string().optional(),
  risk: riskLevelSchema,
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
  runner: z
    .enum([
      "builtin.echo",
      "builtin.create_task_capsule",
      "builtin.obsidian_review_note",
      "builtin.hermes_reflect_capsule",
      "builtin.codex_controlled_run",
      "builtin.claude_code_controlled_run",
      "builtin.skill_eval_run",
      "builtin.skill_patch_to_experimental",
      "builtin.memory_candidate_to_draft",
    ])
    .optional(),
  evalStatus: z.enum(["none", "passing", "failing", "unknown"]).default("none"),
  usage: z
    .object({
      totalRuns: z.number().int().nonnegative().default(0),
      successRuns: z.number().int().nonnegative().default(0),
      lastRunAt: z.string().datetime().optional(),
    })
    .default({ totalRuns: 0, successRuns: 0 }),
  frontmatter: z.record(z.unknown()).default({}),
  updatedAt: z.string().datetime(),
});
export type SkillDescriptorV1 = z.infer<typeof skillDescriptorV1Schema>;

export const skillRunV1Schema = z.object({
  id: z.string().min(1),
  skillId: z.string().min(1),
  taskId: z.string().optional(),
  capsuleId: z.string().optional(),
  requestedBy: z.string().default("user"),
  agentId: z.string().optional(),
  mode: z.enum(["dry_run", "preview", "execute"]),
  status: z.enum([
    "requested",
    "queued",
    "previewed",
    "waiting_approval",
    "running",
    "succeeded",
    "failed",
    "cancelled",
    "blocked",
  ]),
  risk: riskLevelSchema,
  input: z.record(z.unknown()).default({}),
  output: z.record(z.unknown()).default({}),
  events: z.array(z.string()).default([]),
  logsPath: z.string().optional(),
  approvalId: z.string().optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  error: z.string().optional(),
});
export type SkillRunV1 = z.infer<typeof skillRunV1Schema>;

export const approvalEffectV1Schema = z.object({
  id: z.string().min(1),
  targetType: z.enum([
    "skill_run",
    "coding_run",
    "hermes_candidate",
    "obsidian_review_note",
    "skill_promotion",
    "memory_candidate",
    "openclaw_message",
  ]),
  targetId: z.string().min(1),
  action: z.enum(["resume", "execute", "apply", "write", "promote", "send", "archive"]),
  paramsHash: z.string().min(1),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  idempotencyKey: z.string().min(1),
});
export type ApprovalEffectV1 = z.infer<typeof approvalEffectV1Schema>;

export const approvalRequestV1Schema = z.object({
  id: z.string().min(1),
  kind: z.enum([
    "skill_run",
    "coding_run",
    "obsidian_write",
    "publish_draft",
    "memory_update",
    "skill_patch",
    "skill_promotion",
    "ops_action",
    "openclaw_message",
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
  title: z.string().min(1),
  summary: z.string().min(1),
  risk: riskLevelSchema,
  requestedBy: z.string().min(1),
  related: z
    .object({
      taskId: z.string().optional(),
      capsuleId: z.string().optional(),
      skillRunId: z.string().optional(),
      codingRunId: z.string().optional(),
      hermesCandidateId: z.string().optional(),
      obsidianReviewNoteId: z.string().optional(),
      skillPromotionId: z.string().optional(),
      skillEvalId: z.string().optional(),
      openclawConversationId: z.string().optional(),
    })
    .default({}),
  proposedAction: z.object({
    label: z.string().min(1),
    commandPreview: z.string().optional(),
    filesTouched: z.array(z.string()).default([]),
    diffPreview: z.string().optional(),
    reversible: z.boolean().default(false),
    rollbackPlan: z.string().optional(),
  }),
  policyDecision: policyDecisionV1Schema.optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  effect: approvalEffectV1Schema.optional(),
});
export type ApprovalRequestV1 = z.infer<typeof approvalRequestV1Schema>;

export const agentRunV1Schema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1),
  parentRunId: z.string().optional(),
  taskId: z.string().min(1),
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
  goal: z.string().min(1),
  assignedSkills: z.array(z.string()).default([]),
  children: z.array(z.string()).default([]),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  summary: z.string().optional(),
  error: z.string().optional(),
});
export type AgentRunV1 = z.infer<typeof agentRunV1Schema>;

export const codingRunV1Schema = z.object({
  id: z.string().min(1),
  provider: z.enum(["codex", "claude_code"]),
  status: z.enum([
    "requested",
    "queued",
    "approved",
    "preparing_workspace",
    "waiting_approval",
    "running",
    "collecting_artifacts",
    "testing_optional",
    "completed",
    "succeeded",
    "failed",
    "cancelled",
    "blocked",
  ]),
  repoPath: z.string().min(1),
  workspacePath: z.string().min(1),
  branchName: z.string().optional(),
  worktreePath: z.string().optional(),
  prompt: z.string().min(1),
  model: z.string().optional(),
  timeoutMs: z.number().int().positive(),
  stdoutPath: z.string().optional(),
  stderrPath: z.string().optional(),
  diffPath: z.string().optional(),
  jsonlPath: z.string().optional(),
  finalPath: z.string().optional(),
  testLogPath: z.string().optional(),
  finalSummary: z.string().optional(),
  workspaceMode: z.enum(["worktree", "copy", "mock"]).optional(),
  changedFiles: z.array(z.string()).default([]),
  testCommand: z.string().optional(),
  testStatus: z.enum(["not_run", "passed", "failed", "skipped"]).default("not_run"),
  approvalId: z.string().optional(),
  capsuleId: z.string().optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  error: z.string().optional(),
});
export type CodingRunV1 = z.infer<typeof codingRunV1Schema>;

export const hermesCandidateV1Schema = z.object({
  id: z.string().min(1),
  kind: z.enum([
    "memory_update",
    "skill_patch",
    "new_skill",
    "user_profile_update",
    "memory_candidate",
    "skill_patch_candidate",
    "new_skill_candidate",
    "eval_candidate",
    "risk_policy_candidate",
  ]),
  status: z.enum(["draft", "waiting_review", "approved", "rejected", "applied", "archived"]),
  sourceCapsuleId: z.string().min(1),
  title: z.string().min(1),
  rationale: z.string().min(1),
  content: z.string().min(1),
  targetPath: z.string().optional(),
  patch: z.string().optional(),
  risk: riskLevelSchema.default("S1"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type HermesCandidateV1 = z.infer<typeof hermesCandidateV1Schema>;

export const hermesReflectionOutputSchema = z.object({
  summary: z.string().default(""),
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
export type HermesReflectionOutput = z.infer<typeof hermesReflectionOutputSchema>;

export const skillEvalV1Schema = z.object({
  id: z.string().min(1),
  skillId: z.string().min(1),
  status: z.enum(["queued", "running", "passed", "failed", "cancelled"]),
  casesTotal: z.number().int().nonnegative(),
  casesPassed: z.number().int().nonnegative(),
  casesFailed: z.number().int().nonnegative(),
  startedAt: z.string().datetime().optional(),
  finishedAt: z.string().datetime().optional(),
  reportPath: z.string().optional(),
  summary: z.string().optional(),
  failures: z
    .array(
      z.object({
        caseId: z.string().min(1),
        reason: z.string().min(1),
        expected: z.unknown().optional(),
        actual: z.unknown().optional(),
      }),
    )
    .optional(),
});
export type SkillEvalV1 = z.infer<typeof skillEvalV1Schema>;

export const skillPromotionRequestV1Schema = z.object({
  id: z.string().min(1),
  skillId: z.string().min(1),
  from: z.enum(["draft", "experimental"]),
  to: z.enum(["experimental", "stable"]),
  sourcePath: z.string().min(1),
  targetPath: z.string().min(1),
  diffPath: z.string().optional(),
  evalId: z.string().optional(),
  backupPath: z.string().optional(),
  status: z.enum(["draft", "waiting_approval", "approved", "applied", "rejected", "failed"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type SkillPromotionRequestV1 = z.infer<typeof skillPromotionRequestV1Schema>;

export const obsidianReviewNoteV1Schema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  slug: z.string().min(1),
  status: z.enum([
    "preview",
    "previewed",
    "waiting_approval",
    "writing",
    "written",
    "verified",
    "failed",
    "archived",
  ]),
  reviewQueuePath: z.string().min(1),
  targetPath: z.string().optional(),
  frontmatter: z.record(z.unknown()),
  markdown: z.string(),
  capsuleId: z.string().optional(),
  sourceRefs: z.array(z.string()).optional(),
  writeResult: z
    .object({
      writtenAt: z.string().datetime().optional(),
      verifiedAt: z.string().datetime().optional(),
      sha256: z.string().optional(),
      readbackSha256: z.string().optional(),
      readbackPreview: z.string().optional(),
      error: z.string().optional(),
    })
    .optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ObsidianReviewNoteV1 = z.infer<typeof obsidianReviewNoteV1Schema>;

export const openClawConversationEventV1Schema = z.object({
  id: z.string().min(1),
  source: z.literal("openclaw"),
  channel: z.string().optional(),
  threadId: z.string().optional(),
  sessionId: z.string().optional(),
  direction: z.enum(["inbound", "outbound"]),
  author: z.string().optional(),
  content: z.string(),
  receivedAt: z.string().datetime(),
  rawPath: z.string().optional(),
});
export type OpenClawConversationEventV1 = z.infer<typeof openClawConversationEventV1Schema>;
