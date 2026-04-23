import type { Edge, Node } from "@xyflow/react";
import type { OpcAgent, OpcAgentStatus, OpcSkill } from "@opc/core";

export type OpcNodeKind =
  | "conductor"
  | "hermes"
  | "worker"
  | "coding"
  | "skill"
  | "store"
  | "approval";

export type OpcGraphNodeData = {
  id: string;
  label: string;
  subtitle: string;
  status: OpcAgentStatus | "enabled" | "connected" | "waiting_approval";
  kind: OpcNodeKind;
  agent?: OpcAgent;
  skill?: OpcSkill;
};

export type OpcGraphNode = Node<OpcGraphNodeData>;

const basePosition = {
  conductor: { x: 20, y: 170 },
  hermes: { x: 310, y: 36 },
  knowledge: { x: 310, y: 168 },
  research: { x: 310, y: 300 },
  dev: { x: 600, y: 96 },
  publishing: { x: 600, y: 228 },
  learning: { x: 600, y: 360 },
  codex: { x: 900, y: 92 },
  claude: { x: 900, y: 222 },
  skill: { x: 1168, y: 36 },
  obsidian: { x: 1168, y: 166 },
  capsule: { x: 1168, y: 296 },
  approval: { x: 900, y: 354 },
};

export function getAgentAvatarKind(agent: OpcAgent) {
  if (agent.type === "conductor") return "conductor";
  if (agent.type === "hermes") return "hermes";
  if (agent.id.includes("knowledge")) return "knowledge";
  if (agent.id.includes("research")) return "research";
  if (agent.id.includes("dev")) return "dev";
  if (agent.id.includes("publishing")) return "publishing";
  if (agent.id.includes("learning")) return "learning";
  if (agent.type === "coding-agent") return "coding";
  return "conductor";
}

function agentNode(
  agent: OpcAgent,
  position: { x: number; y: number },
  type: string,
): OpcGraphNode {
  return {
    id: agent.id,
    type,
    position,
    data: {
      id: agent.id,
      label: agent.name,
      subtitle: agent.currentSkill ?? agent.type,
      status: agent.status,
      kind: getNodeKindForAgent(agent),
      agent,
    },
  };
}

function getNodeKindForAgent(agent: OpcAgent): OpcNodeKind {
  if (agent.type === "coding-agent") return "coding";
  if (agent.type === "worker") return "worker";
  if (agent.type === "hermes") return "hermes";
  if (agent.type === "conductor") return "conductor";
  return "worker";
}

export function buildConstellationGraph(agents: OpcAgent[], skills: OpcSkill[]) {
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  const skill = skills.find((candidate) => candidate.name === "daily-trend-scout") ?? skills[0];

  const nodes: OpcGraphNode[] = [
    agentNode(byId.get("agent-conductor")!, basePosition.conductor, "ConductorNode"),
    agentNode(byId.get("agent-hermes")!, basePosition.hermes, "HermesNode"),
    agentNode(byId.get("agent-knowledge-curator")!, basePosition.knowledge, "WorkerNode"),
    agentNode(byId.get("agent-research-scout")!, basePosition.research, "WorkerNode"),
    agentNode(byId.get("agent-dev-operator")!, basePosition.dev, "WorkerNode"),
    agentNode(byId.get("agent-publishing-editor")!, basePosition.publishing, "WorkerNode"),
    agentNode(byId.get("agent-learning-coach")!, basePosition.learning, "WorkerNode"),
    agentNode(byId.get("agent-codex")!, basePosition.codex, "CodingAgentNode"),
    agentNode(byId.get("agent-claude-code")!, basePosition.claude, "CodingAgentNode"),
    {
      id: "skill-daily-trend-scout",
      type: "SkillNode",
      position: basePosition.skill,
      data: {
        id: "skill-daily-trend-scout",
        label: skill.name,
        subtitle: skill.domain,
        status: "enabled",
        kind: "skill",
        skill,
      },
    },
    {
      id: "store-obsidian",
      type: "StoreNode",
      position: basePosition.obsidian,
      data: {
        id: "store-obsidian",
        label: "Obsidian 仓库",
        subtitle: "审核队列",
        status: "connected",
        kind: "store",
      },
    },
    {
      id: "store-capsules",
      type: "StoreNode",
      position: basePosition.capsule,
      data: {
        id: "store-capsules",
        label: "Capsule 存储",
        subtitle: "data/capsules",
        status: "connected",
        kind: "store",
      },
    },
    {
      id: "approval-center",
      type: "ApprovalNode",
      position: basePosition.approval,
      data: {
        id: "approval-center",
        label: "审批中心",
        subtitle: "S3/S4 风险门禁",
        status: "waiting_approval",
        kind: "approval",
      },
    },
  ];

  const edges: Edge[] = [
    edge("agent-conductor", "agent-knowledge-curator", "delegates_to"),
    edge("agent-conductor", "agent-research-scout", "delegates_to"),
    edge("agent-conductor", "agent-dev-operator", "delegates_to"),
    edge("agent-conductor", "agent-publishing-editor", "delegates_to"),
    edge("agent-conductor", "agent-learning-coach", "delegates_to"),
    edge("agent-conductor", "agent-hermes", "asks_context"),
    edge("agent-research-scout", "skill-daily-trend-scout", "uses_skill"),
    edge("agent-knowledge-curator", "store-obsidian", "writes_to"),
    edge("agent-research-scout", "store-capsules", "writes_to"),
    edge("agent-dev-operator", "agent-codex", "delegates_to"),
    edge("agent-dev-operator", "agent-claude-code", "reviews"),
    edge("agent-codex", "approval-center", "blocks_on"),
    edge("agent-publishing-editor", "approval-center", "blocks_on"),
    edge("agent-hermes", "skill-daily-trend-scout", "reviews"),
  ];

  return { nodes, edges };
}

function edge(source: string, target: string, type: string): Edge {
  return {
    id: `${source}-${type}-${target}`,
    source,
    target,
    type,
    label: type,
    animated: type === "delegates_to" || type === "asks_context",
    data: { type },
  };
}
