import { createCodingAgentAdapter, type CodingAgentAdapter } from "@opc/coding-agent-adapter";
import type {
  OpcEvent as LegacyOpcEvent,
  OpcMessage as LegacyOpcMessage,
  SystemHealth,
} from "@opc/core";
import { createHermesAdapter, type HermesAdapter } from "@opc/hermes-adapter";
import { createObsidianAdapter, type ObsidianAdapter } from "@opc/obsidian-adapter";
import {
  createOpenClawAdapter,
  mapGatewayEventToOpcEvent,
  type OpenClawAdapter,
} from "@opc/openclaw-adapter";
import { createOpcEvent, type OpcEvent } from "@opc/shared";
import { loadBridgeEnv, type BridgeEnv } from "./lib/env";
import { runMigrations } from "./lib/migrations";
import { bridgeLog } from "./lib/sanitizeLog";
import { EventBus } from "./services/eventBus";
import { openClawGatewayArgs } from "./services/serviceDiagnostics";
import { ServiceSupervisor } from "./services/supervisor";
import { AgentRunStore } from "./stores/agentRunStore";
import { ApprovalStore } from "./stores/approvalStore";
import { CapsuleStore } from "./stores/capsuleStore";
import { CodingRunStore } from "./stores/codingRunStore";
import { ConversationStore } from "./stores/conversationStore";
import { HermesCandidateStore } from "./stores/hermesCandidateStore";
import { HermesRunStore } from "./stores/hermesRunStore";
import { IntegrationConfigStore } from "./stores/integrationConfigStore";
import {
  createBridgeState,
  ensureApprovalNotifications,
  type BridgeState,
} from "./stores/mockData";
import { ObsidianReviewStore } from "./stores/obsidianReviewStore";
import { SkillRegistry } from "./stores/skillRegistry";
import { SkillEvalStore } from "./stores/skillEvalStore";
import { SkillPromotionStore } from "./stores/skillPromotionStore";
import { SkillRunStore } from "./stores/skillRunStore";

export type BridgeRuntime = {
  env: BridgeEnv;
  state: BridgeState;
  openclaw: OpenClawAdapter;
  hermes: HermesAdapter;
  obsidian: ObsidianAdapter;
  coding: CodingAgentAdapter;
  eventBus: EventBus;
  supervisor: ServiceSupervisor;
  configStore: IntegrationConfigStore;
  capsuleStore: CapsuleStore;
  conversationStore: ConversationStore;
  skillRegistry: SkillRegistry;
  skillRunStore: SkillRunStore;
  approvalStore: ApprovalStore;
  agentRunStore: AgentRunStore;
  codingRunStore: CodingRunStore;
  hermesCandidateStore: HermesCandidateStore;
  hermesRunStore: HermesRunStore;
  obsidianReviewStore: ObsidianReviewStore;
  skillEvalStore: SkillEvalStore;
  skillPromotionStore: SkillPromotionStore;
  subscribeEvents: (handler: (event: LegacyOpcEvent) => void) => () => void;
  emitEvent: (event: LegacyOpcEvent) => void;
  health: () => Promise<SystemHealth>;
};

