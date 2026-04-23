import type {
  ContextPackResult,
  Conversation,
  ObsidianFile,
  ObsidianNote,
  ObsidianSearchResult,
  OpcAgent,
  OpcMessage,
  OpcNotification,
  OpcSkill,
  ReflectionResult,
  SendMessageResult,
  SkillPatch,
  SystemHealth,
  TaskCapsule,
} from "@opc/core";
import type {
  AgentRunV1,
  ApprovalRequestV1,
  CodingRunV1,
  HermesCandidateV1,
  IntegrationStatusV1,
  ObsidianReviewNoteV1,
  PolicyDecisionInputV1,
  PolicyDecisionV1,
  SkillEvalV1,
  SkillDescriptorV1,
  SkillPromotionRequestV1,
  SkillRunV1,
  TaskCapsuleV1,
} from "@opc/shared";
import {
  mockAgents,
  mockConversationPayload,
  mockNotifications,
  mockSkills,
  mockSystemHealth,
  mockTasks,
} from "../data/mock";

export const bridgeBaseUrl = import.meta.env.VITE_BRIDGE_URL ?? "http://localhost:3001";

export type SkillDetail = {
  skill: SkillDescriptorV1;
  markdown: string;
  metadata: Record<string, unknown>;
  files: string[];
  patches: SkillPatch[];
  runs?: SkillRunV1[];
  candidates?: HermesCandidateV1[];
};

export type ServiceStatusResponse = {
  bridge: "running";
  openclaw: {
    mode: string;
    status: string;
    gatewayUrl?: string;
    cliPath?: string;
    version?: string;
    diagnostics: Array<{ code: string; severity: string; title: string; message: string }>;
  };
  hermes: {
    mode: string;
    status: string;
    cliPath?: string;
    version?: string;
    diagnostics: Array<{ code: string; severity: string; title: string; message: string }>;
  };
  obsidian: {
    mode: string;
    status: string;
    endpoint?: string;
    diagnostics: Array<{ code: string; severity: string; title: string; message: string }>;
  };
  codingAgents: { codex: string; claudeCode: string };
};

export type RuntimeStateSummary = {
  generatedAt: string;
  counts: Record<string, number>;
  runtimeDir: { path: string; files: number; bytes: number };
  safety: Record<string, unknown>;
};

export type HermesRunRecord = {
  id: string;
  capsuleId: string;
  mode: "context_pack" | "reflect";
  status: "requested" | "running" | "completed" | "failed";
  source: "real" | "mock" | "mock_fallback";
  candidateIds: string[];
  createdAt: string;
  completedAt?: string;
  error?: string;
};

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${bridgeBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return (await response.json()) as T;
}

export async function getHealth(): Promise<SystemHealth> {
  return requestJson<SystemHealth>("/api/health").catch(() => mockSystemHealth);
}

export async function getAgents(): Promise<OpcAgent[]> {
  return requestJson<OpcAgent[]>("/api/agents").catch(() => mockAgents);
}

export async function getTasks(): Promise<TaskCapsule[]> {
  return requestJson<TaskCapsule[]>("/api/tasks").catch(() => mockTasks);
}

export async function getTask(id: string): Promise<TaskCapsule | undefined> {
  return requestJson<TaskCapsule>(`/api/tasks/${id}`).catch(() =>
    mockTasks.find((task) => task.taskId === id),
  );
}

export async function createCapsule(id: string): Promise<{ path: string; capsule: TaskCapsule }> {
  return requestJson(`/api/tasks/${id}/capsule`, { method: "POST" });
}

export async function getCapsules(): Promise<TaskCapsuleV1[]> {
  return requestJson<TaskCapsuleV1[]>("/api/capsules").catch(() => []);
}

export async function getCapsule(id: string): Promise<TaskCapsuleV1> {
  return requestJson<TaskCapsuleV1>(`/api/capsules/${encodeURIComponent(id)}`);
}

export async function reflectCapsule(id: string): Promise<unknown> {
  return requestJson(`/api/capsules/${encodeURIComponent(id)}/reflect`, { method: "POST" });
}

export async function reflectCapsuleV3(id: string): Promise<unknown> {
  return requestJson(`/api/hermes/reflect/${encodeURIComponent(id)}`, { method: "POST" });
}

export async function getNotifications(): Promise<OpcNotification[]> {
  return requestJson<OpcNotification[]>("/api/notifications").catch(() => mockNotifications);
}

export async function actNotification(id: string, action: string): Promise<OpcNotification> {
  return requestJson<OpcNotification>(`/api/notifications/${id}/act`, {
    method: "POST",
    body: JSON.stringify({ action }),
  });
}

export async function getSkills(params?: URLSearchParams): Promise<SkillDescriptorV1[]> {
  const suffix = params?.toString() ? `?${params.toString()}` : "";
  return requestJson<SkillDescriptorV1[]>(`/api/skills${suffix}`).catch(() =>
    mockSkills.map(skillDescriptorFromLegacy),
  );
}

