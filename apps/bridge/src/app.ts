import { Hono } from "hono";
import { cors } from "hono/cors";
import type { OpcMessage, SendMessageResult, TaskCapsule } from "@opc/core";
import {
  createOpcEvent,
  type ApprovalRequestV1,
  type CodingRunV1,
  type SkillDescriptorV1,
  type SkillRunV1,
  type TaskCapsuleV1,
} from "@opc/shared";
import {
  actOnNotification,
  addReflectionNotifications,
  appendMessage,
  createCapsuleFile,
  createVaultTree,
  defaultNote,
} from "./stores/mockData";
import type { BridgeRuntime } from "./runtime";
import { ApprovalEffectRunner, hashEffectParams } from "./services/approvalEffectRunner";
import { evaluatePolicy } from "./services/policyEngine";
import { runCodingTestCommand } from "./services/testCommandRunner";
import {
  applyRuntimeCleanup,
  createRuntimeBackup,
  exportRuntimeBundle,
  listRuntimeBackups,
  previewRuntimeCleanup,
  runtimeStateSummary,
} from "./services/runtimeStateService";
import { hashText, writeReviewNoteCreateOnlyAndVerify } from "./services/obsidianReviewWriter";
import {
  checkIntegration,
  getIntegration,
  integrationConfig,
  integrationLogs,
  listIntegrations,
  startIntegration,
  stopIntegration,
  testIntegrationConfig,
} from "./services/integrationService";
import {
  buildServiceStatus,
  openClawGatewayArgs,
  redactedConfig,
  runOpenClawDoctor,
  testHermes,
  testObsidian,
} from "./services/serviceDiagnostics";
import {
  approvalEventType,
  approvalSeverity,
  approvalToNotification,
  type ApprovalAction,
} from "./stores/approvalStore";

