import { useMemo } from 'react'
import type { Agent, ConnectionState, SystemEvent, SystemHealth } from '@opc/core'
import { AgentAvatar, GlassCard, StatusPill } from '@opc/ui'
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'

type GraphNodeData = {
  id: string
  label: string
  subtitle: string
  accentColor: string
  avatarType: Parameters<typeof AgentAvatar>[0]['type']
  status: ConnectionState
}

type ServiceNodeData = {
  id: string
  label: string
  subtitle: string
  accentColor: string
  avatarType: 'memory' | 'knowledge'
  status: ConnectionState
}

const nodeTypes = {
  agent: AgentNode,
  service: AgentNode,
}

function AgentNode({ data }: NodeProps<Node<GraphNodeData | ServiceNodeData>>) {
  return (
    <div className="opc-flow-node">
      <Handle type="target" position={Position.Left} className="opc-flow-node__handle" />
      <GlassCard className="opc-flow-node__card" variant="strong" padding="sm">
        <AgentAvatar type={data.avatarType} accentColor={data.accentColor} size="sm" />
        <div className="opc-flow-node__meta">
          <div className="opc-flow-node__label">{data.label}</div>
          <div className="opc-flow-node__subtitle">{data.subtitle}</div>
        </div>
        <StatusPill status={data.status} />
      </GlassCard>
      <Handle type="source" position={Position.Right} className="opc-flow-node__handle" />
    </div>
  )
}

function buildAgentNodes(agents: Agent[], health: SystemHealth): Array<Node<GraphNodeData | ServiceNodeData>> {
  const byId = new Map(agents.map((agent) => [agent.id, agent]))

  return [
    {
      id: 'agent-conductor',
      type: 'agent',
      position: { x: 360, y: 180 },
      data: {
        id: 'agent-conductor',
        label: 'Conductor',
        subtitle: 'Core orchestration',
        accentColor: 'var(--opc-sky)',
        avatarType: 'conductor',
        status: byId.get('agent-conductor')?.status ?? 'idle',
      },
    },
    {
      id: 'agent-evolver',
      type: 'agent',
      position: { x: 660, y: 40 },
      data: {
        id: 'agent-evolver',
        label: 'Evolver',
        subtitle: 'Evolution layer',
        accentColor: 'var(--opc-lavender)',
        avatarType: 'evolver',
        status: byId.get('agent-evolver')?.status ?? 'idle',
      },
    },
    {
      id: 'agent-codex',
      type: 'agent',
      position: { x: 650, y: 310 },
      data: {
        id: 'agent-codex',
        label: 'Codex',
        subtitle: 'Coding layer',
        accentColor: 'var(--opc-coral)',
        avatarType: 'codex',
        status: byId.get('agent-codex')?.status ?? 'idle',
      },
    },
    {
      id: 'agent-claude-code',
      type: 'agent',
      position: { x: 810, y: 390 },
      data: {
        id: 'agent-claude-code',
        label: 'Claude Code',
        subtitle: 'Coding layer',
        accentColor: 'var(--opc-peach)',
        avatarType: 'claude-code',
        status: byId.get('agent-claude-code')?.status ?? 'idle',
      },
    },
    {
      id: 'agent-knowledge-curator',
      type: 'agent',
      position: { x: 70, y: 330 },
      data: {
        id: 'agent-knowledge-curator',
        label: 'Knowledge Curator',
        subtitle: 'Knowledge layer',
        accentColor: 'var(--opc-lemon)',
        avatarType: 'knowledge',
        status: byId.get('agent-knowledge-curator')?.status ?? 'idle',
      },
    },
    {
      id: 'agent-skill-worker',
      type: 'agent',
      position: { x: 35, y: 50 },
      data: {
        id: 'agent-skill-worker',
        label: 'Skill Worker',
        subtitle: 'Skill layer',
        accentColor: 'var(--opc-mint)',
        avatarType: 'skill',
        status: byId.get('agent-skill-worker')?.status ?? 'idle',
      },
    },
    {
      id: 'service-lancedb',
      type: 'service',
      position: { x: 860, y: 110 },
      data: {
        id: 'service-lancedb',
        label: 'LanceDB',
        subtitle: 'Memory node',
        accentColor: 'var(--opc-mint)',
        avatarType: 'memory',
        status: health.lancedb.connected ? 'connected' : 'disconnected',
      },
    },
    {
      id: 'service-obsidian',
      type: 'service',
      position: { x: 15, y: 430 },
      data: {
        id: 'service-obsidian',
        label: 'Obsidian',
        subtitle: 'Knowledge vault',
        accentColor: 'var(--opc-lemon)',
        avatarType: 'knowledge',
        status: health.obsidian.connected ? 'connected' : 'disconnected',
      },
    },
  ]
}

