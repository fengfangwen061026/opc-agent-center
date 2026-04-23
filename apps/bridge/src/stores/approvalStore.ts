import { join } from "node:path";
import {
  approvalRequestV1Schema,
  type ApprovalRequestV1,
  type EventSeverity,
  type OpcEventType,
  type PolicyDecisionV1,
} from "@opc/shared";
import type { OpcNotification } from "@opc/core";
import { readJsonFiles, writeJsonFile } from "./jsonFiles";

export type ApprovalAction = "approve" | "reject" | "request_changes" | "archive";

export class ApprovalStore {
  private readonly approvals = new Map<string, ApprovalRequestV1>();

  constructor(private readonly dir: string) {
    for (const approval of readJsonFiles(dir, (input) => approvalRequestV1Schema.parse(input))) {
      this.approvals.set(approval.id, approval);
    }
  }

  list(): ApprovalRequestV1[] {
    return [...this.approvals.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  get(id: string): ApprovalRequestV1 | undefined {
    return this.approvals.get(id);
  }

  create(
    input: Omit<ApprovalRequestV1, "id" | "createdAt" | "updatedAt" | "status"> & {
      id?: string;
      status?: ApprovalRequestV1["status"];
    },
  ): ApprovalRequestV1 {
    const now = new Date().toISOString();
    const approval = approvalRequestV1Schema.parse({
      ...input,
      id: input.id ?? `approval-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      status: input.status ?? "waiting_action",
      createdAt: now,
      updatedAt: now,
    });
    this.approvals.set(approval.id, approval);
    this.save(approval);
    return approval;
  }

  transition(id: string, action: ApprovalAction): ApprovalRequestV1 | undefined {
    const approval = this.approvals.get(id);
    if (!approval) return undefined;
    approval.status =
      action === "approve"
        ? "approved"
        : action === "reject"
          ? "rejected"
          : action === "request_changes"
            ? "changes_requested"
            : "archived";
    approval.updatedAt = new Date().toISOString();
    this.save(approval);
    return approval;
  }

  attachPolicyDecision(
    id: string,
    policyDecision: PolicyDecisionV1,
  ): ApprovalRequestV1 | undefined {
    const approval = this.approvals.get(id);
    if (!approval) return undefined;
    approval.policyDecision = policyDecision;
    approval.updatedAt = new Date().toISOString();
    this.save(approval);
    return approval;
  }

  seedFromNotifications(notifications: OpcNotification[]): void {
    for (const notification of notifications) {
      if (notification.status !== "waiting_action" || !notification.risk) continue;
      const id = `approval-legacy-${notification.id}`;
      if (this.approvals.has(id)) continue;
      this.create({
        id,
        kind: notification.type === "code_review" ? "coding_run" : "publish_draft",
        title: notification.title,
        summary: notification.summary,
        risk: notification.risk,
        requestedBy: notification.source.agentId ?? "agent-conductor",
        related: {
          taskId: notification.source.taskId,
        },
        proposedAction: {
          label: notification.actions[0]?.label ?? "审批",
          filesTouched: [],
          reversible: false,
          rollbackPlan: "保持当前阻塞状态，不执行外部动作。",
        },
      });
    }
  }

  private save(approval: ApprovalRequestV1): void {
    writeJsonFile(join(this.dir, `${approval.id}.json`), approval);
  }
}

export function approvalEventType(action: ApprovalAction): OpcEventType {
  if (action === "approve") return "approval.approved";
  if (action === "reject") return "approval.rejected";
  if (action === "request_changes") return "approval.changes_requested";
  return "notification.resolved";
}

export function approvalSeverity(approval: ApprovalRequestV1): EventSeverity {
  return ["S3", "S4"].includes(approval.risk) ? "warning" : "info";
}

export function approvalToNotification(approval: ApprovalRequestV1): OpcNotification {
  return {
    id: `notif-${approval.id}`,
    type:
      approval.kind === "coding_run"
        ? "code_review"
        : approval.kind === "memory_update"
          ? "memory_candidate"
          : approval.kind === "skill_patch"
            ? "skill_patch"
            : approval.kind === "obsidian_write"
              ? "obsidian_review"
              : "approval_required",
    severity: ["S3", "S4"].includes(approval.risk) ? "warning" : "info",
    status:
      approval.status === "approved"
        ? "resolved"
        : approval.status === "rejected"
          ? "rejected"
          : approval.status === "changes_requested"
            ? "changes_requested"
            : approval.status === "archived"
              ? "archived"
              : "waiting_action",
    title: approval.title,
    summary: approval.summary,
    createdAt: approval.createdAt,
    source: {
      taskId: approval.related.taskId,
      connector:
        approval.kind === "coding_run"
          ? "codex"
          : approval.kind === "memory_update" || approval.kind === "skill_patch"
            ? "hermes"
            : approval.kind === "obsidian_write"
              ? "obsidian"
              : undefined,
    },
    risk: approval.risk,
    actions: [
      { id: `approve-${approval.id}`, label: "批准", type: "approve" },
      { id: `reject-${approval.id}`, label: "拒绝", type: "reject" },
      { id: `changes-${approval.id}`, label: "要求修改", type: "request_changes" },
      { id: `archive-${approval.id}`, label: "归档", type: "archive" },
    ],
    links: [
      ...(approval.related.capsuleId
        ? [
            {
              label: "Capsule",
              href: `capsule:${approval.related.capsuleId}`,
              kind: "capsule" as const,
            },
          ]
        : []),
    ],
  };
}
