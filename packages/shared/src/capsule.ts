import { z } from "zod";

export const riskLevelSchema = z.enum(["S0", "S1", "S2", "S3", "S4"]);
export const capsuleStatusSchema = z.enum([
  "draft",
  "running",
  "completed",
  "failed",
  "cancelled",
  "waiting_approval",
]);

export const capsuleOutputSchema = z.object({
  kind: z.enum(["message", "file", "obsidian_note", "draft", "diff", "url", "log", "other"]),
  label: z.string().min(1),
  uri: z.string().optional(),
  preview: z.string().optional(),
});

export const capsuleSkillCandidateSchema = z.object({
  type: z.enum(["new_skill", "patch_skill", "eval_case", "pitfall"]),
  skillName: z.string().min(1).optional(),
  summary: z.string().min(1),
  rationale: z.string().min(1),
});

export const capsuleApprovalSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["publish", "ops", "code", "skill_patch", "memory_update", "obsidian_write"]),
  status: z.enum(["waiting", "approved", "rejected", "changes_requested"]),
  title: z.string().min(1),
  summary: z.string().min(1),
  createdAt: z.string().datetime(),
  resolvedAt: z.string().datetime().optional(),
});

export const taskCapsuleV1Schema = z.object({
  id: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  taskId: z.string().min(1),
  conversationId: z.string().min(1).optional(),
  userRequest: z.string(),
  goal: z.string().min(1),
  intent: z.string().min(1),
  riskLevel: riskLevelSchema,
  status: capsuleStatusSchema,
  conductorAgentId: z.string().min(1),
  workerAgentIds: z.array(z.string()),
  skillsUsed: z.array(z.string()),
  inputs: z.array(z.string()),
  actionsSummary: z.array(z.string()),
  outputs: z.array(capsuleOutputSchema),
  verification: z.array(z.string()),
  problems: z.array(z.string()),
  memoryCandidates: z.array(z.string()),
  skillCandidates: z.array(capsuleSkillCandidateSchema),
  approvals: z.array(capsuleApprovalSchema),
  confidence: z.number().min(0).max(1),
  rawTraceRefs: z.array(z.string()),
});
export type TaskCapsuleV1 = z.infer<typeof taskCapsuleV1Schema>;

export type CreateTaskCapsuleInput = Omit<
  TaskCapsuleV1,
  "id" | "createdAt" | "updatedAt" | "status" | "confidence" | "rawTraceRefs"
> &
  Partial<Pick<TaskCapsuleV1, "id" | "status" | "confidence" | "rawTraceRefs">>;

export function createTaskCapsuleV1(input: CreateTaskCapsuleInput): TaskCapsuleV1 {
  const now = new Date().toISOString();
  return taskCapsuleV1Schema.parse({
    ...input,
    id: input.id ?? `cap-${input.taskId}-${Date.now()}`,
    createdAt: now,
    updatedAt: now,
    status: input.status ?? "draft",
    confidence: input.confidence ?? 0.5,
    rawTraceRefs: input.rawTraceRefs ?? [],
  });
}
