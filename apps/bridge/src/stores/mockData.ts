import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  CodingAgentRun,
  ContextPackResult,
  Conversation,
  ObsidianFile,
  ObsidianNote,
  OpcAgent,
  OpcEvent,
  OpcMessage,
  OpcNotification,
  OpcSkill,
  ReflectionResult,
  SkillPatch,
  TaskCapsule,
} from "@opc/core";
import agentsJson from "../../../../data/mock/agents.json";
import conversationsJson from "../../../../data/mock/conversations.json";
import eventsJson from "../../../../data/mock/events.json";
import notificationsJson from "../../../../data/mock/notifications.json";
import skillsJson from "../../../../data/mock/skills.json";
import tasksJson from "../../../../data/mock/tasks.json";

const repoDataRoot = new URL("../../../../data", import.meta.url).pathname;

export type SkillDetail = {
  skill: OpcSkill;
  markdown: string;
  metadata: Record<string, unknown>;
  files: string[];
  patches: SkillPatch[];
};

export type BridgeState = {
  agents: OpcAgent[];
  skills: OpcSkill[];
  tasks: TaskCapsule[];
  notifications: OpcNotification[];
  conversations: Conversation[];
  messages: OpcMessage[];
  events: OpcEvent[];
  skillDocs: Map<string, SkillDetail>;
  hermesPatches: SkillPatch[];
  contextPacks: Map<string, ContextPackResult>;
  reflections: Map<string, ReflectionResult>;
  codingRuns: CodingAgentRun[];
};

export function createBridgeState(): BridgeState {
  const skills = structuredClone(skillsJson) as OpcSkill[];
  const initialPatches: SkillPatch[] = [
    {
      id: "patch-skill-reflection-contract",
      skillName: "skill-reflection",
      title: "缩小反思输入范围",
      summary: "只发送 TaskCapsule 摘要，不发送完整智能体日志。",
      before: "Input: all task logs and chat transcripts.",
      after: "Input: 仅 TaskCapsule 和用户确认片段。",
      status: "proposed",
      createdAt: "2026-04-22T14:04:40.000Z",
    },
  ];
  return {
    agents: structuredClone(agentsJson) as OpcAgent[],
    skills,
    tasks: structuredClone(tasksJson) as TaskCapsule[],
    notifications: structuredClone(notificationsJson) as OpcNotification[],
    conversations: structuredClone(conversationsJson.conversations) as Conversation[],
    messages: structuredClone(conversationsJson.messages) as OpcMessage[],
    events: structuredClone(eventsJson) as OpcEvent[],
    skillDocs: new Map(
      skills.map((skill) => [skill.name, createSkillDetail(skill, initialPatches)]),
    ),
    hermesPatches: initialPatches,
    contextPacks: new Map(),
    reflections: new Map(),
    codingRuns: [],
  };
}

export function findTaskForEvent(event: OpcEvent, tasks: TaskCapsule[]): TaskCapsule | undefined {
  const payload = event.payload as { taskId?: string };
  return payload.taskId ? tasks.find((task) => task.taskId === payload.taskId) : undefined;
}

export function createCapsuleFile(task: TaskCapsule): string {
  const created = new Date(task.createdAt);
  const year = String(created.getUTCFullYear());
  const month = String(created.getUTCMonth() + 1).padStart(2, "0");
  const day = String(created.getUTCDate()).padStart(2, "0");
  const path = join(repoDataRoot, "capsules", year, month, day, `${task.taskId}.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(task, null, 2)}\n`);
  return path;
}

export function ensureApprovalNotifications(state: BridgeState): void {
  for (const task of state.tasks) {
    if (!["S3", "S4"].includes(task.risk)) continue;
    if (
      state.notifications.some(
        (notification) =>
          notification.source.taskId === task.taskId && notification.type === "approval_required",
      )
    ) {
      continue;
    }
    const notification: OpcNotification = {
      id: `notif-approval-${task.taskId}`,
      type: "approval_required",
      severity: task.risk === "S4" ? "danger" : "warning",
      status: "waiting_action",
      title: `${task.title} 需要审批`,
      summary: `${task.risk} 风险任务已阻塞，必须由用户批准下一步动作。`,
      createdAt: new Date().toISOString(),
      source: { taskId: task.taskId, agentId: task.conductorAgentId },
      risk: task.risk,
      actions: [
        { id: `approve-${task.taskId}`, label: "批准", type: "approve" },
        { id: `reject-${task.taskId}`, label: "拒绝", type: "reject" },
        { id: `changes-${task.taskId}`, label: "要求修改", type: "request_changes" },
      ],
      links: [{ label: "任务", href: `task:${task.taskId}`, kind: "task" }],
    };
    state.notifications.unshift(notification);
    task.notificationsCreated.push(notification.id);
  }
}

