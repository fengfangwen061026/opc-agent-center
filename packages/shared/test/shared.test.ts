import { describe, expect, it } from "vitest";
import {
  agentRunV1Schema,
  approvalRequestV1Schema,
  approvalEffectV1Schema,
  codingRunV1Schema,
  createOpcEvent,
  createTaskCapsuleV1,
  hermesCandidateV1Schema,
  integrationStatusV1Schema,
  obsidianReviewNoteV1Schema,
  openClawConversationEventV1Schema,
  opcEventSchema,
  policyDecisionInputV1Schema,
  policyDecisionV1Schema,
  skillEvalV1Schema,
  skillDescriptorV1Schema,
  skillPromotionRequestV1Schema,
  skillRunV1Schema,
  taskCapsuleV1Schema,
} from "../src";

describe("@opc/shared", () => {
  it("creates standard events", () => {
    const event = createOpcEvent({
      type: "chat.message.created",
      source: "bridge",
      payload: { content: "你好" },
    });
    expect(() => opcEventSchema.parse(event)).not.toThrow();
    expect(event.severity).toBe("info");
  });

  it("creates task capsule v1", () => {
    const capsule = createTaskCapsuleV1({
      taskId: "task-demo",
      userRequest: "测试",
      goal: "生成测试 capsule",
      intent: "chat_fallback",
      riskLevel: "S1",
      conductorAgentId: "agent-conductor",
      workerAgentIds: [],
      skillsUsed: [],
      inputs: ["测试"],
      actionsSummary: [],
      outputs: [],
      verification: [],
      problems: [],
      memoryCandidates: [],
      skillCandidates: [],
      approvals: [],
    });
    expect(() => taskCapsuleV1Schema.parse(capsule)).not.toThrow();
  });

  it("validates phase 3 execution schemas", () => {
    const now = new Date().toISOString();
    expect(() =>
      skillDescriptorV1Schema.parse({
        id: "builtin-echo",
        name: "builtin-echo",
        path: "shared-skills/stable/builtin-echo/SKILL.md",
        source: "shared",
        lifecycle: "stable",
        trust: "trusted",
        domain: "core",
        risk: "S0",
        approvalRequired: false,
        updatedAt: now,
      }),
    ).not.toThrow();
    expect(() =>
      skillRunV1Schema.parse({
        id: "skill-run-1",
        skillId: "builtin-echo",
        mode: "dry_run",
        status: "succeeded",
        risk: "S0",
      }),
    ).not.toThrow();
    expect(() =>
      approvalRequestV1Schema.parse({
        id: "approval-1",
        kind: "skill_run",
        status: "waiting_action",
        title: "审批",
        summary: "需要审批",
        risk: "S3",
        requestedBy: "user",
        proposedAction: { label: "运行" },
        effect: {
          id: "effect-1",
          targetType: "skill_run",
          targetId: "skill-run-1",
          action: "resume",
          paramsHash: "sha256-demo",
          createdAt: now,
          idempotencyKey: "skill-run-1:resume",
        },
        createdAt: now,
        updatedAt: now,
      }),
    ).not.toThrow();
    expect(() =>
      agentRunV1Schema.parse({
        id: "agent-run-1",
        agentId: "agent-conductor",
        taskId: "task-1",
        status: "queued",
        goal: "测试",
      }),
    ).not.toThrow();
    expect(() =>
      codingRunV1Schema.parse({
        id: "coding-run-1",
        provider: "codex",
        status: "waiting_approval",
        repoPath: "/tmp/repo",
        workspacePath: "/tmp/workspace",
        prompt: "测试",
        timeoutMs: 600000,
      }),
    ).not.toThrow();
    expect(() =>
      hermesCandidateV1Schema.parse({
        id: "candidate-1",
        kind: "memory_update",
        status: "waiting_review",
        sourceCapsuleId: "cap-1",
        title: "记忆候选",
        rationale: "可复用",
        content: "高风险动作先审批。",
        createdAt: now,
        updatedAt: now,
      }),
    ).not.toThrow();
  });

  it("validates phase 4 integration, effect, eval, promotion, Obsidian, and OpenClaw schemas", () => {
    const now = new Date().toISOString();
    expect(() =>
      integrationStatusV1Schema.parse({
        id: "codex",
        label: "Codex",
        status: "configured",
        mode: "cli",
        version: "1.0.0",
        lastCheckedAt: now,
        capabilities: [{ id: "cli", label: "CLI", status: "available" }],
        requiredActions: [],
        redactedConfig: { tokenConfigured: false, workspaceRoot: "/tmp/opc" },
      }),
    ).not.toThrow();
    expect(() =>
      approvalEffectV1Schema.parse({
        id: "effect-2",
        targetType: "coding_run",
        targetId: "coding-run-1",
        action: "execute",
        paramsHash: "hash",
        createdAt: now,
        idempotencyKey: "coding-run-1:execute",
      }),
    ).not.toThrow();
    expect(() =>
      skillEvalV1Schema.parse({
        id: "eval-1",
        skillId: "builtin-echo",
        status: "passed",
        casesTotal: 3,
        casesPassed: 3,
        casesFailed: 0,
        startedAt: now,
        finishedAt: now,
      }),
    ).not.toThrow();
    expect(() =>
      skillPromotionRequestV1Schema.parse({
        id: "promotion-1",
        skillId: "builtin-echo",
        from: "experimental",
        to: "stable",
        sourcePath: "/tmp/source",
        targetPath: "/tmp/target",
        status: "waiting_approval",
        createdAt: now,
        updatedAt: now,
      }),
    ).not.toThrow();
    expect(() =>
      obsidianReviewNoteV1Schema.parse({
        id: "note-1",
        title: "Review Note",
        slug: "review-note",
        status: "preview",
        reviewQueuePath: "08_Review_Queue/review-note.md",
        frontmatter: { source: "opc-skillos" },
        markdown: "# Review",
        createdAt: now,
        updatedAt: now,
      }),
    ).not.toThrow();
    expect(() =>
      openClawConversationEventV1Schema.parse({
        id: "openclaw-message-1",
        source: "openclaw",
        direction: "inbound",
        content: "你好",
        receivedAt: now,
      }),
    ).not.toThrow();
    expect(() =>
      policyDecisionInputV1Schema.parse({
        actor: { type: "agent", id: "agent-dev-operator" },
        action: { type: "coding.run", risk: "S3", approvalRequired: true },
        resource: { repoPath: "/tmp/repo", workspacePath: "/tmp/workspace" },
      }),
    ).not.toThrow();
    expect(() =>
      policyDecisionV1Schema.parse({
        allowed: false,
        requiresApproval: true,
        reason: "repoPath 不在 allowed roots 内。",
        severity: "danger",
        blockedBy: ["allowed_roots"],
      }),
    ).not.toThrow();
  });
});