export async function createBridgeRuntime(): Promise<BridgeRuntime> {
  const env = loadBridgeEnv();
  runMigrations(
    new URL("../../../data/opc-agent-center.sqlite", import.meta.url).pathname,
    new URL("../../../data/migrations", import.meta.url).pathname,
  );
  const eventBus = new EventBus(
    new URL("../../../data/runtime/events.jsonl", import.meta.url).pathname,
  );
  const supervisor = new ServiceSupervisor();
  const configStore = new IntegrationConfigStore(
    new URL("../../../data/runtime", import.meta.url).pathname,
  );
  const capsuleStore = new CapsuleStore(
    new URL("../../../data/runtime/capsules", import.meta.url).pathname,
  );
  const conversationStore = new ConversationStore();
  const skillRegistry = new SkillRegistry(
    env.opcSkillRoots,
    new URL("../../../data/runtime/skills/registry-cache.json", import.meta.url).pathname,
  );
  const skillRunStore = new SkillRunStore(
    new URL("../../../data/runtime/skills/runs", import.meta.url).pathname,
  );
  const approvalStore = new ApprovalStore(
    new URL("../../../data/runtime/approvals", import.meta.url).pathname,
  );
  const agentRunStore = new AgentRunStore(
    new URL("../../../data/runtime/agents/runs", import.meta.url).pathname,
  );
  const codingRunStore = new CodingRunStore(
    new URL("../../../data/runtime/coding-runs", import.meta.url).pathname,
    env,
  );
  const hermesCandidateStore = new HermesCandidateStore(
    new URL("../../../data/runtime/hermes/candidates", import.meta.url).pathname,
  );
  const hermesRunStore = new HermesRunStore(
    new URL("../../../data/runtime/hermes/runs", import.meta.url).pathname,
  );
  const obsidianReviewStore = new ObsidianReviewStore(
    new URL("../../../data/runtime/obsidian", import.meta.url).pathname,
    env.obsidianReviewQueuePath,
  );
  const skillEvalStore = new SkillEvalStore(
    new URL("../../../data/runtime/skill-evals", import.meta.url).pathname,
  );
  const skillPromotionStore = new SkillPromotionStore(
    new URL("../../../data/runtime/skill-promotions", import.meta.url).pathname,
    new URL("../../../data/runtime/backups/skills", import.meta.url).pathname,
  );
  const state = createBridgeState();
  ensureApprovalNotifications(state);
  approvalStore.seedFromNotifications(state.notifications);
  const registryScan = skillRegistry.scan();
  eventBus.publish(
    createOpcEvent({
      type: "skill.registry.scanned",
      source: "bridge",
      severity: registryScan.warnings.length ? "warning" : "info",
      summary: `Skill Registry 扫描完成：${registryScan.skills.length} 个 Skill`,
      payload: registryScan,
    }),
  );
  conversationStore.seed(state.conversations, state.messages);
  for (const task of state.tasks) capsuleStore.ensureFromLegacyTask(task);
  const openclaw = createOpenClawAdapter({
    mode: env.openclawMode,
    gatewayUrl: env.openclawGatewayUrl,
    token: env.openclawToken,
    cliPath: env.openclawCliPath,
  });
  const hermes = await createHermesAdapter(env.hermesMode, env.hermesApiUrl, {
    cliPath: env.hermesCliPath,
    realExec: env.hermesRealExec,
    contextTimeoutMs: env.hermesContextTimeoutMs,
    reflectionTimeoutMs: env.hermesReflectionTimeoutMs,
    profile: env.hermesProfile,
  });
  const obsidian = createObsidianAdapter({
    mode: env.obsidianMode,
    apiUrl: env.obsidianApiUrl,
    token: env.obsidianToken,
  });
  const coding = createCodingAgentAdapter({
    codexCliPath: env.codexCliPath,
    claudeCliPath: env.claudeCliPath,
  });
  state.codingRuns = await coding.listRuns();
  const handlers = new Set<(event: LegacyOpcEvent) => void>();

  await openclaw.connect({
    mode: env.openclawMode,
    gatewayUrl: env.openclawGatewayUrl,
    token: env.openclawToken,
    cliPath: env.openclawCliPath,
  });
  openclaw.subscribe((event) => {
    const opcEvent = mapGatewayEventToOpcEvent(event);
    state.events.push(opcEvent);
    const payload = opcEvent.payload as { message?: unknown; autoReply?: unknown };
    if (payload?.message && typeof payload.message === "object") {
      conversationStore.appendFromOpcMessage(payload.message as LegacyOpcMessage);
    }
    if (payload?.autoReply && typeof payload.autoReply === "object") {
      conversationStore.appendFromOpcMessage(payload.autoReply as LegacyOpcMessage);
    }
    eventBus.publish(legacyToStandardEvent(opcEvent));
    for (const handler of handlers) handler(opcEvent);
  });

  if (env.openclawAutostartGateway) {
    supervisor.start({
      id: "openclaw-gateway",
      label: "OpenClaw Gateway",
      command: env.openclawCliPath ?? "openclaw",
      args: openClawGatewayArgs(env),
    });
  }

  bridgeLog("Bridge runtime started", {
    openclawMode: env.openclawMode,
    openclawGatewayUrl: env.openclawGatewayUrl,
    hasOpenclawToken: Boolean(env.openclawToken),
    hermesMode: env.hermesMode,
    hasHermesCliPath: Boolean(env.hermesCliPath),
    obsidianMode: env.obsidianMode,
    hasCodexCliPath: Boolean(env.codexCliPath),
    hasClaudeCliPath: Boolean(env.claudeCliPath),
  });

  return {
    env,
    state,
    openclaw,
    hermes,
    obsidian,
    coding,
    eventBus,
    supervisor,
    configStore,
    capsuleStore,
    conversationStore,
    skillRegistry,
    skillRunStore,
    approvalStore,
    agentRunStore,
    codingRunStore,
    hermesCandidateStore,
    hermesRunStore,
    obsidianReviewStore,
    skillEvalStore,
    skillPromotionStore,
    subscribeEvents: (handler) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    emitEvent: (event) => {
      state.events.push(event);
      eventBus.publish(legacyToStandardEvent(event));
      for (const handler of handlers) handler(event);
    },
    health: async () => {
      const [openclawStatus, hermesStatus, obsidianStatus] = await Promise.all([
        openclaw.status(),
        hermes.status(),
        obsidian.status(),
      ]);
      return {
        gateway: openclawStatus.connected
          ? "connected"
          : env.openclawMode === "ws"
            ? "reconnecting"
            : "offline",
        hermes: hermesStatus.available
          ? hermesStatus.transport === "mock"
            ? "available"
            : "connected"
          : "unavailable",
        obsidian: obsidianStatus.connected ? "connected" : "unavailable",
        codingAgents: {
          codex: codingRunStore
            .list()
            .some((run) => run.provider === "codex" && run.status === "running")
            ? "active"
            : "idle",
          claudeCode: codingRunStore
            .list()
            .some((run) => run.provider === "claude_code" && run.status === "running")
            ? "active"
            : "idle",
        },
        bridge: "running",
      };
    },
  };
}