export function actOnNotification(
  state: BridgeState,
  id: string,
  action: string,
): OpcNotification | undefined {
  const notification = state.notifications.find((item) => item.id === id);
  if (!notification) return undefined;
  if (action === "approve" || action === "mark_resolved") notification.status = "resolved";
  if (action === "reject") notification.status = "rejected";
  if (action === "request_changes") notification.status = "changes_requested";
  if (action === "archive") notification.status = "archived";
  state.events.push({
    id: `evt-notification-${id}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    source: "bridge",
    type:
      action === "reject"
        ? "notification.rejected"
        : action === "request_changes"
          ? "notification.changes_requested"
          : "notification.resolved",
    payload: { notificationId: id, action },
  });
  return notification;
}

export function appendMessage(state: BridgeState, message: OpcMessage): void {
  state.messages.push(message);
  const conversation = state.conversations.find((item) => item.id === message.conversationId);
  if (conversation) conversation.lastMessageAt = message.createdAt;
}

export function addReflectionNotifications(
  state: BridgeState,
  taskId: string,
  reflection: ReflectionResult,
): OpcNotification[] {
  const created: OpcNotification[] = [];
  for (const candidate of reflection.memoryCandidates) {
    created.push({
      id: `notif-memory-${Date.now()}-${created.length}`,
      type: "memory_candidate",
      severity: "info",
      status: "waiting_action",
      title: "Hermes 记忆候选",
      summary: candidate,
      createdAt: new Date().toISOString(),
      source: { taskId, connector: "hermes" },
      risk: "S2",
      actions: [
        { id: "approve-memory", label: "批准", type: "approve" },
        { id: "reject-memory", label: "拒绝", type: "reject" },
      ],
      links: [{ label: "任务", href: `task:${taskId}`, kind: "task" }],
    });
  }
  for (const patch of reflection.skillPatches) {
    state.hermesPatches.unshift(patch);
    const detail = state.skillDocs.get(patch.skillName);
    detail?.patches.unshift(patch);
    created.push({
      id: `notif-skill-patch-${patch.id}`,
      type: "skill_patch",
      severity: "info",
      status: "waiting_action",
      title: patch.title,
      summary: patch.summary,
      createdAt: patch.createdAt,
      source: { taskId, skillName: patch.skillName, connector: "hermes" },
      risk: "S2",
      actions: [
        { id: `approve-${patch.id}`, label: "批准补丁", type: "approve" },
        { id: `reject-${patch.id}`, label: "拒绝补丁", type: "reject" },
      ],
      links: [{ label: "技能 diff", href: `skill:${patch.skillName}#evolution`, kind: "skill" }],
    });
  }
  state.notifications.unshift(...created);
  return created;
}

export function createCodingReviewNotification(
  state: BridgeState,
  run: CodingAgentRun,
): OpcNotification {
  const existing = state.notifications.find(
    (notification) => notification.id === run.approvalNotificationId,
  );
  if (existing) return existing;
  const notification: OpcNotification = {
    id: `notif-code-review-${run.id}`,
    type: "code_review",
    severity: "warning",
    status: "waiting_action",
    title: `${run.provider} 运行需要审核`,
    summary: `${run.diffSummary ?? "编程智能体运行已完成。"} 文件：${run.filesChanged.join(", ")}`,
    createdAt: new Date().toISOString(),
    source: { taskId: run.taskId, connector: run.provider === "codex" ? "codex" : "claude-code" },
    risk: "S3",
    actions: [
      { id: `approve-${run.id}`, label: "批准", type: "approve" },
      { id: `reject-${run.id}`, label: "拒绝", type: "reject" },
      { id: `changes-${run.id}`, label: "要求修改", type: "request_changes" },
    ],
    links: [{ label: "编程运行", href: `coding-run:${run.id}`, kind: "task" }],
  };
  state.notifications.unshift(notification);
  return notification;
}

export function createVaultTree(): ObsidianFile[] {
  return [
    { path: "00_Inbox", name: "00_Inbox", type: "folder" },
    { path: "01_Sources", name: "01_Sources", type: "folder" },
    { path: "02_Knowledge", name: "02_Knowledge", type: "folder" },
    { path: "03_Projects", name: "03_Projects", type: "folder" },
    { path: "04_Learning", name: "04_Learning", type: "folder" },
    { path: "06_Drafts", name: "06_Drafts", type: "folder" },
    {
      path: "08_Review_Queue",
      name: "08_Review_Queue",
      type: "folder",
      children: [
        {
          path: "08_Review_Queue/OpenClaw Skill Standards.md",
          name: "OpenClaw Skill Standards.md",
          type: "file",
        },
      ],
    },
  ];
}

export function defaultNote(): ObsidianNote {
  return {
    path: "08_Review_Queue/OpenClaw Skill Standards.md",
    title: "OpenClaw Skill Standards",
    content: "# OpenClaw 技能规范\n\n这是一篇暂存到审核队列的 mock 笔记。\n",
    tags: ["openclaw", "skills"],
    updatedAt: "2026-04-22T13:46:20.000Z",
  };
}

function createSkillDetail(skill: OpcSkill, patches: SkillPatch[]): SkillDetail {
  const frontmatter = [
    "---",
    `name: ${skill.name}`,
    `description: ${skill.description}`,
    `version: ${skill.version ?? "0.1.0"}`,
    "opc:",
    `  domain: ${skill.domain}`,
    `  owner_agent: ${skill.ownerAgent}`,
    `  risk: ${skill.risk}`,
    `  writes: [${skill.writesTo.join(", ")}]`,
    `  external_actions: [${skill.externalActions.join(", ")}]`,
    "---",
  ].join("\n");
  const markdown = `${frontmatter}\n\n# ${skill.name}\n\n${skill.description}\n\n## Procedure\n\n1. 识别任务风险等级。\n2. 只加载相关上下文。\n3. 产出可写入 Capsule 的结果。\n\n## Verification\n\n- 校验输出 schema。\n- 遵守写入策略。\n`;
  return {
    skill,
    markdown,
    metadata: {
      name: skill.name,
      domain: skill.domain,
      ownerAgent: skill.ownerAgent,
      risk: skill.risk,
      trustState: skill.trustState,
    },
    files: ["SKILL.md", "evals/sample.json"],
    patches: patches.filter((patch) => patch.skillName === skill.name),
  };
}
