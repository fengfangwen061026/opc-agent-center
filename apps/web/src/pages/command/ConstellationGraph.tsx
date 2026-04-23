import { memo, useMemo } from "react";
import {
  BaseEdge,
  Background,
  Controls,
  EdgeLabelRenderer,
  type EdgeProps,
  Handle,
  MarkerType,
  type NodeProps,
  Position,
  ReactFlow,
  getBezierPath,
} from "@xyflow/react";
import type { OpcAgentStatus } from "@opc/core";
import { AgentAvatar, StatusPill } from "@opc/ui";
import { mockAgents, mockSkills } from "../../data/mock";
import type { OpcAgent } from "@opc/core";
import {
  buildConstellationGraph,
  getAgentAvatarKind,
  type OpcGraphNode,
  type OpcGraphNodeData,
} from "./graphModel";

type ConstellationGraphProps = {
  agents: OpcAgent[];
  onSelectNode: (node: OpcGraphNodeData) => void;
};

const edgeTypes = {
  delegates_to: LabeledEdge,
  asks_context: LabeledEdge,
  writes_to: LabeledEdge,
  uses_skill: LabeledEdge,
  reviews: LabeledEdge,
  blocks_on: LabeledEdge,
};

const edgeLabels: Record<string, string> = {
  delegates_to: "派发",
  asks_context: "请求上下文",
  writes_to: "写入",
  uses_skill: "使用技能",
  reviews: "审核",
  blocks_on: "等待审批",
};

export function ConstellationGraph({ agents, onSelectNode }: ConstellationGraphProps) {
  const { edges, nodes } = useMemo(
    () => buildConstellationGraph(agents.length ? agents : mockAgents, mockSkills),
    [agents],
  );

  return (
    <div className="opc-constellation">
      <ReactFlow
        defaultEdgeOptions={{
          markerEnd: { type: MarkerType.ArrowClosed },
        }}
        edges={edges}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        maxZoom={1.4}
        minZoom={0.35}
        nodes={nodes}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        onNodeClick={(_, node) => onSelectNode((node as OpcGraphNode).data)}
      >
        <Background gap={28} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

const GraphNode = memo(function GraphNode({ data }: NodeProps<OpcGraphNode>) {
  const avatarKind = data.agent ? getAgentAvatarKind(data.agent) : getAvatarKindForNode(data);
  const status = data.status as OpcAgentStatus | "enabled" | "connected" | "waiting";

  return (
    <div className="opc-graph-node" data-kind={data.kind} data-status={data.status}>
      <Handle className="opc-graph-node__handle" position={Position.Left} type="target" />
      <div className="opc-graph-node__inner">
        <AgentAvatar kind={avatarKind} name={data.label} status={status} />
        <div className="opc-graph-node__copy">
          <strong>{data.label}</strong>
          <span>{data.subtitle}</span>
          <StatusPill status={data.status} />
        </div>
      </div>
      <Handle className="opc-graph-node__handle" position={Position.Right} type="source" />
    </div>
  );
});

const nodeTypes = {
  ConductorNode: GraphNode,
  HermesNode: GraphNode,
  WorkerNode: GraphNode,
  CodingAgentNode: GraphNode,
  SkillNode: GraphNode,
  StoreNode: GraphNode,
  ApprovalNode: GraphNode,
};

function getAvatarKindForNode(data: OpcGraphNodeData) {
  if (data.kind === "skill") return "skill";
  if (data.kind === "store") return "store";
  if (data.kind === "approval") return "approval";
  if (data.kind === "hermes") return "hermes";
  if (data.kind === "coding") return "coding";
  return "conductor";
}

function LabeledEdge({
  id,
  label,
  markerEnd,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge className="opc-graph-edge" id={id} markerEnd={markerEnd} path={edgePath} />
      <EdgeLabelRenderer>
        <span
          className="opc-graph-edge__label"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          {typeof label === "string" ? (edgeLabels[label] ?? label) : label}
        </span>
      </EdgeLabelRenderer>
    </>
  );
}
