import { z } from "zod";

export const opcEventTypeSchema = z.enum([
  "service.health.changed",
  "integration.checked",
  "chat.message.created",
  "agent.status.changed",
  "task.created",
  "task.started",
  "task.progress",
  "task.completed",
  "task.failed",
  "capsule.created",
  "notification.created",
  "notification.resolved",
  "notification.rejected",
  "notification.changes_requested",
  "skill.changed",
  "skill.registry.scanned",
  "skill.run.created",
  "skill.run.waiting_approval",
  "skill.run.started",
  "skill.run.completed",
  "skill.run.failed",
  "agent.run.created",
  "agent.run.started",
  "agent.run.completed",
  "agent.run.failed",
  "approval.created",
  "approval.approved",
  "approval.rejected",
  "approval.changes_requested",
  "approval.expired",
  "approval.effect.started",
  "approval.effect.succeeded",
  "approval.effect.failed",
  "coding.run.created",
  "coding.run.waiting_approval",
  "coding.run.started",
  "coding.run.completed",
  "coding.run.failed",
  "hermes.context_pack.created",
  "hermes.reflection.created",
  "hermes.reflection.requested",
  "hermes.reflection.completed",
  "hermes.candidate.created",
  "hermes.candidate.approved",
  "hermes.candidate.rejected",
  "hermes.candidate.applied",
  "obsidian.note.preview_created",
  "obsidian.note.write_requested",
  "obsidian.note.changed",
  "obsidian.note.written",
  "obsidian.note.write_failed",
  "obsidian.review_note.written",
  "openclaw.message.received",
  "openclaw.message.sent",
  "openclaw.conversation.message.received",
  "openclaw.conversation.message.sent",
  "openclaw.conversation.thread.created",
  "openclaw.conversation.sync.failed",
  "conversation.message.received",
  "conversation.message.sent",
  "skill.eval.started",
  "skill.eval.completed",
  "skill.promotion.requested",
  "skill.promotion.applied",
  "coding_agent.run.started",
  "coding_agent.run.completed",
  "coding_agent.run.failed",
  "capsule.updated",
  "capsule.completed",
]);
export type OpcEventType = z.infer<typeof opcEventTypeSchema>;

export const opcEventTypes = opcEventTypeSchema.options;

export const opcEventSourceSchema = z.enum([
  "web",
  "bridge",
  "openclaw",
  "hermes",
  "obsidian",
  "codex",
  "claude",
  "mock",
]);
export type OpcEventSource = z.infer<typeof opcEventSourceSchema>;

export const eventSeveritySchema = z.enum(["debug", "info", "warning", "error"]);
export type EventSeverity = z.infer<typeof eventSeveritySchema>;

export const eventRelatedSchema = z.object({
  taskId: z.string().min(1).optional(),
  capsuleId: z.string().min(1).optional(),
  skillRunId: z.string().min(1).optional(),
  agentRunId: z.string().min(1).optional(),
  codingRunId: z.string().min(1).optional(),
  approvalId: z.string().min(1).optional(),
  hermesCandidateId: z.string().min(1).optional(),
  obsidianReviewNoteId: z.string().min(1).optional(),
  skillEvalId: z.string().min(1).optional(),
  skillPromotionId: z.string().min(1).optional(),
  openclawConversationId: z.string().min(1).optional(),
});
export type EventRelated = z.infer<typeof eventRelatedSchema>;

export const opcEventSchema = z.object({
  id: z.string().min(1),
  ts: z.string().datetime(),
  type: opcEventTypeSchema,
  source: opcEventSourceSchema,
  severity: eventSeveritySchema.default("info"),
  summary: z.string().default(""),
  correlationId: z.string().min(1).optional(),
  taskId: z.string().min(1).optional(),
  conversationId: z.string().min(1).optional(),
  agentId: z.string().min(1).optional(),
  related: eventRelatedSchema.optional(),
  payload: z.unknown().optional(),
});
export type OpcEvent<TPayload = unknown> = Omit<z.infer<typeof opcEventSchema>, "payload"> & {
  payload?: TPayload;
};

export function createOpcEvent<TPayload>(
  input: Omit<OpcEvent<TPayload>, "id" | "ts" | "severity" | "summary"> & {
    id?: string;
    ts?: string;
    severity?: EventSeverity;
    summary?: string;
  },
): OpcEvent<TPayload> {
  return {
    id: input.id ?? `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: input.ts ?? new Date().toISOString(),
    type: input.type,
    source: input.source,
    severity: input.severity ?? "info",
    summary: input.summary ?? input.type,
    correlationId: input.correlationId,
    taskId: input.taskId,
    conversationId: input.conversationId,
    agentId: input.agentId,
    related: input.related,
    payload: input.payload,
  };
}