export async function getSkillDetail(name: string): Promise<SkillDetail> {
  return requestJson<SkillDetail>(`/api/skills/${encodeURIComponent(name)}`).catch(() => {
    const skill = skillDescriptorFromLegacy(
      mockSkills.find((item) => item.name === name) ?? mockSkills[0],
    );
    return {
      skill,
      markdown: `# ${skill.name}\n\n${skill.description}\n`,
      metadata: skill,
      files: ["SKILL.md"],
      patches: [],
    };
  });
}

export async function rescanSkills(): Promise<unknown> {
  return requestJson("/api/skills/rescan", { method: "POST" });
}

export async function runSkill(
  id: string,
  input: { mode: "dry_run" | "preview" | "execute"; input?: Record<string, unknown> },
): Promise<{ run: SkillRunV1; capsule: TaskCapsuleV1; approval?: ApprovalRequestV1 }> {
  return requestJson(`/api/skills/${encodeURIComponent(id)}/run`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getSkillRuns(): Promise<SkillRunV1[]> {
  return requestJson<SkillRunV1[]>("/api/skill-runs").catch(() => []);
}

export async function saveSkillMarkdown(name: string, markdown: string): Promise<SkillDetail> {
  return requestJson<SkillDetail>(`/api/skills/${encodeURIComponent(name)}`, {
    method: "PUT",
    body: JSON.stringify({ markdown }),
  });
}

export async function actSkillPatch(
  name: string,
  patchId: string,
  action: "approve" | "reject",
): Promise<SkillPatch> {
  return requestJson<SkillPatch>(
    `/api/skills/${encodeURIComponent(name)}/patches/${encodeURIComponent(patchId)}/act`,
    {
      method: "POST",
      body: JSON.stringify({ action }),
    },
  );
}

export async function getConversations(): Promise<{
  conversations: Conversation[];
  messages: OpcMessage[];
}> {
  return requestJson<{ conversations: Conversation[]; messages: OpcMessage[] }>(
    "/api/conversations",
  ).catch(() => mockConversationPayload);
}

export async function getMessages(conversationId: string): Promise<OpcMessage[]> {
  return requestJson<OpcMessage[]>(
    `/api/messages?conversationId=${encodeURIComponent(conversationId)}`,
  ).catch(() =>
    mockConversationPayload.messages.filter((message) => message.conversationId === conversationId),
  );
}

export async function sendChatMessage(input: {
  conversationId?: string;
  content: string;
  channel?: "panel";
}): Promise<SendMessageResult & { capsule?: TaskCapsuleV1; dispatch?: unknown }> {
  return requestJson<SendMessageResult & { capsule?: TaskCapsuleV1; dispatch?: unknown }>(
    "/api/chat/send",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function dispatchConductor(input: {
  message: string;
  conversationId?: string;
  context?: Record<string, unknown>;
}): Promise<unknown> {
  return requestJson("/api/conductor/dispatch", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getAgentRuns(): Promise<AgentRunV1[]> {
  return requestJson<AgentRunV1[]>("/api/agent-runs").catch(() => []);
}

export async function getApprovals(): Promise<ApprovalRequestV1[]> {
  return requestJson<ApprovalRequestV1[]>("/api/approvals").catch(() => []);
}

export async function actApproval(
  id: string,
  action: "approve" | "reject" | "request-changes" | "archive",
): Promise<unknown> {
  return requestJson(`/api/approvals/${encodeURIComponent(id)}/${action}`, { method: "POST" });
}

export async function getUnmatchedMessages(): Promise<OpcMessage[]> {
  return requestJson<OpcMessage[]>("/api/chat/unmatched").catch(() => []);
}

export async function requestContextPack(
  taskId: string,
  goal?: string,
): Promise<ContextPackResult> {
  return requestJson<ContextPackResult>("/api/hermes/context-pack", {
    method: "POST",
    body: JSON.stringify({ taskId, goal }),
  });
}

export async function reflectTask(taskId: string): Promise<ReflectionResult> {
  return requestJson<ReflectionResult>("/api/hermes/reflect", {
    method: "POST",
    body: JSON.stringify({ taskId }),
  });
}

export async function getVaultTree(): Promise<ObsidianFile[]> {
  return requestJson<ObsidianFile[]>("/api/obsidian/tree").catch(() => []);
}

export async function getNote(path: string): Promise<ObsidianNote> {
  return requestJson<ObsidianNote>(`/api/obsidian/note/${encodeURIComponent(path)}`);
}

export async function searchNotes(query: string): Promise<ObsidianSearchResult[]> {
  return requestJson<ObsidianSearchResult[]>(
    `/api/obsidian/search?q=${encodeURIComponent(query)}`,
  ).catch(() => []);
}

export async function getCodingRuns(): Promise<CodingRunV1[]> {
  return requestJson<CodingRunV1[]>("/api/coding-runs").catch(() => []);
}

export async function approveAndRunCodingRun(id: string): Promise<CodingRunV1> {
  return requestJson<CodingRunV1>(`/api/coding-runs/${encodeURIComponent(id)}/approve-and-run`, {
    method: "POST",
  });
}

export async function runCodingRunTests(
  id: string,
  command: string,
): Promise<{ run: CodingRunV1; result: unknown; policy: PolicyDecisionV1 }> {
  return requestJson(`/api/coding-runs/${encodeURIComponent(id)}/run-tests`, {
    method: "POST",
    body: JSON.stringify({ command }),
  });
}

export async function getCodingRunArtifacts(id: string): Promise<Record<string, string>> {
  return requestJson<Record<string, string>>(
    `/api/coding-runs/${encodeURIComponent(id)}/artifacts`,
  ).catch(() => ({}));
}

export async function cleanupCodingRunWorkspace(id: string): Promise<unknown> {
  return requestJson(`/api/coding-runs/${encodeURIComponent(id)}/cleanup`, { method: "POST" });
}

export async function actCodingRun(
  id: string,
  action: "approve" | "reject" | "request_changes",
): Promise<CodingRunV1> {
  return requestJson<CodingRunV1>(`/api/coding-runs/${id}/act`, {
    method: "POST",
    body: JSON.stringify({ action }),
  });
}

export async function getCodingRunArtifact(
  id: string,
  kind: "stdout" | "stderr" | "diff",
): Promise<string> {
  const path =
    kind === "diff"
      ? `/api/coding-runs/${encodeURIComponent(id)}/diff`
      : `/api/coding-runs/${encodeURIComponent(id)}/logs/${kind}`;
  const response = await fetch(`${bridgeBaseUrl}${path}`);
  return response.ok ? response.text() : "";
}

export async function getHermesCandidates(): Promise<HermesCandidateV1[]> {
  return requestJson<HermesCandidateV1[]>("/api/hermes/candidates").catch(() => []);
}

export async function getHermesRuns(): Promise<HermesRunRecord[]> {
  return requestJson<HermesRunRecord[]>("/api/hermes/runs").catch(() => []);
}

export async function applyHermesCandidate(
  id: string,
): Promise<{ candidate: HermesCandidateV1; path: string }> {
  return requestJson(`/api/hermes/candidates/${encodeURIComponent(id)}/apply`, {
    method: "POST",
  });
}

export async function actHermesCandidate(
  id: string,
  action: "approve" | "reject" | "archive",
): Promise<HermesCandidateV1> {
  return requestJson<HermesCandidateV1>(
    `/api/hermes/candidates/${encodeURIComponent(id)}/${action}`,
    { method: "POST" },
  );
}

export async function getObsidianStatus(): Promise<unknown> {
  return requestJson("/api/obsidian/status");
}

export async function getReviewNotes(): Promise<ObsidianReviewNoteV1[]> {
  return requestJson<ObsidianReviewNoteV1[]>("/api/obsidian/review-notes").catch(() => []);
}

export async function createReviewNote(input: {
  title: string;
  content: string;
  capsuleId?: string;
  skillRunId?: string;
}): Promise<{ note: ObsidianReviewNoteV1; approval: ApprovalRequestV1 }> {
  return requestJson("/api/obsidian/review-notes", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function writeReviewNote(id: string): Promise<unknown> {
  return requestJson(`/api/obsidian/review-notes/${encodeURIComponent(id)}/write`, {
    method: "POST",
  });
}

export async function verifyReviewNote(id: string): Promise<unknown> {
  return requestJson(`/api/obsidian/review-notes/${encodeURIComponent(id)}/verify`, {
    method: "POST",
  });
}

export async function previewReviewNote(input: {
  title: string;
  content: string;
  capsuleId?: string;
  skillRunId?: string;
}): Promise<unknown> {
  return requestJson("/api/obsidian/review-notes/preview", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function runSkillEval(id: string): Promise<SkillEvalV1> {
  return requestJson(`/api/skills/${encodeURIComponent(id)}/evals/run`, { method: "POST" });
}

export async function getSkillEvals(): Promise<SkillEvalV1[]> {
  return requestJson<SkillEvalV1[]>("/api/skill-evals").catch(() => []);
}

export async function createSkillPromotion(
  id: string,
  to: "experimental" | "stable",
): Promise<{ promotion: SkillPromotionRequestV1; approval: ApprovalRequestV1 }> {
  return requestJson(`/api/skills/${encodeURIComponent(id)}/promotion-request`, {
    method: "POST",
    body: JSON.stringify({ to }),
  });
}

export async function getSkillPromotions(): Promise<SkillPromotionRequestV1[]> {
  return requestJson<SkillPromotionRequestV1[]>("/api/skill-promotions").catch(() => []);
}

export async function exportBundle(): Promise<unknown> {
  return requestJson("/api/export");
}

export async function getRuntimeStateSummary(): Promise<RuntimeStateSummary> {
  return requestJson<RuntimeStateSummary>("/api/runtime/state-summary");
}

export async function createRuntimeBackup(): Promise<unknown> {
  return requestJson("/api/runtime/backup", { method: "POST" });
}

export async function previewRuntimeCleanup(): Promise<unknown> {
  return requestJson("/api/runtime/cleanup/preview", { method: "POST" });
}

export async function applyRuntimeCleanup(): Promise<unknown> {
  return requestJson("/api/runtime/cleanup/apply", {
    method: "POST",
    body: JSON.stringify({ confirm: true }),
  });
}

export async function checkPolicy(input: PolicyDecisionInputV1): Promise<PolicyDecisionV1> {
  return requestJson<PolicyDecisionV1>("/api/policy/check", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getServiceStatus(deep = false): Promise<ServiceStatusResponse> {
  return requestJson<ServiceStatusResponse>(
    deep ? "/api/services/status/deep" : "/api/services/status",
  );
}

export async function getIntegrations(): Promise<IntegrationStatusV1[]> {
  return requestJson<IntegrationStatusV1[]>("/api/integrations").catch(() => []);
}

export async function checkIntegration(id: IntegrationStatusV1["id"]): Promise<unknown> {
  return requestJson(`/api/integrations/${encodeURIComponent(id)}/check`, { method: "POST" });
}

export async function startIntegration(id: IntegrationStatusV1["id"]): Promise<unknown> {
  return requestJson(`/api/integrations/${encodeURIComponent(id)}/start`, { method: "POST" });
}

export async function stopIntegration(id: IntegrationStatusV1["id"]): Promise<unknown> {
  return requestJson(`/api/integrations/${encodeURIComponent(id)}/stop`, { method: "POST" });
}

export async function getIntegrationLogs(id: IntegrationStatusV1["id"]): Promise<unknown> {
  return requestJson(`/api/integrations/${encodeURIComponent(id)}/logs`);
}

export async function testIntegrationConfig(id: IntegrationStatusV1["id"]): Promise<unknown> {
  return requestJson(`/api/integrations/${encodeURIComponent(id)}/config/test`, {
    method: "POST",
  });
}

export async function startOpenClawGateway(): Promise<unknown> {
  return requestJson("/api/services/openclaw/start", { method: "POST" });
}

export async function stopOpenClawGateway(): Promise<unknown> {
  return requestJson("/api/services/openclaw/stop", { method: "POST" });
}

export async function runOpenClawDoctor(): Promise<unknown> {
  return requestJson("/api/services/openclaw/doctor", { method: "POST" });
}

export async function testObsidian(): Promise<unknown> {
  return requestJson("/api/services/obsidian/test", { method: "POST" });
}

export async function testHermes(): Promise<unknown> {
  return requestJson("/api/services/hermes/test", { method: "POST" });
}

export async function getRedactedConfig(): Promise<unknown> {
  return requestJson("/api/services/redacted-config");
}

function skillDescriptorFromLegacy(skill: OpcSkill): SkillDescriptorV1 {
  return {
    id: skill.name,
    name: skill.name,
    description: skill.description,
    version: skill.version ?? "0.0.0",
    path: skill.path,
    source: "mock",
    lifecycle:
      skill.status === "draft" ? "draft" : skill.status === "deprecated" ? "deprecated" : "stable",
    trust:
      skill.trustState === "quarantined"
        ? "blocked"
        : skill.trustState === "experimental"
          ? "review_required"
          : "trusted",
    domain: legacySkillDomain(skill.domain),
    ownerAgent: skill.ownerAgent,
    risk: skill.risk,
    approvalRequired: ["S3", "S4"].includes(skill.risk),
    reads: [],
    writes: skill.writesTo,
    requires: { bins: [], env: [], services: [] },
    capabilities: skill.externalActions,
    evalStatus: skill.eval.status === "not_configured" ? "none" : skill.eval.status,
    usage: {
      totalRuns: skill.usage.count,
      successRuns: Math.round(skill.usage.count * (skill.usage.successRate ?? 0)),
      lastRunAt: skill.usage.lastUsedAt,
    },
    frontmatter: {},
    updatedAt: new Date().toISOString(),
  };
}

function legacySkillDomain(skillDomain: OpcSkill["domain"]): SkillDescriptorV1["domain"] {
  if (skillDomain === "dev") return "coding";
  if (skillDomain === "governance") return "core";
  if (skillDomain === "other") return "unknown";
  return skillDomain;
}
