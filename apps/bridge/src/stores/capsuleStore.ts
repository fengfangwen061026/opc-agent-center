import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TaskCapsule as LegacyTaskCapsule } from "@opc/core";
import {
  createTaskCapsuleV1,
  taskCapsuleV1Schema,
  type CreateTaskCapsuleInput,
  type TaskCapsuleV1,
} from "@opc/shared";

export class CapsuleStore {
  private readonly capsules = new Map<string, TaskCapsuleV1>();

  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
    this.load();
  }

  list(): TaskCapsuleV1[] {
    return [...this.capsules.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  get(id: string): TaskCapsuleV1 | undefined {
    return this.capsules.get(id);
  }

  create(input: CreateTaskCapsuleInput): TaskCapsuleV1 {
    const capsule = createTaskCapsuleV1(input);
    this.capsules.set(capsule.id, capsule);
    this.save(capsule);
    return capsule;
  }

  patch(id: string, patch: Partial<TaskCapsuleV1>): TaskCapsuleV1 | undefined {
    const existing = this.capsules.get(id);
    if (!existing) return undefined;
    const capsule = taskCapsuleV1Schema.parse({
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    });
    this.capsules.set(id, capsule);
    this.save(capsule);
    return capsule;
  }

  ensureFromLegacyTask(task: LegacyTaskCapsule): TaskCapsuleV1 {
    const existing = [...this.capsules.values()].find((capsule) => capsule.taskId === task.taskId);
    if (existing) return existing;
    return this.create({
      id: `cap-${task.taskId}`,
      taskId: task.taskId,
      conversationId: task.requester.conversationId,
      userRequest: task.inputsSummary.join("\n"),
      goal: task.goal,
      intent: task.title,
      riskLevel: task.risk,
      status: legacyStatusToV1(task.status),
      conductorAgentId: task.conductorAgentId,
      workerAgentIds: task.workerAgentIds,
      skillsUsed: task.skillsUsed,
      inputs: task.inputsSummary,
      actionsSummary: task.actionsSummary,
      outputs: task.outputs.map((output) => ({
        kind: output.type === "obsidian_note" ? "obsidian_note" : "other",
        label: output.label,
        uri: output.uri,
      })),
      verification: task.verification,
      problems: task.problems,
      memoryCandidates: task.memoryCandidates,
      skillCandidates: task.skillCandidates.map((summary) => ({
        type: "new_skill",
        summary,
        rationale: "由旧 TaskCapsule 候选项迁移。",
      })),
      approvals: task.notificationsCreated.map((id) => ({
        id,
        type: task.risk === "S3" || task.risk === "S4" ? "ops" : "obsidian_write",
        status: "waiting",
        title: `${task.title} 审批`,
        summary: `来自旧任务 ${task.taskId} 的审批项。`,
        createdAt: task.createdAt,
      })),
      confidence: task.confidence ?? 0.5,
      rawTraceRefs: [`legacy-task:${task.taskId}`],
    });
  }

  private load(): void {
    try {
      for (const file of readdirSync(this.dir)) {
        if (!file.endsWith(".json")) continue;
        const parsed = taskCapsuleV1Schema.parse(
          JSON.parse(readFileSync(join(this.dir, file), "utf8")),
        );
        this.capsules.set(parsed.id, parsed);
      }
    } catch {
      // Runtime capsules are local best-effort state.
    }
  }

  private save(capsule: TaskCapsuleV1): void {
    writeFileSync(
      join(this.dir, `${safeFileName(capsule.id)}.json`),
      `${JSON.stringify(capsule, null, 2)}\n`,
    );
  }
}

function legacyStatusToV1(status: LegacyTaskCapsule["status"]): TaskCapsuleV1["status"] {
  if (status === "planned") return "draft";
  if (status === "blocked") return "waiting_approval";
  return status;
}

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/g, "_");
}
