import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { createOpcEvent, type ApprovalRequestV1, type PolicyDecisionV1 } from "@opc/shared";
import type { BridgeRuntime } from "../runtime";
import { writeJsonFile } from "../stores/jsonFiles";
import { evaluatePolicy } from "./policyEngine";
import { writeReviewNoteCreateOnlyAndVerify } from "./obsidianReviewWriter";

export type ApprovalEffectRecord = {
  effectId: string;
  idempotencyKey: string;
  paramsHash: string;
  status: "started" | "succeeded" | "failed";
  startedAt: string;
  completedAt?: string;
  policyDecision?: PolicyDecisionV1;
  rollbackNote?: string;
  result?: unknown;
  error?: string;
};

export class ApprovalEffectRunner {
  constructor(
    private readonly runtime: BridgeRuntime,
    private readonly dir: string,
  ) {}

  async apply(approval: ApprovalRequestV1): Promise<ApprovalEffectRecord | undefined> {
    if (!approval.effect) return undefined;
    const expected = hashEffectParams({
      targetType: approval.effect.targetType,
      targetId: approval.effect.targetId,
      action: approval.effect.action,
    });
    if (approval.effect.paramsHash !== expected) {
      const failed = this.record(approval, {
        status: "failed",
        error: "paramsHash mismatch; effect execution refused.",
      });
      this.emit(approval, "approval.effect.failed", failed);
      return failed;
    }
    const existing = this.load(approval.effect.id);
    if (existing?.status === "succeeded") return existing;
    const policyDecision = this.policyForApproval(approval);
    this.runtime.approvalStore.attachPolicyDecision(approval.id, policyDecision);
    const started = this.record(approval, {
      status: "started",
      policyDecision,
      rollbackNote: policyDecision.rollbackNote,
    });
    this.emit(approval, "approval.effect.started", started);
    if (!policyDecision.allowed) {
      const failed = this.record(approval, {
        status: "failed",
        policyDecision,
        rollbackNote: policyDecision.rollbackNote,
        error: policyDecision.reason,
      });
      this.emit(approval, "approval.effect.failed", failed);
      return failed;
    }
    try {
      const result = await this.runContinuation(approval);
      const succeeded = this.record(approval, {
        status: "succeeded",
        policyDecision,
        rollbackNote: policyDecision.rollbackNote,
        result,
      });
      this.emit(approval, "approval.effect.succeeded", succeeded);
      return succeeded;
    } catch (error) {
      const failed = this.record(approval, {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
      this.emit(approval, "approval.effect.failed", failed);
      return failed;
    }
  }

  private async runContinuation(approval: ApprovalRequestV1): Promise<unknown> {
    const effect = approval.effect;
    if (!effect) return undefined;
    if (effect.targetType === "skill_run" && ["resume", "execute"].includes(effect.action)) {
      const run = this.runtime.skillRunStore.get(effect.targetId);
      if (!run) throw new Error("SkillRun not found");
      const skill = this.runtime.skillRegistry.get(run.skillId)?.descriptor;
      if (skill?.runner && !skill.runner.startsWith("builtin.")) {
        throw new Error("Only builtin Skill runners are allowed");
      }
      this.runtime.skillRunStore.patch(run.id, { status: "running" });
      const completed = this.runtime.skillRunStore.patch(run.id, {
        status: "succeeded",
        completedAt: new Date().toISOString(),
        output: {
          ...run.output,
          resumedByApproval: approval.id,
          runner: skill?.runner ?? "builtin.echo",
        },
      });
      if (skill) this.runtime.skillRegistry.updateUsage(skill.id, true);
      if (run.capsuleId) {
        this.runtime.capsuleStore.patch(run.capsuleId, {
          status: "completed",
          actionsSummary: [
            ...(this.runtime.capsuleStore.get(run.capsuleId)?.actionsSummary ?? []),
            `审批 ${approval.id} 通过后恢复 SkillRun ${run.id}。`,
          ],
        });
      }
      return completed;
    }
    if (effect.targetType === "coding_run" && effect.action === "execute") {
      const run = await this.runtime.codingRunStore.markApprovedOrRun(effect.targetId);
      if (!run) throw new Error("CodingRun not found");
      if (run.capsuleId) {
        this.runtime.capsuleStore.patch(run.capsuleId, {
          status: run.status === "succeeded" || run.status === "completed" ? "completed" : "failed",
          outputs: [
            ...(this.runtime.capsuleStore.get(run.capsuleId)?.outputs ?? []),
            {
              kind: "file",
              label: "Coding diff",
              uri: run.diffPath,
              preview: run.finalSummary ?? `Coding run ${run.status}`,
            },
          ],
          rawTraceRefs: [run.stdoutPath, run.stderrPath, run.jsonlPath, run.diffPath].filter(
            (item): item is string => Boolean(item),
          ),
        });
      }
      return run;
    }
    if (
      (effect.targetType === "hermes_candidate" || effect.targetType === "memory_candidate") &&
      effect.action === "apply"
    ) {
      const result = this.runtime.hermesCandidateStore.apply(effect.targetId, {
        experimentalRoot: new URL("../../../../shared-skills/experimental", import.meta.url)
          .pathname,
        memoryRoot: new URL("../../../../data/runtime/hermes", import.meta.url).pathname,
      });
      if (!result) throw new Error("Hermes candidate not found");
      this.runtime.skillRegistry.scan();
      return result;
    }
    if (effect.targetType === "obsidian_review_note" && effect.action === "write") {
      const note = this.runtime.obsidianReviewStore.get(effect.targetId);
      if (!note) throw new Error("Obsidian review note not found");
      const queue = this.runtime.env.obsidianReviewQueuePath.replace(/^\/+|\/+$/g, "");
      if (!note.path.startsWith(`${queue}/`)) {
        throw new Error("Only Review Queue writes are allowed");
      }
      try {
        const result = await writeReviewNoteCreateOnlyAndVerify(
          this.runtime.obsidian,
          this.runtime.obsidianReviewStore,
          note,
        );
        this.runtime.eventBus.publish(
          createOpcEvent({
            type: "obsidian.review_note.written",
            source: "obsidian",
            severity: "info",
            summary: `Obsidian Review Queue 笔记已写入并校验：${result.note.path}`,
            related: { capsuleId: note.capsuleId, obsidianReviewNoteId: note.id },
            payload: result,
          }),
        );
        return result;
      } catch (error) {
        this.runtime.obsidianReviewStore.markFailed(
          note.id,
          error instanceof Error ? error.message : String(error),
        );
        throw error;
      }
    }
    if (effect.targetType === "skill_promotion" && effect.action === "promote") {
      const promotion = this.runtime.skillPromotionStore.apply(effect.targetId);
      if (!promotion) throw new Error("Skill promotion not found");
      this.runtime.skillRegistry.scan();
      return promotion;
    }
    if (effect.targetType === "openclaw_message" && effect.action === "send") {
      this.runtime.eventBus.publish(
        createOpcEvent({
          type: "openclaw.message.sent",
          source: "openclaw",
          severity: "info",
          summary: `OpenClaw message approval applied: ${effect.targetId}`,
          related: { approvalId: approval.id, openclawConversationId: effect.targetId },
          payload: { effect },
        }),
      );
      return { sent: false, fallback: true, reason: "OpenClaw send skeleton only" };
    }
    throw new Error(`Unsupported approval effect: ${effect.targetType}/${effect.action}`);
  }

  private policyForApproval(approval: ApprovalRequestV1): PolicyDecisionV1 {
    const effect = approval.effect;
    if (!effect) {
      return {
        allowed: true,
        requiresApproval: false,
        reason: "审批无可恢复 effect。",
        severity: "info",
      };
    }
    if (effect.targetType === "coding_run") {
      const run = this.runtime.codingRunStore.get(effect.targetId);
      if (!this.runtime.env.codingAgentRealExec) {
        return {
          allowed: true,
          requiresApproval: true,
          reason: "CODING_AGENT_REAL_EXEC=0，审批后仅运行 mock/fallback coding artifact。",
          severity: "info",
          normalizedPaths: run
            ? { repoPath: run.repoPath, workspacePath: run.workspacePath }
            : undefined,
          rollbackNote: "删除 mock workspace 或丢弃 diff；原 repo 不会被修改。",
        };
      }
      return evaluatePolicy(this.runtime.env, {
        actor: { type: "user", id: approval.requestedBy },
        action: { type: "coding.run", risk: approval.risk, approvalRequired: true },
        resource: {
          repoPath: run?.repoPath,
          workspacePath: run?.workspacePath,
        },
      });
    }
    if (effect.targetType === "obsidian_review_note") {
      const note = this.runtime.obsidianReviewStore.get(effect.targetId);
      return evaluatePolicy(this.runtime.env, {
        actor: { type: "user", id: approval.requestedBy },
        action: { type: "obsidian.review.write", risk: approval.risk, approvalRequired: true },
        resource: { path: note?.path },
      });
    }
    if (effect.targetType === "hermes_candidate" || effect.targetType === "memory_candidate") {
      const candidate = this.runtime.hermesCandidateStore.get(effect.targetId);
      return evaluatePolicy(this.runtime.env, {
        actor: { type: "user", id: approval.requestedBy },
        action: { type: "hermes.candidate.apply", risk: approval.risk, approvalRequired: true },
        resource: { path: candidate?.targetPath },
      });
    }
    if (effect.targetType === "skill_promotion") {
      const promotion = this.runtime.skillPromotionStore.get(effect.targetId);
      return evaluatePolicy(this.runtime.env, {
        actor: { type: "user", id: approval.requestedBy },
        action: { type: "skill.promote", risk: approval.risk, approvalRequired: true },
        resource: { path: promotion?.targetPath, skillId: promotion?.skillId },
      });
    }
    if (effect.targetType === "openclaw_message") {
      return evaluatePolicy(this.runtime.env, {
        actor: { type: "user", id: approval.requestedBy },
        action: { type: "openclaw.message.send", risk: approval.risk, approvalRequired: true },
        resource: { channel: approval.related.openclawConversationId },
      });
    }
    return evaluatePolicy(this.runtime.env, {
      actor: { type: "user", id: approval.requestedBy },
      action: { type: "skill.execute", risk: approval.risk, approvalRequired: true },
      resource: { skillId: approval.related.skillRunId },
    });
  }

  private load(effectId: string): ApprovalEffectRecord | undefined {
    const path = join(this.dir, `${effectId}.json`);
    if (!existsSync(path)) return undefined;
    try {
      return JSON.parse(readFileSync(path, "utf8")) as ApprovalEffectRecord;
    } catch {
      return undefined;
    }
  }

  private record(
    approval: ApprovalRequestV1,
    patch: Pick<ApprovalEffectRecord, "status"> & Partial<ApprovalEffectRecord>,
  ): ApprovalEffectRecord {
    const effect = approval.effect;
    if (!effect) throw new Error("approval.effect missing");
    const previous = this.load(effect.id);
    const now = new Date().toISOString();
    const record: ApprovalEffectRecord = {
      effectId: effect.id,
      idempotencyKey: effect.idempotencyKey,
      paramsHash: effect.paramsHash,
      startedAt: previous?.startedAt ?? now,
      ...previous,
      ...patch,
      completedAt: patch.status === "started" ? previous?.completedAt : now,
    };
    writeJsonFile(join(this.dir, `${effect.id}.json`), record);
    return record;
  }

  private emit(
    approval: ApprovalRequestV1,
    type: "approval.effect.started" | "approval.effect.succeeded" | "approval.effect.failed",
    record: ApprovalEffectRecord,
  ): void {
    this.runtime.eventBus.publish(
      createOpcEvent({
        type,
        source: "bridge",
        severity: record.status === "failed" ? "error" : "info",
        summary: `${approval.title}: ${record.status}`,
        taskId: approval.related.taskId,
        related: {
          capsuleId: approval.related.capsuleId,
          skillRunId: approval.related.skillRunId,
          codingRunId: approval.related.codingRunId,
          approvalId: approval.id,
          hermesCandidateId: approval.related.hermesCandidateId,
          obsidianReviewNoteId: approval.related.obsidianReviewNoteId,
          skillPromotionId: approval.related.skillPromotionId,
        },
        payload: { approvalId: approval.id, effect: approval.effect, record },
      }),
    );
  }
}

export function hashEffectParams(input: unknown): string {
  return createHash("sha256").update(stableJson(input)).digest("hex");
}

function stableJson(input: unknown): string {
  if (Array.isArray(input)) return `[${input.map((item) => stableJson(item)).join(",")}]`;
  if (!input || typeof input !== "object") return JSON.stringify(input);
  return `{${Object.entries(input as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${JSON.stringify(key)}:${stableJson(value)}`)
    .join(",")}}`;
}