export function createBridgeApp(runtime: BridgeRuntime) {
  const app = new Hono();
  app.use(
    "*",
    cors({ origin: ["http://localhost:5173", "http://localhost:5174"], credentials: false }),
  );

  app.get("/api/health", async (c) => c.json(await runtime.health()));
  app.get("/api/integrations", async (c) => c.json(await listIntegrations(runtime)));
  app.get("/api/integrations/:id", async (c) => {
    const integration = await getIntegration(runtime, c.req.param("id") as never);
    return integration ? c.json(integration) : c.json({ error: "Integration not found" }, 404);
  });
  app.post("/api/integrations/:id/check", async (c) => {
    const id = c.req.param("id") as never;
    const result = await checkIntegration(runtime, id);
    runtime.eventBus.publish(
      createOpcEvent({
        type: "integration.checked",
        source: "bridge",
        severity: "info",
        summary: `集成检测完成：${id}`,
        payload: { id, result },
      }),
    );
    return c.json(result);
  });
  app.post("/api/integrations/:id/start", (c) =>
    c.json(startIntegration(runtime, c.req.param("id"))),
  );
  app.post("/api/integrations/:id/stop", (c) =>
    c.json(stopIntegration(runtime, c.req.param("id"))),
  );
  app.get("/api/integrations/:id/logs", (c) => c.json(integrationLogs(runtime, c.req.param("id"))));
  app.get("/api/integrations/:id/config", (c) =>
    c.json(integrationConfig(runtime, c.req.param("id"))),
  );
  app.post("/api/integrations/:id/config/test", async (c) =>
    c.json(await testIntegrationConfig(runtime, c.req.param("id") as never)),
  );
  app.post("/api/policy/check", async (c) => {
    const input = await c.req.json();
    return c.json(evaluatePolicy(runtime.env, input));
  });
  app.get("/api/services/status", async (c) => c.json(await serviceStatus(runtime, false)));
  app.get("/api/services/status/deep", async (c) => c.json(await serviceStatus(runtime, true)));
  app.post("/api/services/openclaw/start", (c) => {
    const state = runtime.supervisor.start({
      id: "openclaw-gateway",
      label: "OpenClaw Gateway",
      command: runtime.env.openclawCliPath ?? "openclaw",
      args: openClawGatewayArgs(runtime.env),
    });
    runtime.eventBus.publish(
      createOpcEvent({
        type: "service.health.changed",
        source: "bridge",
        payload: { service: "openclaw", action: "start", state },
      }),
    );
    return c.json(state);
  });
  app.post("/api/services/openclaw/stop", (c) =>
    c.json(runtime.supervisor.stop("openclaw-gateway")),
  );
  app.get("/api/services/openclaw/logs", (c) =>
    c.json(runtime.supervisor.logs("openclaw-gateway")),
  );
  app.post("/api/services/openclaw/doctor", async (c) =>
    c.json(await runOpenClawDoctor(runtime.env)),
  );
  app.post("/api/services/obsidian/test", async (c) => c.json(await testObsidian(runtime.env)));
  app.post("/api/obsidian/config/test", async (c) => c.json(await testObsidian(runtime.env)));
  app.post("/api/services/hermes/test", async (c) => c.json(await testHermes(runtime.env)));
  app.post("/api/services/hermes/model-check", async (c) => c.json(await testHermes(runtime.env)));
  app.get("/api/services/redacted-config", (c) => c.json(redactedConfig(runtime.env)));

  app.get("/api/events/recent", (c) =>
    c.json(runtime.eventBus.recent(Number(c.req.query("limit") ?? 100))),
  );
  app.get("/api/events/stream", () => {
    const encoder = new TextEncoder();
    let unsubscribe: (() => void) | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(": opc event stream\n\n"));
        for (const event of runtime.eventBus.recent(50)) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
        unsubscribe = runtime.eventBus.subscribe((event) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        });
      },
      cancel() {
        unsubscribe?.();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  });

  app.get("/api/agents", (c) => c.json(runtime.state.agents));
  app.get("/api/agents/:id", (c) => {
    const agent = runtime.state.agents.find((item) => item.id === c.req.param("id"));
    return agent ? c.json(agent) : c.json({ error: "Agent not found" }, 404);
  });

  app.get("/api/tasks", (c) => c.json(runtime.state.tasks));
  app.get("/api/tasks/:id", (c) => {
    const task = runtime.state.tasks.find((item) => item.taskId === c.req.param("id"));
    return task ? c.json(task) : c.json({ error: "Task not found" }, 404);
  });
  app.post("/api/tasks/:id/capsule", (c) => {
    const task = runtime.state.tasks.find((item) => item.taskId === c.req.param("id"));
    if (!task) return c.json({ error: "Task not found" }, 404);
    const path = createCapsuleFile(task);
    const capsule = runtime.capsuleStore.ensureFromLegacyTask(task);
    runtime.eventBus.publish(
      createOpcEvent({
        type: "capsule.created",
        source: "bridge",
        taskId: task.taskId,
        payload: capsule,
      }),
    );
    return c.json({ path, capsule: task, capsuleV1: capsule });
  });

  app.get("/api/capsules", (c) => c.json(runtime.capsuleStore.list()));
  app.get("/api/capsules/:id", (c) => {
    const capsule = runtime.capsuleStore.get(c.req.param("id"));
    return capsule ? c.json(capsule) : c.json({ error: "Capsule not found" }, 404);
  });
  app.post("/api/capsules", async (c) => {
    const capsule = runtime.capsuleStore.create(await c.req.json());
    runtime.eventBus.publish(
      createOpcEvent({
        type: "capsule.created",
        source: "bridge",
        taskId: capsule.taskId,
        conversationId: capsule.conversationId,
        payload: capsule,
      }),
    );
    return c.json(capsule, 201);
  });
  app.patch("/api/capsules/:id", async (c) => {
    const capsule = runtime.capsuleStore.patch(c.req.param("id"), await c.req.json());
    return capsule ? c.json(capsule) : c.json({ error: "Capsule not found" }, 404);
  });
  app.post("/api/capsules/:id/reflect", async (c) => {
    const capsule = runtime.capsuleStore.get(c.req.param("id"));
    if (!capsule) return c.json({ error: "Capsule not found" }, 404);
    const legacy = capsuleToLegacyTask(capsule);
    const result = await runtime.hermes.reflectTask(legacy);
    const notifications = addReflectionNotifications(runtime.state, capsule.taskId, result);
    runtime.capsuleStore.patch(capsule.id, {
      memoryCandidates: [...capsule.memoryCandidates, ...result.memoryCandidates],
      rawTraceRefs: [...capsule.rawTraceRefs, `hermes-reflection:${Date.now()}`],
    });
    runtime.eventBus.publish(
      createOpcEvent({
        type: "hermes.reflection.created",
        source: "hermes",
        taskId: capsule.taskId,
        conversationId: capsule.conversationId,
        payload: { capsuleId: capsule.id, result },
      }),
    );
    for (const notification of notifications) {
      runtime.eventBus.publish(
        createOpcEvent({
          type: "notification.created",
          source: "hermes",
          taskId: capsule.taskId,
          payload: notification,
        }),
      );
    }
    return c.json({ capsule, reflection: result, notifications });
  });

  app.get("/api/skills", (c) => {
    const query = c.req.query("q")?.toLowerCase();
    const domain = c.req.query("domain");
    const risk = c.req.query("risk");
    const lifecycle = c.req.query("lifecycle") ?? c.req.query("status");
    const trust = c.req.query("trust") ?? c.req.query("trustState");
    const ownerAgent = c.req.query("ownerAgent");
    const skills = runtime.skillRegistry.list().filter((skill) => {
      if (query && !`${skill.name} ${skill.description}`.toLowerCase().includes(query))
        return false;
      if (domain && skill.domain !== domain) return false;
      if (risk && skill.risk !== risk) return false;
      if (lifecycle && skill.lifecycle !== lifecycle) return false;
      if (trust && skill.trust !== trust) return false;
      if (ownerAgent && skill.ownerAgent !== ownerAgent) return false;
      return true;
    });
    return c.json(skills);
  });
  app.post("/api/skills/rescan", (c) => {
    const result = runtime.skillRegistry.scan();
    runtime.eventBus.publish(
      createOpcEvent({
        type: "skill.registry.scanned",
        source: "bridge",
        severity: result.warnings.length ? "warning" : "info",
        summary: `Skill Registry 重新扫描：${result.skills.length} 个 Skill`,
        payload: result,
      }),
    );
    return c.json(result);
  });
  app.get("/api/skills/:id/readme", (c) => {
    const readme = runtime.skillRegistry.readme(c.req.param("id"));
    return readme ? c.text(readme) : c.json({ error: "Skill not found" }, 404);
  });
  app.get("/api/skills/:id/source", (c) => {
    const source = runtime.skillRegistry.source(c.req.param("id"));
    return source ? c.text(source) : c.json({ error: "Skill not found" }, 404);
  });
  app.get("/api/skills/:id", (c) => {
    const entry = runtime.skillRegistry.get(c.req.param("id"));
    if (!entry) return c.json({ error: "Skill not found" }, 404);
    return c.json({
      skill: entry.descriptor,
      markdown: entry.markdown,
      metadata: entry.descriptor.frontmatter,
      files: entry.files,
      patches: runtime.state.hermesPatches.filter(
        (patch) =>
          patch.skillName === entry.descriptor.id || patch.skillName === entry.descriptor.name,
      ),
      runs: runtime.skillRunStore
        .list()
        .filter(
          (run) => run.skillId === entry.descriptor.id || run.skillId === entry.descriptor.name,
        ),
      candidates: runtime.hermesCandidateStore
        .list()
        .filter((candidate) => candidate.targetPath === `skill:${entry.descriptor.id}`),
    });
  });
  app.put("/api/skills/:id", (c) =>
    c.json(
      { error: "Phase 3 Registry skills are read-only; clone to draft in a later phase." },
      409,
    ),
  );
  app.post("/api/skills/:id/patches/:patchId/act", async (c) => {
    const patch = runtime.state.hermesPatches.find(
      (item) => item.id === c.req.param("patchId") && item.skillName === c.req.param("id"),
    );
    if (!patch) return c.json({ error: "Patch not found" }, 404);
    const body = (await c.req.json()) as { action: "approve" | "reject" };
    patch.status = body.action === "approve" ? "experimental" : "rejected";
    return c.json(patch);
  });
  app.post("/api/skills/:id/run", async (c) => {
    const entry = runtime.skillRegistry.get(c.req.param("id"));
    if (!entry) return c.json({ error: "Skill not found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as {
      mode?: "dry_run" | "preview" | "execute";
      input?: Record<string, unknown>;
      requestedBy?: string;
      agentId?: string;
    };
    const result = createSkillRun(runtime, entry.descriptor, {
      mode: body.mode ?? "dry_run",
      input: body.input ?? {},
      requestedBy: body.requestedBy ?? "user",
      agentId: body.agentId,
    });
    return c.json(result, 201);
  });
  app.post("/api/skills/:id/preview", async (c) => {
    const entry = runtime.skillRegistry.get(c.req.param("id"));
    if (!entry) return c.json({ error: "Skill not found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { input?: Record<string, unknown> };
    return c.json(
      createSkillRun(runtime, entry.descriptor, {
        mode: "preview",
        input: body.input ?? {},
        requestedBy: "user",
      }),
      201,
    );
  });
  app.post("/api/skills/:id/execute", async (c) => {
    const entry = runtime.skillRegistry.get(c.req.param("id"));
    if (!entry) return c.json({ error: "Skill not found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { input?: Record<string, unknown> };
    return c.json(
      createSkillRun(runtime, entry.descriptor, {
        mode: "execute",
        input: body.input ?? {},
        requestedBy: "user",
      }),
      201,
    );
  });
  app.get("/api/skill-runs", (c) => c.json(runtime.skillRunStore.list()));
  app.get("/api/skill-runs/:runId", (c) => {
    const run = runtime.skillRunStore.get(c.req.param("runId"));
    return run ? c.json(run) : c.json({ error: "Skill run not found" }, 404);
  });
  app.post("/api/skill-runs/:runId/cancel", (c) => {
    const run = runtime.skillRunStore.cancel(c.req.param("runId"));
    return run ? c.json(run) : c.json({ error: "Skill run not found" }, 404);
  });
  app.post("/api/skill-runs/:runId/resume", async (c) => {
    const run = runtime.skillRunStore.get(c.req.param("runId"));
    if (!run) return c.json({ error: "Skill run not found" }, 404);
    const approval = runtime.approvalStore
      .list()
      .find((item) => item.related.skillRunId === run.id && item.status === "approved");
    if (!approval) return c.json({ error: "Approved approval required" }, 409);
    const record = await new ApprovalEffectRunner(runtime, approvalEffectDir()).apply(approval);
    return c.json({ run: runtime.skillRunStore.get(run.id), effect: record });
  });
  app.get("/api/skill-runs/:runId/events", (c) =>
    c.json(
      runtime.eventBus
        .recent(500)
        .filter((event) => event.related?.skillRunId === c.req.param("runId")),
    ),
  );
  app.post("/api/skills/:id/evals/run", (c) => {
    const entry = runtime.skillRegistry.get(c.req.param("id"));
    if (!entry) return c.json({ error: "Skill not found" }, 404);
    const evalResult = runtime.skillEvalStore.runSafe(entry.descriptor);
    runtime.eventBus.publish(
      createOpcEvent({
        type: "skill.eval.completed",
        source: "bridge",
        severity: evalResult.status === "passed" ? "info" : "warning",
        summary: `Skill eval ${evalResult.status}: ${entry.descriptor.name}`,
        related: { skillEvalId: evalResult.id },
        payload: evalResult,
      }),
    );
    return c.json(evalResult, 201);
  });
  app.get("/api/skill-evals", (c) => c.json(runtime.skillEvalStore.list()));
  app.get("/api/skill-evals/:id", (c) => {
    const evalResult = runtime.skillEvalStore.get(c.req.param("id"));
    return evalResult ? c.json(evalResult) : c.json({ error: "Skill eval not found" }, 404);
  });
  app.post("/api/skills/:id/promotion-request", async (c) => {
    const entry = runtime.skillRegistry.get(c.req.param("id"));
    if (!entry) return c.json({ error: "Skill not found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { to?: "experimental" | "stable" };
    try {
      const targetLifecycle = body.to ?? "experimental";
      const latestEval = runtime.skillEvalStore
        .list()
        .find((item) => item.skillId === entry.descriptor.id);
      const promotion = runtime.skillPromotionStore.create({
        skill: entry.descriptor,
        to: targetLifecycle,
        targetRoot: new URL(
          `../../../shared-skills/${targetLifecycle === "stable" ? "stable" : "experimental"}`,
          import.meta.url,
        ).pathname,
        evalResult: latestEval,
      });
      const policyDecision = evaluatePolicy(runtime.env, {
        actor: { type: "agent", id: "agent-hermes" },
        action: {
          type: "skill.promote",
          risk: promotion.to === "stable" ? "S3" : "S2",
          approvalRequired: true,
        },
        resource: { path: promotion.targetPath, skillId: promotion.skillId },
      });
      const approval = runtime.approvalStore.create({
        kind: "skill_promotion",
        title: `Skill promotion：${entry.descriptor.name}`,
        summary: `${promotion.from} → ${promotion.to}，批准后先备份再复制，不直接覆盖 stable。`,
        risk: promotion.to === "stable" ? "S3" : "S2",
        requestedBy: "agent-hermes",
        related: { skillPromotionId: promotion.id },
        proposedAction: {
          label: "批准 Skill promotion",
          filesTouched: [promotion.sourcePath, promotion.targetPath],
          reversible: true,
          rollbackPlan: "使用 data/runtime/skill-backups 中的备份恢复。",
        },
        policyDecision,
        effect: createApprovalEffect("skill_promotion", promotion.id, "promote"),
      });
      runtime.state.notifications.unshift(approvalToNotification(approval));
      runtime.eventBus.publish(
        createOpcEvent({
          type: "skill.promotion.requested",
          source: "bridge",
          severity: "warning",
          summary: approval.title,
          related: { approvalId: approval.id, skillPromotionId: promotion.id },
          payload: { promotion, approval },
        }),
      );
      return c.json({ promotion, approval }, 201);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 409);
    }
  });
  app.get("/api/skill-promotions", (c) => c.json(runtime.skillPromotionStore.list()));
  app.post("/api/skill-promotions/:id/approve", async (c) => {
    const promotion = runtime.skillPromotionStore.approve(c.req.param("id"));
    if (!promotion) return c.json({ error: "Promotion not found" }, 404);
    const approval = runtime.approvalStore
      .list()
      .find((item) => item.related.skillPromotionId === promotion.id);
    if (approval?.status !== "approved" || !approval.effect) {
      return c.json({
        promotion,
        approval,
        message: "Skill promotion 已标记 approved；真正 promote 仍需 Approval Center 执行 effect。",
      });
    }
    const effect = await new ApprovalEffectRunner(runtime, approvalEffectDir()).apply(approval);
    runtime.skillRegistry.scan();
    return c.json({ promotion: runtime.skillPromotionStore.get(promotion.id), effect });
  });
  app.post("/api/skill-promotions/:id/reject", (c) => {
    const promotion = runtime.skillPromotionStore.reject(c.req.param("id"));
    return promotion ? c.json(promotion) : c.json({ error: "Promotion not found" }, 404);
  });

  app.get("/api/approvals", (c) => c.json(runtime.approvalStore.list()));
  app.get("/api/approvals/:approvalId", (c) => {
    const approval = runtime.approvalStore.get(c.req.param("approvalId"));
    return approval ? c.json(approval) : c.json({ error: "Approval not found" }, 404);
  });
  for (const [path, action] of [
    ["approve", "approve"],
    ["reject", "reject"],
    ["request-changes", "request_changes"],
    ["archive", "archive"],
  ] as const) {
    app.post(`/api/approvals/:approvalId/${path}`, async (c) => {
      const result = await actOnApproval(runtime, c.req.param("approvalId"), action);
      return result ? c.json(result) : c.json({ error: "Approval not found" }, 404);
    });
  }

  app.get("/api/notifications", (c) => c.json(runtime.state.notifications));
  app.post("/api/notifications/:id/act", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { action?: string };
    const notification = actOnNotification(
      runtime.state,
      c.req.param("id"),
      body.action ?? "mark_resolved",
    );
    if (!notification) return c.json({ error: "Notification not found" }, 404);
    runtime.emitEvent({
      id: `evt-notification-act-${Date.now()}`,
      timestamp: new Date().toISOString(),
      source: "bridge",
      type:
        body.action === "reject"
          ? "notification.rejected"
          : body.action === "request_changes"
            ? "notification.changes_requested"
            : "notification.resolved",
      payload: notification,
    });
    return c.json(notification);
  });

  app.get("/api/conversations", (c) =>
    c.json({ conversations: runtime.state.conversations, messages: runtime.state.messages }),
  );
  app.get("/api/conversation-store", (c) =>
    c.json({
      conversations: runtime.conversationStore.list(),
      messages: runtime.conversationStore.listMessages(),
    }),
  );
  app.get("/api/openclaw/conversations", (c) => c.json(runtime.conversationStore.list()));
  app.post("/api/openclaw/connect", async (c) => {
    await runtime.openclaw.connect({
      mode: runtime.env.openclawMode,
      gatewayUrl: runtime.env.openclawGatewayUrl,
      token: runtime.env.openclawToken,
      cliPath: runtime.env.openclawCliPath,
    });
    const status = await runtime.openclaw.status();
    runtime.eventBus.publish(
      createOpcEvent({
        type: "integration.checked",
        source: "openclaw",
        severity: status.connected ? "info" : "warning",
        summary: status.connected ? "OpenClaw 已连接" : "OpenClaw 仍未连接",
        payload: { status },
      }),
    );
    return c.json(status);
  });
  app.post("/api/openclaw/disconnect", async (c) => {
    await runtime.openclaw.disconnect();
    const status = await runtime.openclaw.status();
    return c.json(status);
  });
  app.get("/api/openclaw/conversations/:id/messages", (c) =>
    c.json(runtime.conversationStore.listMessages(c.req.param("id"))),
  );
  app.post("/api/openclaw/conversations/:id/send", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { content?: string; channel?: "panel" };
    const content = body.content ?? "";
    if (!content.trim()) return c.json({ error: "content is required" }, 400);
    const result = await runtime.openclaw
      .sendMessage({
        conversationId: c.req.param("id"),
        content,
        channel: body.channel ?? "panel",
      })
      .catch(() => localFallbackMessage(c.req.param("id"), content));
    runtime.conversationStore.appendFromOpcMessage(result.message);
    runtime.eventBus.publish(
      createOpcEvent({
        type: "openclaw.conversation.message.sent",
        source: "openclaw",
        severity: "info",
        summary: "OpenClaw 会话消息已发送或 fallback",
        conversationId: c.req.param("id"),
        payload: {
          dedupeKey: `openclaw:${result.message.channel}:${result.message.conversationId}:${result.message.id}`,
          message: result.message,
        },
      }),
    );
    runtime.eventBus.publish(
      createOpcEvent({
        type: "conversation.message.sent",
        source: "bridge",
        severity: "info",
        summary: "Bridge conversation store 已同步 outbound message",
        conversationId: c.req.param("id"),
        payload: { message: result.message },
      }),
    );
    return c.json(result);
  });
  app.get("/api/messages", (c) => {
    const conversationId = c.req.query("conversationId");
    return c.json(
      conversationId
        ? runtime.state.messages.filter((message) => message.conversationId === conversationId)
        : runtime.state.messages,
    );
  });
  app.post("/api/conductor/dispatch", async (c) => {
    const body = (await c.req.json()) as {
      message: string;
      conversationId?: string;
      source?: "web" | "bridge" | "openclaw";
      context?: Record<string, unknown>;
    };
    return c.json(
      await dispatchConductor(runtime, {
        message: body.message,
        conversationId: body.conversationId ?? "conv-panel-command",
        context: body.context ?? {},
      }),
      201,
    );
  });
  app.get("/api/agent-runs", (c) => c.json(runtime.agentRunStore.list()));
  app.get("/api/agent-runs/:runId", (c) => {
    const run = runtime.agentRunStore.get(c.req.param("runId"));
    return run ? c.json(run) : c.json({ error: "Agent run not found" }, 404);
  });
  app.get("/api/chat/unmatched", (c) => c.json([]));
  app.post("/api/chat/send", async (c) => {
    const input = (await c.req.json()) as {
      conversationId?: string;
      content: string;
      channel?: "panel";
    };
    const conversationId = input.conversationId ?? "conv-panel-command";
    const result = await runtime.openclaw
      .sendMessage({
        conversationId,
        content: input.content,
        channel: input.channel ?? "panel",
      })
      .catch(() => localFallbackMessage(conversationId, input.content));
    appendMessage(runtime.state, result.message);
    const capsule = runtime.capsuleStore.create({
      taskId: `task-chat-${Date.now()}`,
      conversationId,
      userRequest: input.content,
      goal: input.content,
      intent: "chat_fallback",
      riskLevel: "S1",
      status: "draft",
      conductorAgentId: "agent-conductor",
      workerAgentIds: [],
      skillsUsed: [],
      inputs: [input.content],
      actionsSummary: ["Bridge 创建本地消息事件。", "OpenClaw 不可用时使用 fallback。"],
      outputs: [
        {
          kind: "message",
          label: "用户消息",
          preview: input.content,
        },
      ],
      verification: ["消息已写入 conversation store。"],
      problems: [],
      memoryCandidates: [],
      skillCandidates: [],
      approvals: [],
      confidence: 0.55,
      rawTraceRefs: [`message:${result.message.id}`],
    });
    runtime.conversationStore.appendFromOpcMessage(result.message, capsule.id);
    if (result.autoReply) {
      appendMessage(runtime.state, result.autoReply);
      runtime.conversationStore.appendFromOpcMessage(result.autoReply, capsule.id);
    }
    runtime.eventBus.publish(
      createOpcEvent({
        type: "chat.message.created",
        source: "bridge",
        conversationId,
        taskId: capsule.taskId,
        payload: { message: result.message, capsuleId: capsule.id, fallback: true },
      }),
    );
    runtime.eventBus.publish(
      createOpcEvent({
        type: "capsule.created",
        source: "bridge",
        conversationId,
        taskId: capsule.taskId,
        payload: capsule,
      }),
    );
    if ("event" in result && result.event) runtime.emitEvent(result.event);
    const dispatch = shouldDispatch(input.content)
      ? await dispatchConductor(runtime, {
          message: input.content,
          conversationId,
          context: {},
        })
      : undefined;
    const dispatchedCapsule =
      dispatch && typeof dispatch === "object" && "capsule" in dispatch
        ? (dispatch as { capsule?: TaskCapsuleV1 }).capsule
        : undefined;
    return c.json({ ...result, capsule: dispatchedCapsule ?? capsule, dispatch });
  });

  app.get("/api/obsidian/tree", async (c) => {
    try {
      const tree = await runtime.obsidian.list("");
      return c.json(tree.length ? tree : createVaultTree());
    } catch {
      return c.json(createVaultTree());
    }
  });
  app.get("/api/obsidian/note/*", async (c) => {
    const path = getWildcardPath(c.req.path, "/api/obsidian/note/");
    try {
      return c.json(await runtime.obsidian.read(path));
    } catch {
      return c.json(defaultNote());
    }
  });
  app.post("/api/obsidian/note/*", async (c) => {
    const path = getWildcardPath(c.req.path, "/api/obsidian/note/");
    const body = (await c.req.json()) as {
      content: string;
      mode?: "overwrite" | "createOnly" | "appendOnly";
    };
    await runtime.obsidian.write(path, body.content, { mode: body.mode ?? "createOnly" });
    return c.json({ ok: true, path });
  });
  app.get("/api/obsidian/search", async (c) =>
    c.json(await runtime.obsidian.search(c.req.query("q") ?? "")),
  );
  app.get("/api/obsidian/status", async (c) =>
    c.json({
      ...(await runtime.obsidian.status()),
      reviewQueuePath: runtime.env.obsidianReviewQueuePath,
      recentReviewNotes: runtime.obsidianReviewStore.list().slice(0, 10),
    }),
  );
  app.get("/api/obsidian/review-notes", (c) => c.json(runtime.obsidianReviewStore.list()));
  app.post("/api/obsidian/review-notes", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      title?: string;
      content?: string;
      capsuleId?: string;
      skillRunId?: string;
    };
    const note = runtime.obsidianReviewStore.createPreview({
      title: body.title ?? "OPC Review Note",
      content: body.content ?? "",
      capsuleId: body.capsuleId,
      skillRunId: body.skillRunId,
    });
    runtime.obsidianReviewStore.markWaitingApproval(note.id);
    const policyDecision = evaluatePolicy(runtime.env, {
      actor: { type: "agent", id: "agent-knowledge-curator" },
      action: { type: "obsidian.review.write", risk: "S2", approvalRequired: true },
      resource: { path: note.path },
    });
    const approval = runtime.approvalStore.create({
      kind: "obsidian_write",
      title: `写入 Obsidian Review Queue：${note.title}`,
      summary: "批准后仅 createOnly 写入 Review Queue，不覆盖、不删除、不移动已有笔记。",
      risk: "S2",
      requestedBy: "agent-knowledge-curator",
      related: {
        capsuleId: note.capsuleId,
        skillRunId: note.skillRunId,
        obsidianReviewNoteId: note.id,
      },
      proposedAction: {
        label: "写入 Review Queue",
        filesTouched: [note.path],
        diffPreview: note.content,
        reversible: true,
        rollbackPlan: "删除新建 Review Queue note；不会修改已有笔记。",
      },
      policyDecision,
      effect: createApprovalEffect("obsidian_review_note", note.id, "write"),
    });
    runtime.state.notifications.unshift(approvalToNotification(approval));
    runtime.eventBus.publish(
      createOpcEvent({
        type: "approval.created",
        source: "bridge",
        severity: "info",
        summary: approval.title,
        related: {
          capsuleId: note.capsuleId,
          skillRunId: note.skillRunId,
          approvalId: approval.id,
          obsidianReviewNoteId: note.id,
        },
        payload: { note, approval },
      }),
    );
    return c.json({ note: runtime.obsidianReviewStore.get(note.id), approval }, 201);
  });
  app.get("/api/obsidian/vault/tree", async (c) => {
    const path = c.req.query("path") ?? "";
    try {
      return c.json(await runtime.obsidian.list(path));
    } catch {
      return c.json(createVaultTree());
    }
  });
  app.get("/api/obsidian/notes", async (c) => {
    const path = c.req.query("path");
    if (!path) return c.json({ error: "path is required" }, 400);
    try {
      return c.json(await runtime.obsidian.read(path));
    } catch {
      return c.json(defaultNote());
    }
  });
  app.post("/api/obsidian/review-notes/preview", async (c) => {
    const body = (await c.req.json()) as {
      title?: string;
      content?: string;
      capsuleId?: string;
      skillRunId?: string;
    };
    const preview = runtime.obsidianReviewStore.createPreview({
      title: body.title ?? "OPC Review Note",
      content: body.content ?? "",
      capsuleId: body.capsuleId,
      skillRunId: body.skillRunId,
    });
    runtime.eventBus.publish(
      createOpcEvent({
        type: "obsidian.note.preview_created",
        source: "obsidian",
        severity: "info",
        summary: `Obsidian Review Queue 预览已创建：${preview.title}`,
        related: { capsuleId: preview.capsuleId, skillRunId: preview.skillRunId },
        payload: preview,
      }),
    );
    return c.json(preview, 201);
  });
  app.post("/api/obsidian/review-notes/write", async (c) => {
    const body = (await c.req.json()) as {
      previewId?: string;
      title?: string;
      content?: string;
      capsuleId?: string;
      skillRunId?: string;
    };
    const preview =
      runtime.obsidianReviewStore.list().find((item) => item.id === body.previewId) ??
      runtime.obsidianReviewStore.createPreview({
        title: body.title ?? "OPC Review Note",
        content: body.content ?? "",
        capsuleId: body.capsuleId,
        skillRunId: body.skillRunId,
      });
    if (
      !preview.path.startsWith(`${runtime.env.obsidianReviewQueuePath.replace(/^\/+|\/+$/g, "")}/`)
    ) {
      return c.json({ error: "Only Review Queue writes are allowed" }, 403);
    }
    try {
      const verified = await writeReviewNoteCreateOnlyAndVerify(
        runtime.obsidian,
        runtime.obsidianReviewStore,
        preview,
      );
      runtime.eventBus.publish(
        createOpcEvent({
          type: "obsidian.review_note.written",
          source: "obsidian",
          severity: "info",
          summary: `Obsidian Review Queue 笔记已写入并校验：${verified.note.path}`,
          related: { capsuleId: verified.note.capsuleId, skillRunId: verified.note.skillRunId },
          payload: verified,
        }),
      );
      return c.json(verified.note);
    } catch (error) {
      const failed =
        runtime.obsidianReviewStore.markFailed(
          preview.id,
          error instanceof Error ? error.message : String(error),
        ) ?? preview;
      runtime.eventBus.publish(
        createOpcEvent({
          type: "obsidian.note.write_failed",
          source: "obsidian",
          severity: "warning",
          summary: "Obsidian Review Queue 写入失败，保留 preview。",
          related: { capsuleId: failed.capsuleId, skillRunId: failed.skillRunId },
          payload: failed,
        }),
      );
      return c.json(failed, 202);
    }
  });
  app.get("/api/obsidian/review-notes/:id", (c) => {
    const note = runtime.obsidianReviewStore.get(c.req.param("id"));
    return note ? c.json(note) : c.json({ error: "Review note not found" }, 404);
  });
  app.post("/api/obsidian/review-notes/:id/verify", async (c) => {
    const note = runtime.obsidianReviewStore.get(c.req.param("id"));
    if (!note) return c.json({ error: "Review note not found" }, 404);
    try {
      const readback = await runtime.obsidian.read(note.path);
      const sha256 = hashText(note.content);
      const readbackSha256 = hashText(readback.content);
      if (sha256 !== readbackSha256) {
        const failed = runtime.obsidianReviewStore.markFailed(note.id, "readback hash mismatch");
        return c.json({ note: failed ?? note, verified: false, sha256, readbackSha256 }, 409);
      }
      const verified = runtime.obsidianReviewStore.markVerified(note.id, {
        writtenAt: note.writeResult?.writtenAt ?? new Date().toISOString(),
        verifiedAt: new Date().toISOString(),
        sha256,
        readbackSha256,
        readbackPreview: readback.content.slice(0, 800),
      });
      return c.json({ note: verified ?? note, verified: true, sha256, readbackSha256 });
    } catch (error) {
      const failed = runtime.obsidianReviewStore.markFailed(
        note.id,
        error instanceof Error ? error.message : String(error),
      );
      return c.json({ note: failed ?? note, verified: false }, 202);
    }
  });
  app.post("/api/obsidian/review-notes/:id/write", async (c) => {
    const note = runtime.obsidianReviewStore.get(c.req.param("id"));
    if (!note) return c.json({ error: "Review note not found" }, 404);
    let approval = runtime.approvalStore
      .list()
      .find((item) => item.related.obsidianReviewNoteId === note.id);
    if (!approval) {
      const policyDecision = evaluatePolicy(runtime.env, {
        actor: { type: "agent", id: "agent-knowledge-curator" },
        action: { type: "obsidian.review.write", risk: "S2", approvalRequired: true },
        resource: { path: note.path },
      });
      approval = runtime.approvalStore.create({
        kind: "obsidian_write",
        title: `写入 Obsidian Review Queue：${note.title}`,
        summary: "批准后仅 createOnly 写入 Review Queue。",
        risk: "S2",
        requestedBy: "agent-knowledge-curator",
        related: { capsuleId: note.capsuleId, obsidianReviewNoteId: note.id },
        proposedAction: {
          label: "写入 Review Queue",
          filesTouched: [note.path],
          diffPreview: note.content,
          reversible: true,
          rollbackPlan: "删除新建 note。",
        },
        policyDecision,
        effect: createApprovalEffect("obsidian_review_note", note.id, "write"),
      });
      runtime.obsidianReviewStore.markWaitingApproval(note.id);
      runtime.state.notifications.unshift(approvalToNotification(approval));
      return c.json({ note: runtime.obsidianReviewStore.get(note.id), approval }, 202);
    }
    if (approval.status !== "approved") return c.json({ note, approval }, 202);
    const effect = await new ApprovalEffectRunner(runtime, approvalEffectDir()).apply(approval);
    return c.json({ note: runtime.obsidianReviewStore.get(note.id), approval, effect });
  });
  app.post("/api/obsidian/review-notes/:id/promotion-preview", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { targetPath?: string };
    const preview = runtime.obsidianReviewStore.promotionPreview(
      c.req.param("id"),
      body.targetPath ?? "Knowledge/OPC Review Note.md",
    );
    return preview ? c.json(preview) : c.json({ error: "Review note not found" }, 404);
  });
  app.post("/api/obsidian/review-notes/:id/promote", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { targetPath?: string };
    const note = runtime.obsidianReviewStore.markPromotionTarget(
      c.req.param("id"),
      body.targetPath ?? "Knowledge/OPC Review Note.md",
    );
    if (!note) return c.json({ error: "Review note not found" }, 404);
    const allowed = runtime.env.obsidianAllowedWritePaths.some((path) =>
      (note.targetPath ?? "").startsWith(path.replace(/^\/+|\/+$/g, "")),
    );
    if (!allowed) return c.json({ error: "Target path is not allowed" }, 403);
    return c.json({
      note,
      status: "waiting_approval",
      message: "Promotion 只允许 copy，不覆盖；完整复制 effect 保留到下一迭代。",
    });
  });

  app.post("/api/hermes/context-pack", async (c) => {
    const input = (await c.req.json()) as { taskId?: string; goal?: string };
    const result = await runtime.hermes.contextPack(input);
    if (input.taskId) runtime.state.contextPacks.set(input.taskId, result);
    return c.json(result);
  });
  app.post("/api/hermes/reflect", async (c) => {
    const body = (await c.req.json()) as { taskId?: string };
    const capsule =
      runtime.state.tasks.find((task) => task.taskId === body.taskId) ?? runtime.state.tasks[0];
    const result = await runtime.hermes.reflectTask(capsule);
    runtime.state.reflections.set(capsule.taskId, result);
    const notifications = addReflectionNotifications(runtime.state, capsule.taskId, result);
    for (const notification of notifications) {
      runtime.emitEvent({
        id: `evt-${notification.id}`,
        timestamp: notification.createdAt,
        source: "hermes",
        type: "notification.created",
        payload: notification,
      });
    }
    return c.json(result);
  });
  app.post("/api/hermes/reflect/:capsuleId", async (c) => {
    const capsule = runtime.capsuleStore.get(c.req.param("capsuleId"));
    if (!capsule) return c.json({ error: "Capsule not found" }, 404);
    const hermesRun = runtime.hermesRunStore.start({
      capsuleId: capsule.id,
      mode: "reflect",
      source: runtime.env.hermesRealExec ? "real" : "mock_fallback",
      payload: capsule,
    });
    runtime.eventBus.publish(
      createOpcEvent({
        type: "hermes.reflection.requested",
        source: "bridge",
        severity: "info",
        summary: `请求 Hermes 反思 Capsule：${capsule.id}`,
        taskId: capsule.taskId,
        related: { capsuleId: capsule.id },
        payload: { capsuleId: capsule.id },
      }),
    );
    let result;
    try {
      result = await runtime.hermes.reflectTask(capsuleToLegacyTask(capsule));
    } catch (error) {
      runtime.hermesRunStore.fail(
        hermesRun.id,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
    const candidates = runtime.hermesCandidateStore.createManyFromReflection(capsule.id, result);
    const completedHermesRun = runtime.hermesRunStore.complete(
      hermesRun.id,
      result,
      candidates.map((candidate) => candidate.id),
    );
    const notifications = addReflectionNotifications(runtime.state, capsule.taskId, result);
    const approvals = candidates.map((candidate) => {
      const policyDecision = evaluatePolicy(runtime.env, {
        actor: { type: "agent", id: "agent-hermes" },
        action: { type: "hermes.candidate.apply", risk: candidate.risk, approvalRequired: true },
        resource: { path: candidate.targetPath },
      });
      return runtime.approvalStore.create({
        kind: candidate.kind === "memory_update" ? "memory_update" : "skill_patch",
        title: candidate.title,
        summary: candidate.rationale,
        risk: candidate.risk,
        requestedBy: "agent-hermes",
        related: { capsuleId: capsule.id, taskId: capsule.taskId, hermesCandidateId: candidate.id },
        proposedAction: {
          label: candidate.kind === "memory_update" ? "批准记忆候选" : "批准 Skill 候选",
          filesTouched: candidate.targetPath ? [candidate.targetPath] : [],
          diffPreview: candidate.patch,
          reversible: true,
          rollbackPlan: "候选只写入 draft/experimental，可删除候选文件回滚；不修改 stable。",
        },
        policyDecision,
        effect: createApprovalEffect("hermes_candidate", candidate.id, "apply"),
      });
    });
    for (const approval of approvals)
      runtime.state.notifications.unshift(approvalToNotification(approval));
    runtime.eventBus.publish(
      createOpcEvent({
        type: "hermes.reflection.completed",
        source: "hermes",
        severity: "info",
        summary: `Hermes 反思完成：${candidates.length} 个候选`,
        taskId: capsule.taskId,
        related: { capsuleId: capsule.id },
        payload: { result, candidates, approvals, hermesRun: completedHermesRun },
      }),
    );
    for (const candidate of candidates) {
      runtime.eventBus.publish(
        createOpcEvent({
          type: "hermes.candidate.created",
          source: "hermes",
          severity: "info",
          summary: candidate.title,
          related: { capsuleId: capsule.id, hermesCandidateId: candidate.id },
          payload: candidate,
        }),
      );
    }
    return c.json({
      reflection: result,
      candidates,
      approvals,
      notifications,
      hermesRun: completedHermesRun,
    });
  });
  app.get("/api/hermes/runs", (c) => c.json(runtime.hermesRunStore.list()));
  app.get("/api/hermes/runs/:id", (c) => {
    const run = runtime.hermesRunStore.get(c.req.param("id"));
    return run ? c.json(run) : c.json({ error: "Hermes run not found" }, 404);
  });
  app.get("/api/hermes/candidates", (c) => c.json(runtime.hermesCandidateStore.list()));
  app.get("/api/hermes/candidates/:candidateId", (c) => {
    const candidate = runtime.hermesCandidateStore.get(c.req.param("candidateId"));
    return candidate ? c.json(candidate) : c.json({ error: "Candidate not found" }, 404);
  });
  app.post("/api/hermes/candidates/:candidateId/apply", async (c) => {
    const candidate = runtime.hermesCandidateStore.get(c.req.param("candidateId"));
    if (!candidate) return c.json({ error: "Candidate not found" }, 404);
    const approval = runtime.approvalStore
      .list()
      .find(
        (item) => item.related.hermesCandidateId === candidate.id && item.status === "approved",
      );
    if (approval?.effect) {
      const effect = await new ApprovalEffectRunner(runtime, approvalEffectDir()).apply(approval);
      return c.json({ candidate: runtime.hermesCandidateStore.get(candidate.id), effect });
    }
    if (candidate.status !== "approved") {
      return c.json({ error: "Hermes candidate approval is required before apply" }, 409);
    }
    const result = runtime.hermesCandidateStore.apply(c.req.param("candidateId"), {
      experimentalRoot: new URL("../../../shared-skills/experimental", import.meta.url).pathname,
      memoryRoot: new URL("../../../data/runtime/hermes", import.meta.url).pathname,
    });
    if (!result) return c.json({ error: "Candidate not found" }, 404);
    runtime.skillRegistry.scan();
    runtime.eventBus.publish(
      createOpcEvent({
        type: "hermes.candidate.applied",
        source: "hermes",
        severity: "info",
        summary: `Hermes 候选已应用到 draft/experimental：${result.candidate.title}`,
        related: {
          capsuleId: result.candidate.sourceCapsuleId,
          hermesCandidateId: result.candidate.id,
        },
        payload: result,
      }),
    );
    return c.json(result);
  });
  for (const [path, status, eventType] of [
    ["approve", "approved", "hermes.candidate.approved"],
    ["reject", "rejected", "hermes.candidate.rejected"],
    ["archive", "archived", "notification.resolved"],
  ] as const) {
    app.post(`/api/hermes/candidates/:candidateId/${path}`, (c) => {
      const candidate = runtime.hermesCandidateStore.transition(c.req.param("candidateId"), status);
      if (!candidate) return c.json({ error: "Candidate not found" }, 404);
      runtime.eventBus.publish(
        createOpcEvent({
          type: eventType,
          source: "hermes",
          severity: "info",
          summary: `${candidate.title}：${status}`,
          related: { capsuleId: candidate.sourceCapsuleId, hermesCandidateId: candidate.id },
          payload: candidate,
        }),
      );
      return c.json(candidate);
    });
  }

  app.post("/api/coding-runs", async (c) => {
    const body = (await c.req.json()) as {
      provider?: "codex" | "claude_code";
      prompt?: string;
      repoPath?: string;
      testCommand?: string;
    };
    const result = createCodingRunWithApproval(runtime, {
      provider: body.provider ?? "codex",
      prompt: body.prompt ?? "受控 coding run",
      repoPath: body.repoPath,
      testCommand: body.testCommand,
    });
    return c.json(result, 201);
  });
  app.get("/api/coding-runs", (c) => c.json(runtime.codingRunStore.list()));
  app.get("/api/coding-runs/:id", (c) => {
    const run = runtime.codingRunStore.get(c.req.param("id"));
    return run ? c.json(run) : c.json({ error: "Coding run not found" }, 404);
  });
  app.get("/api/coding-runs/:id/logs/stdout", (c) =>
    c.text(runtime.codingRunStore.readArtifact(c.req.param("id"), "stdout")),
  );
  app.get("/api/coding-runs/:id/logs/stderr", (c) =>
    c.text(runtime.codingRunStore.readArtifact(c.req.param("id"), "stderr")),
  );
  app.get("/api/coding-runs/:id/diff", (c) =>
    c.text(runtime.codingRunStore.readArtifact(c.req.param("id"), "diff")),
  );
  app.post("/api/coding-runs/:id/approve-and-run", async (c) => {
    const run = runtime.codingRunStore.get(c.req.param("id"));
    if (!run) return c.json({ error: "Coding run not found" }, 404);
    const approval = run.approvalId ? runtime.approvalStore.get(run.approvalId) : undefined;
    if (approval && approval.status !== "approved") {
      return c.json({ error: "Coding run approval is required before execution", approval }, 409);
    }
    const executed = await runtime.codingRunStore.markApprovedOrRun(run.id);
    return c.json(executed);
  });
  app.post("/api/coding-runs/:id/run-tests", async (c) => {
    const run = runtime.codingRunStore.get(c.req.param("id"));
    if (!run) return c.json({ error: "Coding run not found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { command?: string };
    const command = body.command ?? run.testCommand;
    if (!command) return c.json({ error: "test command is required" }, 400);
    const policy = evaluatePolicy(runtime.env, {
      actor: { type: "user", id: "user-local" },
      action: { type: "coding.test", risk: "S2", approvalRequired: false },
      resource: { command, workspacePath: run.worktreePath ?? run.workspacePath },
    });
    if (!policy.allowed) return c.json({ policy }, 403);
    const result = await runCodingTestCommand(runtime.env, run, command);
    const patched = runtime.codingRunStore.patch(run.id, {
      testCommand: command,
      testStatus:
        result.status === "passed" ? "passed" : result.status === "blocked" ? "skipped" : "failed",
      testLogPath: result.resultPath,
    });
    return c.json({ run: patched, result, policy });
  });
  app.get("/api/coding-runs/:id/artifacts", (c) => {
    const artifacts = runtime.codingRunStore.artifacts(c.req.param("id"));
    return artifacts ? c.json(artifacts) : c.json({ error: "Coding run not found" }, 404);
  });
  app.get("/api/coding-runs/:id/changed-files", (c) => {
    const files = runtime.codingRunStore.changedFiles(c.req.param("id"));
    return files ? c.json(files) : c.json({ error: "Coding run not found" }, 404);
  });
  app.get("/api/coding-runs/:id/workspace", (c) => {
    const info = runtime.codingRunStore.workspaceInfo(c.req.param("id"));
    return info ? c.json(info) : c.json({ error: "Coding run not found" }, 404);
  });
  app.post("/api/coding-runs/:id/cleanup", (c) =>
    c.json(runtime.codingRunStore.cleanup(c.req.param("id"))),
  );
  app.post("/api/coding-runs/:id/cancel", (c) => {
    const run = runtime.codingRunStore.reject(c.req.param("id"));
    return run ? c.json(run) : c.json({ error: "Coding run not found" }, 404);
  });
  app.post("/api/coding-runs/:id/act", async (c) => {
    const body = (await c.req.json()) as { action: "approve" | "reject" | "request_changes" };
    const run =
      body.action === "approve"
        ? await runtime.codingRunStore.markApprovedOrRun(c.req.param("id"))
        : body.action === "reject"
          ? runtime.codingRunStore.reject(c.req.param("id"))
          : runtime.codingRunStore.requestChanges(c.req.param("id"));
    if (!run) return c.json({ error: "Coding run not found" }, 404);
    runtime.eventBus.publish(
      createOpcEvent({
        type:
          run.status === "succeeded" || run.status === "completed"
            ? "coding.run.completed"
            : run.status === "blocked"
              ? "coding.run.failed"
              : "coding.run.created",
        source: run.provider === "codex" ? "codex" : "claude",
        severity: run.status === "succeeded" || run.status === "completed" ? "info" : "warning",
        summary: `Coding run ${run.status}: ${run.id}`,
        related: { codingRunId: run.id, approvalId: run.approvalId, capsuleId: run.capsuleId },
        payload: run,
      }),
    );
    return c.json(run);
  });

  app.get("/api/export", (c) => c.json(exportRuntimeBundle(runtime)));
  app.get("/api/runtime/state-summary", (c) => c.json(runtimeStateSummary(runtime)));
  app.post("/api/runtime/export-bundle", (c) => c.json(exportRuntimeBundle(runtime)));
  app.post("/api/runtime/backup", (c) => c.json(createRuntimeBackup(runtime), 201));
  app.get("/api/runtime/backups", (c) => c.json(listRuntimeBackups()));
  app.post("/api/runtime/cleanup/preview", (c) => c.json(previewRuntimeCleanup(runtime)));
  app.post("/api/runtime/cleanup/apply", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { confirm?: boolean };
    return c.json(applyRuntimeCleanup(runtime, body.confirm === true));
  });

  return app;
}

async function serviceStatus(runtime: BridgeRuntime, deep: boolean) {
  const [health, openclawStatus, hermesStatus, obsidianStatus] = await Promise.all([
    runtime.health(),
    runtime.openclaw.status(),
    runtime.hermes.status(),
    runtime.obsidian.status(),
  ]);
  return buildServiceStatus({
    env: runtime.env,
    health,
    openclawStatus,
    hermesStatus,
    obsidianStatus,
    supervisor: runtime.supervisor,
    deep,
  });
}

function createSkillRun(
  runtime: BridgeRuntime,
  skill: SkillDescriptorV1,
  input: {
    mode: "dry_run" | "preview" | "execute";
    input: Record<string, unknown>;
    requestedBy: string;
    agentId?: string;
  },
): {
  run: SkillRunV1;
  capsule: TaskCapsuleV1;
  approval?: ApprovalRequestV1;
  nextAction: "waiting_approval" | "completed" | "blocked";
} {
  const taskId = `task-skill-${skill.id}-${Date.now()}`;
  const needsApproval = skill.approvalRequired || ["S3", "S4"].includes(skill.risk);
  const capsule = runtime.capsuleStore.create({
    taskId,
    userRequest: String(input.input.prompt ?? input.input.content ?? skill.description),
    goal: `运行 Skill：${skill.name}`,
    intent: `skill_run:${skill.id}`,
    riskLevel: skill.risk,
    status: needsApproval ? "waiting_approval" : "completed",
    conductorAgentId: "agent-conductor",
    workerAgentIds: input.agentId ? [input.agentId] : skill.ownerAgent ? [skill.ownerAgent] : [],
    skillsUsed: [skill.id],
    inputs: [JSON.stringify(input.input)],
    actionsSummary: [
      `Skill mode=${input.mode}`,
      needsApproval
        ? "风险门控：等待审批，未执行。"
        : "内置 allowlist runner 已完成 preview/dry-run。",
    ],
    outputs: [
      {
        kind: "message",
        label: "Skill Run 计划",
        preview: skill.runner
          ? `runner=${skill.runner}`
          : "未声明内置 runner，仅允许 dry-run/preview。",
      },
    ],
    verification: [
      "已用 SkillDescriptorV1 解析。",
      "未执行第三方 Skill 脚本。",
      needsApproval ? "S3/S4 或 approvalRequired 已进入审批门禁。" : "风险门禁通过。",
    ],
    problems: [],
    memoryCandidates: [],
    skillCandidates: [],
    approvals: [],
    confidence: 0.72,
    rawTraceRefs: [`skill:${skill.id}`],
  });
  const run = runtime.skillRunStore.create({
    skillId: skill.id,
    taskId,
    capsuleId: capsule.id,
    requestedBy: input.requestedBy,
    agentId: input.agentId ?? skill.ownerAgent,
    mode: input.mode,
    status: needsApproval ? "waiting_approval" : "succeeded",
    risk: skill.risk,
    input: input.input,
    output: {
      plan: `运行 ${skill.name}`,
      runner: skill.runner ?? "none",
      dryRunOnly: !skill.runner,
    },
    completedAt: needsApproval ? undefined : new Date().toISOString(),
  });
  runtime.eventBus.publish(
    createOpcEvent({
      type: "skill.run.created",
      source: "bridge",
      severity: "info",
      summary: `SkillRun 已创建：${skill.name}`,
      taskId,
      related: { capsuleId: capsule.id, skillRunId: run.id },
      payload: run,
    }),
  );
  runtime.eventBus.publish(
    createOpcEvent({
      type: needsApproval ? "skill.run.waiting_approval" : "skill.run.completed",
      source: "bridge",
      severity: needsApproval ? "warning" : "info",
      summary: needsApproval ? `${skill.name} 等待审批` : `${skill.name} dry-run 完成`,
      taskId,
      related: { capsuleId: capsule.id, skillRunId: run.id },
      payload: run,
    }),
  );
  runtime.eventBus.publish(
    createOpcEvent({
      type: "capsule.created",
      source: "bridge",
      severity: "info",
      summary: `Capsule 已创建：${capsule.id}`,
      taskId,
      related: { capsuleId: capsule.id, skillRunId: run.id },
      payload: capsule,
    }),
  );
  if (!needsApproval) {
    runtime.skillRegistry.updateUsage(skill.id, true);
    return { run, capsule, nextAction: "completed" };
  }
  const policyDecision = evaluatePolicy(runtime.env, {
    actor: { type: "user", id: input.requestedBy },
    action: { type: "skill.execute", risk: skill.risk, approvalRequired: true },
    resource: { skillId: skill.id },
  });
  const approval = runtime.approvalStore.create({
    kind: "skill_run",
    title: `${skill.name} 需要审批`,
    summary: `风险 ${skill.risk} / approvalRequired=${skill.approvalRequired}，执行前必须确认。`,
    risk: skill.risk,
    requestedBy: input.requestedBy,
    related: { taskId, capsuleId: capsule.id, skillRunId: run.id },
    proposedAction: {
      label: `运行 Skill：${skill.name}`,
      commandPreview: `${skill.runner ?? "no-runner"} ${input.mode}`,
      filesTouched: skill.writes,
      reversible: false,
      rollbackPlan: "拒绝后保持 run blocked，不执行任何外部动作。",
    },
    policyDecision,
    effect: createApprovalEffect("skill_run", run.id, "resume"),
  });
  runtime.skillRunStore.patch(run.id, { approvalId: approval.id });
  runtime.capsuleStore.patch(capsule.id, {
    approvals: [
      ...capsule.approvals,
      {
        id: approval.id,
        type: "ops",
        status: "waiting",
        title: approval.title,
        summary: approval.summary,
        createdAt: approval.createdAt,
      },
    ],
  });
  runtime.state.notifications.unshift(approvalToNotification(approval));
  runtime.eventBus.publish(
    createOpcEvent({
      type: "approval.created",
      source: "bridge",
      severity: approvalSeverity(approval),
      summary: approval.title,
      taskId,
      related: { capsuleId: capsule.id, skillRunId: run.id, approvalId: approval.id },
      payload: approval,
    }),
  );
  return {
    run: runtime.skillRunStore.get(run.id) ?? run,
    capsule,
    approval,
    nextAction: "waiting_approval",
  };
}

async function actOnApproval(
  runtime: BridgeRuntime,
  approvalId: string,
  action: ApprovalAction,
): Promise<
  | {
      approval: ApprovalRequestV1;
      run?: SkillRunV1 | CodingRunV1;
      candidate?: unknown;
      effect?: unknown;
    }
  | undefined
> {
  const approval = runtime.approvalStore.transition(approvalId, action);
  if (!approval) return undefined;
  const notification = runtime.state.notifications.find(
    (item) => item.id === `notif-${approval.id}`,
  );
  if (notification) notification.status = approvalToNotification(approval).status;
  let run: SkillRunV1 | CodingRunV1 | undefined;
  let candidate: unknown;
  let effect: unknown;
  if (action === "approve" && approval.effect) {
    effect = await new ApprovalEffectRunner(runtime, approvalEffectDir()).apply(approval);
    if (approval.related.skillRunId) run = runtime.skillRunStore.get(approval.related.skillRunId);
    if (approval.related.codingRunId)
      run = runtime.codingRunStore.get(approval.related.codingRunId);
    if (approval.related.hermesCandidateId) {
      candidate = runtime.hermesCandidateStore.get(approval.related.hermesCandidateId);
    }
  } else if (action !== "approve" && approval.related.skillRunId) {
    run =
      action === "reject"
        ? runtime.skillRunStore.cancel(approval.related.skillRunId)
        : runtime.skillRunStore.patch(approval.related.skillRunId, {
            status: action === "request_changes" ? "blocked" : "cancelled",
            completedAt: new Date().toISOString(),
          });
  } else if (action === "approve" && approval.related.skillRunId) {
    const existing = runtime.skillRunStore.get(approval.related.skillRunId);
    run = runtime.skillRunStore.patch(approval.related.skillRunId, {
      status: existing?.mode === "execute" ? "blocked" : "succeeded",
      completedAt: new Date().toISOString(),
      error:
        existing?.mode === "execute"
          ? "Phase 3 不执行第三方 Skill 脚本；请使用内置 allowlist runner。"
          : undefined,
    });
  }
  if ((action !== "approve" || !approval.effect) && approval.related.codingRunId) {
    run =
      action === "approve"
        ? await runtime.codingRunStore.markApprovedOrRun(approval.related.codingRunId)
        : action === "reject"
          ? runtime.codingRunStore.reject(approval.related.codingRunId)
          : action === "request_changes"
            ? runtime.codingRunStore.requestChanges(approval.related.codingRunId)
            : runtime.codingRunStore.get(approval.related.codingRunId);
  }
  if ((action !== "approve" || !approval.effect) && approval.related.hermesCandidateId) {
    candidate = runtime.hermesCandidateStore.transition(
      approval.related.hermesCandidateId,
      action === "approve" ? "approved" : action === "reject" ? "rejected" : "archived",
    );
  }
  runtime.eventBus.publish(
    createOpcEvent({
      type: approvalEventType(action),
      source: "bridge",
      severity: approvalSeverity(approval),
      summary: `${approval.title}：${approval.status}`,
      taskId: approval.related.taskId,
      related: {
        capsuleId: approval.related.capsuleId,
        skillRunId: approval.related.skillRunId,
        codingRunId: approval.related.codingRunId,
        approvalId: approval.id,
        hermesCandidateId: approval.related.hermesCandidateId,
      },
      payload: { approval, run, candidate, effect },
    }),
  );
  return { approval, run, candidate, effect };
}

async function dispatchConductor(
  runtime: BridgeRuntime,
  input: { message: string; conversationId: string; context: Record<string, unknown> },
): Promise<Record<string, unknown>> {
  const agentId = pickAgentId(input.message);
  const agentRun = runtime.agentRunStore.create({
    agentId,
    taskId: `task-dispatch-${Date.now()}`,
    status: "running",
    goal: input.message,
    assignedSkills: [],
  });
  runtime.eventBus.publish(
    createOpcEvent({
      type: "agent.run.created",
      source: "bridge",
      severity: "info",
      summary: `Conductor 派发：${agentId}`,
      conversationId: input.conversationId,
      related: { agentRunId: agentRun.id },
      payload: agentRun,
    }),
  );
  const skillMatch = input.message.match(/\/skill\s+([a-zA-Z0-9_.-]+)/);
  if (skillMatch) {
    const skill = runtime.skillRegistry.get(skillMatch[1]);
    if (!skill) {
      return { agentRun, error: `Skill not found: ${skillMatch[1]}`, nextAction: "blocked" };
    }
    const result = createSkillRun(runtime, skill.descriptor, {
      mode: "dry_run",
      input: { prompt: input.message.replace(skillMatch[0], "").trim() },
      requestedBy: "user",
      agentId,
    });
    runtime.agentRunStore.patch(agentRun.id, {
      status: result.nextAction === "waiting_approval" ? "waiting_approval" : "succeeded",
      capsuleId: result.capsule.id,
      assignedSkills: [skill.descriptor.id],
      completedAt: result.nextAction === "completed" ? new Date().toISOString() : undefined,
    });
    return { agentRun: runtime.agentRunStore.get(agentRun.id), ...result };
  }
  if (isCodingIntent(input.message)) {
    const result = createCodingRunWithApproval(runtime, {
      provider: input.message.toLowerCase().includes("claude") ? "claude_code" : "codex",
      prompt: input.message,
      repoPath: typeof input.context.repoPath === "string" ? input.context.repoPath : process.cwd(),
    });
    runtime.agentRunStore.patch(agentRun.id, {
      status: "waiting_approval",
      capsuleId: result.capsule.id,
      children: [result.run.id],
    });
    return {
      agentRun: runtime.agentRunStore.get(agentRun.id),
      ...result,
      nextAction: "waiting_approval",
    };
  }
  if (isKnowledgeIntent(input.message)) {
    const capsule = runtime.capsuleStore.create({
      taskId: agentRun.taskId,
      conversationId: input.conversationId,
      userRequest: input.message,
      goal: "保存到 Obsidian Review Queue",
      intent: "obsidian_review_note",
      riskLevel: "S2",
      status: "completed",
      conductorAgentId: "agent-conductor",
      workerAgentIds: ["agent-knowledge-curator"],
      skillsUsed: ["obsidian-review-note"],
      inputs: [input.message],
      actionsSummary: ["生成 Review Queue preview。"],
      outputs: [],
      verification: ["只创建 preview，不覆盖已有 note。"],
      problems: [],
      memoryCandidates: [],
      skillCandidates: [],
      approvals: [],
    });
    const preview = runtime.obsidianReviewStore.createPreview({
      title: "OPC 知识库 Review Note",
      content: input.message,
      capsuleId: capsule.id,
    });
    runtime.agentRunStore.patch(agentRun.id, {
      status: "succeeded",
      capsuleId: capsule.id,
      completedAt: new Date().toISOString(),
      assignedSkills: ["obsidian-review-note"],
    });
    runtime.eventBus.publish(
      createOpcEvent({
        type: "obsidian.note.preview_created",
        source: "obsidian",
        severity: "info",
        summary: `知识库 preview 已创建：${preview.path}`,
        conversationId: input.conversationId,
        related: { capsuleId: capsule.id, agentRunId: agentRun.id },
        payload: preview,
      }),
    );
    return {
      agentRun: runtime.agentRunStore.get(agentRun.id),
      capsule,
      preview,
      nextAction: "completed",
    };
  }
  if (isHermesIntent(input.message)) {
    const capsule = latestCapsule(runtime);
    if (!capsule) return { agentRun, error: "没有可反思的 Capsule", nextAction: "blocked" };
    const result = await reflectCapsule(runtime, capsule);
    runtime.agentRunStore.patch(agentRun.id, {
      status: "succeeded",
      capsuleId: capsule.id,
      completedAt: new Date().toISOString(),
      assignedSkills: ["hermes-reflect-capsule"],
    });
    return { agentRun: runtime.agentRunStore.get(agentRun.id), ...result, nextAction: "completed" };
  }
  const capsule = runtime.capsuleStore.create({
    taskId: agentRun.taskId,
    conversationId: input.conversationId,
    userRequest: input.message,
    goal: input.message,
    intent: "general_chat",
    riskLevel: "S1",
    status: "draft",
    conductorAgentId: "agent-conductor",
    workerAgentIds: [agentId],
    skillsUsed: [],
    inputs: [input.message],
    actionsSummary: ["Conductor 已记录一般对话任务。"],
    outputs: [],
    verification: [],
    problems: [],
    memoryCandidates: [],
    skillCandidates: [],
    approvals: [],
  });
  runtime.agentRunStore.patch(agentRun.id, { status: "succeeded", capsuleId: capsule.id });
  return { agentRun: runtime.agentRunStore.get(agentRun.id), capsule, nextAction: "completed" };
}

function createCodingRunWithApproval(
  runtime: BridgeRuntime,
  input: {
    provider: "codex" | "claude_code";
    prompt: string;
    repoPath?: string;
    testCommand?: string;
  },
): { run: CodingRunV1; capsule: TaskCapsuleV1; approval: ApprovalRequestV1 } {
  const taskId = `task-coding-${Date.now()}`;
  const capsule = runtime.capsuleStore.create({
    taskId,
    userRequest: input.prompt,
    goal: "受控编程智能体运行",
    intent: `coding_run:${input.provider}`,
    riskLevel: "S3",
    status: "waiting_approval",
    conductorAgentId: "agent-conductor",
    workerAgentIds: ["agent-dev-operator"],
    skillsUsed: [
      input.provider === "codex" ? "codex-controlled-run" : "claude-code-controlled-run",
    ],
    inputs: [input.prompt],
    actionsSummary: ["创建 coding run 审批；批准前不执行。"],
    outputs: [],
    verification: ["真实执行默认关闭。", "不 push、不 merge、不 deploy。"],
    problems: [],
    memoryCandidates: [],
    skillCandidates: [],
    approvals: [],
  });
  const run = runtime.codingRunStore.create({
    provider: input.provider,
    prompt: input.prompt,
    repoPath: input.repoPath,
    testCommand: input.testCommand,
    capsuleId: capsule.id,
  });
  const policyDecision = runtime.env.codingAgentRealExec
    ? evaluatePolicy(runtime.env, {
        actor: { type: "agent", id: "agent-dev-operator" },
        action: { type: "coding.run", risk: "S3", approvalRequired: true },
        resource: { repoPath: run.repoPath, workspacePath: run.workspacePath },
      })
    : {
        allowed: true,
        requiresApproval: true,
        reason: "CODING_AGENT_REAL_EXEC=0，审批后只生成 mock/fallback artifact。",
        severity: "info" as const,
        normalizedPaths: { repoPath: run.repoPath, workspacePath: run.workspacePath },
        rollbackNote: "删除 mock workspace 或丢弃 diff；原 repo 不会被修改。",
      };
  const approval = runtime.approvalStore.create({
    kind: "coding_run",
    title: `${input.provider === "codex" ? "Codex" : "Claude Code"} 受控运行需要审批`,
    summary: "批准后仅在受控 workspace/fallback 中执行，不 push、不 merge、不 deploy。",
    risk: "S3",
    requestedBy: "agent-dev-operator",
    related: { taskId, capsuleId: capsule.id, codingRunId: run.id },
    proposedAction: {
      label: "批准受控 coding run",
      commandPreview: `${input.provider} <controlled prompt>`,
      filesTouched: [run.workspacePath],
      diffPreview: runtime.codingRunStore.readArtifact(run.id, "diff"),
      reversible: true,
      rollbackPlan: "删除隔离 workspace 或拒绝 diff，不影响原始 repo。",
    },
    policyDecision,
    effect: createApprovalEffect("coding_run", run.id, "execute"),
  });
  const attachedRun = runtime.codingRunStore.attachApproval(run.id, approval.id) ?? run;
  runtime.state.notifications.unshift(approvalToNotification(approval));
  for (const event of [
    createOpcEvent({
      type: "coding.run.created",
      source: input.provider === "codex" ? "codex" : "claude",
      severity: "info",
      summary: `CodingRun 已创建：${attachedRun.id}`,
      taskId,
      related: { capsuleId: capsule.id, codingRunId: attachedRun.id, approvalId: approval.id },
      payload: attachedRun,
    }),
    createOpcEvent({
      type: "coding.run.waiting_approval",
      source: "bridge",
      severity: "warning",
      summary: `${attachedRun.id} 等待审批`,
      taskId,
      related: { capsuleId: capsule.id, codingRunId: attachedRun.id, approvalId: approval.id },
      payload: approval,
    }),
    createOpcEvent({
      type: "approval.created",
      source: "bridge",
      severity: "warning",
      summary: approval.title,
      taskId,
      related: { capsuleId: capsule.id, codingRunId: attachedRun.id, approvalId: approval.id },
      payload: approval,
    }),
  ]) {
    runtime.eventBus.publish(event);
  }
  return { run: attachedRun, capsule, approval };
}

async function reflectCapsule(
  runtime: BridgeRuntime,
  capsule: TaskCapsuleV1,
): Promise<Record<string, unknown>> {
  const result = await runtime.hermes.reflectTask(capsuleToLegacyTask(capsule));
  const candidates = runtime.hermesCandidateStore.createManyFromReflection(capsule.id, result);
  return { reflection: result, candidates };
}

function shouldDispatch(content: string): boolean {
  return (
    content.includes("/skill") ||
    content.includes("@") ||
    isCodingIntent(content) ||
    isKnowledgeIntent(content) ||
    isHermesIntent(content)
  );
}

function pickAgentId(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("@dev-operator") || lower.includes("codex") || lower.includes("claude")) {
    return "agent-dev-operator";
  }
  if (lower.includes("@knowledge-curator") || isKnowledgeIntent(message)) {
    return "agent-knowledge-curator";
  }
  if (lower.includes("@hermes") || isHermesIntent(message)) return "agent-hermes";
  return "agent-conductor";
}

function isCodingIntent(message: string): boolean {
  return /@dev-operator|codex|claude|写代码|改代码|测试/.test(message.toLowerCase());
}

function isKnowledgeIntent(message: string): boolean {
  return /@knowledge-curator|保存到知识库|入库|obsidian|review queue/i.test(message);
}

function isHermesIntent(message: string): boolean {
  return /@hermes|反思|总结经验|沉淀技能/.test(message.toLowerCase());
}

function latestCapsule(runtime: BridgeRuntime): TaskCapsuleV1 | undefined {
  return runtime.capsuleStore.list()[0];
}

function localFallbackMessage(conversationId: string, content: string): Promise<SendMessageResult> {
  const now = new Date().toISOString();
  const message: OpcMessage = {
    id: `msg-local-${Date.now()}`,
    conversationId,
    channel: "panel",
    direction: "outbound",
    role: "user",
    author: { type: "human", id: "user-local", displayName: "用户" },
    content,
    createdAt: now,
  };
  const autoReply: OpcMessage = {
    id: `msg-local-fallback-${Date.now()}`,
    conversationId,
    channel: "panel",
    direction: "internal",
    role: "agent",
    author: { type: "agent", id: "agent-conductor", displayName: "OPC Conductor" },
    content: "OpenClaw Gateway 未连接，Bridge 已创建本地 fallback 消息和任务胶囊草稿。",
    createdAt: new Date(Date.now() + 150).toISOString(),
  };
  return Promise.resolve({ message, autoReply });
}

function capsuleToLegacyTask(capsule: TaskCapsuleV1): TaskCapsule {
  return {
    taskId: capsule.taskId,
    title: capsule.intent,
    createdAt: capsule.createdAt,
    completedAt: capsule.status === "completed" ? capsule.updatedAt : undefined,
    status: capsuleStatusToLegacy(capsule.status),
    requester: { type: "user", channel: "panel", conversationId: capsule.conversationId },
    conductorAgentId: capsule.conductorAgentId,
    workerAgentIds: capsule.workerAgentIds,
    goal: capsule.goal,
    risk: capsule.riskLevel,
    skillsUsed: capsule.skillsUsed,
    inputsSummary: capsule.inputs,
    actionsSummary: capsule.actionsSummary,
    outputs: capsule.outputs.map((output) => ({
      type: output.kind,
      label: output.label,
      uri: output.uri,
    })),
    verification: capsule.verification,
    problems: capsule.problems,
    memoryCandidates: capsule.memoryCandidates,
    skillCandidates: capsule.skillCandidates.map((candidate) => candidate.summary),
    notificationsCreated: capsule.approvals.map((approval) => approval.id),
    metrics: {},
    confidence: capsule.confidence,
  };
}

function capsuleStatusToLegacy(status: TaskCapsuleV1["status"]): TaskCapsule["status"] {
  if (status === "draft") return "planned";
  if (status === "cancelled") return "failed";
  return status;
}

function getWildcardPath(path: string, prefix: string): string {
  return decodeURIComponent(path.slice(prefix.length));
}

function createApprovalEffect(
  targetType:
    | "skill_run"
    | "coding_run"
    | "hermes_candidate"
    | "obsidian_review_note"
    | "skill_promotion"
    | "memory_candidate"
    | "openclaw_message",
  targetId: string,
  action: "resume" | "execute" | "apply" | "write" | "promote" | "send" | "archive",
) {
  const createdAt = new Date().toISOString();
  const params = { targetType, targetId, action };
  return {
    id: `effect-${targetType}-${targetId}-${action}`,
    targetType,
    targetId,
    action,
    paramsHash: hashEffectParams(params),
    createdAt,
    idempotencyKey: `${targetType}:${targetId}:${action}`,
  };
}

function approvalEffectDir(): string {
  return new URL("../../../data/runtime/approval-effects", import.meta.url).pathname;
}