const graphEdges: Array<Edge> = [
  {
    id: 'edge-monitors',
    source: 'agent-conductor',
    target: 'agent-evolver',
    label: 'monitors',
    type: 'smoothstep',
    animated: true,
    style: { strokeDasharray: '6 8', stroke: 'var(--opc-lavender)', strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--opc-lavender)' },
    labelStyle: { fill: 'var(--opc-text-1)', fontSize: 11, fontWeight: 700 },
  },
  {
    id: 'edge-delegates-codex',
    source: 'agent-conductor',
    target: 'agent-codex',
    label: 'delegates_to',
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--opc-coral)' },
    style: { stroke: 'var(--opc-coral)', strokeWidth: 1.5 },
    labelStyle: { fill: 'var(--opc-text-1)', fontSize: 11, fontWeight: 700 },
  },
  {
    id: 'edge-delegates-knowledge',
    source: 'agent-conductor',
    target: 'agent-knowledge-curator',
    label: 'delegates_to',
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--opc-lemon)' },
    style: { stroke: 'var(--opc-lemon)', strokeWidth: 1.5 },
    labelStyle: { fill: 'var(--opc-text-1)', fontSize: 11, fontWeight: 700 },
  },
  {
    id: 'edge-lancedb',
    source: 'agent-evolver',
    target: 'service-lancedb',
    label: 'reads_writes',
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--opc-mint)' },
    style: { stroke: 'var(--opc-mint)', strokeWidth: 1.5 },
    labelStyle: { fill: 'var(--opc-text-1)', fontSize: 11, fontWeight: 700 },
  },
  {
    id: 'edge-patches',
    source: 'agent-evolver',
    target: 'agent-skill-worker',
    label: 'patches',
    type: 'smoothstep',
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--opc-peach)' },
    style: { strokeDasharray: '5 7', stroke: 'var(--opc-peach)', strokeWidth: 1.5 },
    labelStyle: { fill: 'var(--opc-text-1)', fontSize: 11, fontWeight: 700 },
  },
  {
    id: 'edge-obsidian',
    source: 'agent-knowledge-curator',
    target: 'service-obsidian',
    label: 'writes_to',
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--opc-lemon)' },
    style: { stroke: 'var(--opc-lemon)', strokeWidth: 1.5 },
    labelStyle: { fill: 'var(--opc-text-1)', fontSize: 11, fontWeight: 700 },
  },
  {
    id: 'edge-reports',
    source: 'agent-codex',
    target: 'agent-conductor',
    label: 'reports_to',
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--opc-sky)' },
    style: { stroke: 'var(--opc-sky)', strokeWidth: 1.5 },
    labelStyle: { fill: 'var(--opc-text-1)', fontSize: 11, fontWeight: 700 },
  },
]

interface AgentConstellationProps {
  agents: Agent[]
  health: SystemHealth
  onSelectNode: (nodeId: string) => void
}

export function AgentConstellation({ agents, health, onSelectNode }: AgentConstellationProps) {
  const nodes = useMemo(() => buildAgentNodes(agents, health), [agents, health])

  return (
    <GlassCard className="opc-dashboard-panel opc-flow-panel" variant="strong">
      <div className="opc-section-header">
        <div>
          <p className="opc-eyebrow">Topology</p>
          <h2 className="opc-section-title">Agent Constellation</h2>
        </div>
      </div>
      <div className="opc-flow-wrapper">
        <ReactFlow
          nodeTypes={nodeTypes}
          nodes={nodes}
          edges={graphEdges}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_, node) => onSelectNode(node.id)}
          nodesDraggable={false}
          elementsSelectable
        >
          <Background gap={24} size={1} color="rgba(120, 134, 166, 0.18)" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </GlassCard>
  )
}

interface AgentDrawerContentProps {
  agent: Agent
  events: SystemEvent[]
}

export function AgentDrawerContent({ agent, events }: AgentDrawerContentProps) {
  const recentEvents = events
    .filter((event) => event.agentId === agent.id)
    .slice(-3)
    .reverse()

  return (
    <div className="opc-detail-stack">
      <div className="opc-detail-grid">
        <div>
          <span className="opc-detail-label">Status</span>
          <StatusPill status={agent.status} />
        </div>
        <div>
          <span className="opc-detail-label">Current Task</span>
          <p className="opc-detail-value">{agent.currentTaskId ?? 'No active task'}</p>
        </div>
        <div>
          <span className="opc-detail-label">Model</span>
          <p className="opc-detail-value">{agent.model ?? 'Mock adapter'}</p>
        </div>
        <div>
          <span className="opc-detail-label">Health Score</span>
          <p className="opc-detail-value">{Math.round(agent.healthScore * 100)}%</p>
        </div>
      </div>
      <div>
        <span className="opc-detail-label">Capabilities</span>
        <div className="opc-tag-list">
          {agent.capabilities.map((capability) => (
            <span key={capability} className="opc-inline-tag">
              {capability}
            </span>
          ))}
        </div>
      </div>
      <div>
        <span className="opc-detail-label">Recent Events</span>
        <div className="opc-detail-list">
          {recentEvents.map((event) => (
            <div key={event.id} className="opc-detail-list-item">
              <div className="opc-detail-list-title">{event.title}</div>
              <div className="opc-detail-list-copy">{event.message}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

interface ServiceDrawerContentProps {
  title: string
  status: ConnectionState
  subtitle: string
  events: SystemEvent[]
}

export function ServiceDrawerContent({ title, status, subtitle, events }: ServiceDrawerContentProps) {
  const recentEvents = events
    .filter((event) => event.source === title.toLowerCase())
    .slice(-3)
    .reverse()

  return (
    <div className="opc-detail-stack">
      <div className="opc-detail-grid">
        <div>
          <span className="opc-detail-label">Status</span>
          <StatusPill status={status} />
        </div>
        <div>
          <span className="opc-detail-label">Role</span>
          <p className="opc-detail-value">{subtitle}</p>
        </div>
      </div>
      <div>
        <span className="opc-detail-label">Recent Events</span>
        <div className="opc-detail-list">
          {recentEvents.map((event) => (
            <div key={event.id} className="opc-detail-list-item">
              <div className="opc-detail-list-title">{event.title}</div>
              <div className="opc-detail-list-copy">{event.message}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