function legacyToStandardEvent(event: LegacyOpcEvent): OpcEvent {
  const payload = event.payload as {
    taskId?: string;
    conversationId?: string;
    agentId?: string;
    notificationId?: string;
  };
  return createOpcEvent({
    id: event.id,
    ts: event.timestamp,
    type: mapLegacyEventType(event.type),
    source: mapLegacySource(event.source),
    taskId: payload?.taskId,
    conversationId: payload?.conversationId,
    agentId: payload?.agentId,
    payload: event.payload,
  });
}

function mapLegacyEventType(type: string): OpcEvent["type"] {
  const known: Record<string, OpcEvent["type"]> = {
    "chat.message_created": "chat.message.created",
    "chat.message.created": "chat.message.created",
    "agent.status_changed": "agent.status.changed",
    "agent.status.changed": "agent.status.changed",
    "task.completed": "task.completed",
    "task.blocked": "task.progress",
    "notification.created": "notification.created",
    "notification.updated": "notification.resolved",
    "notification.action": "notification.resolved",
    "notification.resolved": "notification.resolved",
    "notification.rejected": "notification.rejected",
    "notification.changes_requested": "notification.changes_requested",
    "openclaw.message.received": "openclaw.conversation.message.received",
    "openclaw.message.sent": "openclaw.conversation.message.sent",
    "conversation.message.received": "conversation.message.received",
    "conversation.message.sent": "conversation.message.sent",
  };
  return known[type] ?? "task.progress";
}

function mapLegacySource(source: LegacyOpcEvent["source"]): OpcEvent["source"] {
  if (source === "gateway") return "openclaw";
  if (source === "ui") return "web";
  return source;
}
