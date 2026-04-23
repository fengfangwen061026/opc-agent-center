import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { TaskCapsule } from "@opc/core";
import { Bot, BrainCircuit, Code2, DatabaseZap, RadioTower } from "lucide-react";
import { GlassCard, MetricCard, TaskTimelineItem } from "@opc/ui";
import { ErrorBoundary } from "../components/common/ErrorBoundary";
import { mockEvents } from "../data/mock";
import {
  getAgents,
  getApprovals,
  getCodingRuns,
  getHealth,
  getHermesCandidates,
  getNotifications,
  getSkillRuns,
  getTasks,
} from "../lib/api";
import { useEventStore } from "../stores/eventStore";
import { AgentDetailDrawer, TaskDetailDrawer } from "./command/DetailDrawers";
import { ConstellationGraph } from "./command/ConstellationGraph";
import type { OpcGraphNodeData } from "./command/graphModel";

export function CommandCenterPage() {
  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: getHealth,
    refetchInterval: 5000,
  });
  const { data: agents = [] } = useQuery({ queryKey: ["agents"], queryFn: getAgents });
  const { data: tasks = [] } = useQuery({ queryKey: ["tasks"], queryFn: getTasks });
  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: getNotifications,
  });
  const { data: approvals = [] } = useQuery({ queryKey: ["approvals"], queryFn: getApprovals });
  const { data: skillRuns = [] } = useQuery({ queryKey: ["skill-runs"], queryFn: getSkillRuns });
  const { data: codingRuns = [] } = useQuery({
    queryKey: ["coding-runs"],
    queryFn: getCodingRuns,
  });
  const { data: hermesCandidates = [] } = useQuery({
    queryKey: ["hermes-candidates"],
    queryFn: getHermesCandidates,
  });
  const events = useEventStore((state) => state.events);
  const [selectedNode, setSelectedNode] = useState<OpcGraphNodeData | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskCapsule | null>(null);

  const conductor = agents.find((agent) => agent.id === "agent-conductor") ?? agents[0];
  const hermes = agents.find((agent) => agent.id === "agent-hermes") ?? agents[0];
  const pendingApprovals =
    approvals.filter((item) => item.status === "waiting_action").length ||
    notifications.filter((item) => item.status === "waiting_action").length;
  const activeCodingAgents = codingRuns.filter((run) => run.status === "running").length;

  const taskById = useMemo(() => new Map(tasks.map((task) => [task.taskId, task])), [tasks]);
  const timelineEvents = useMemo(
    () => [...events].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 6),
    [events],
  );

  return (
    <section className="opc-command-page">
      <header className="opc-page-title opc-command-page__title">
        <span>指挥中心</span>
        <h1>个人 AI 超级中枢驾驶舱</h1>
      </header>

      <div className="opc-metrics-grid">
        <MetricCard
          detail="ws://127.0.0.1:18789"
          icon={<RadioTower size={18} />}
          title="网关健康"
          trend="Bridge API"
          value={stateLabel(health?.gateway ?? "offline")}
        />
        <MetricCard
          detail={`${conductor?.metrics?.activeTasks ?? 0} 个活跃任务 · ${pendingApprovals} 个待审批`}
          icon={<Bot size={18} />}
          title="OPC 主控智能体"
          trend={`${Math.round((conductor?.metrics?.successRate ?? 0) * 100)}% 成功率`}
          value={stateLabel(conductor?.status ?? "offline")}
        />
        <MetricCard
          detail={`${hermesCandidates.length} 个候选待审核`}
          icon={<BrainCircuit size={18} />}
          title="Hermes 认知核"
          trend={`${hermes?.metrics?.activeTasks ?? 0} 个活跃任务`}
          value={stateLabel(health?.hermes ?? "unavailable")}
        />
        <MetricCard
          detail={`${skillRuns.length} 个 Skill runs`}
          icon={<DatabaseZap size={18} />}
          title="Obsidian 仓库"
          trend="mock 仓库"
          value={stateLabel(health?.obsidian ?? "unavailable")}
        />
        <MetricCard
          detail={`${codingRuns.length} 个受控运行`}
          icon={<Code2 size={18} />}
          title="编程智能体"
          trend={`${activeCodingAgents} 个活跃`}
          value={`${activeCodingAgents}/2`}
        />
      </div>

      <div className="opc-command-grid">
        <GlassCard className="opc-constellation-card">
          <div className="opc-section-heading">
            <div>
              <span>智能体星座图</span>
              <h2>OpenClaw + Hermes + Skill 拓扑</h2>
            </div>
          </div>
          <ErrorBoundary title="智能体图谱加载失败">
            <ConstellationGraph agents={agents} onSelectNode={setSelectedNode} />
          </ErrorBoundary>
        </GlassCard>

        <GlassCard className="opc-timeline-card">
          <div className="opc-section-heading">
            <div>
              <span>实时任务时间线</span>
              <h2>最近系统事件</h2>
            </div>
          </div>
          <div className="opc-timeline-list">
            {timelineEvents.map((event) => {
              const payload = event.payload as { taskId?: string };
              const task = payload.taskId ? taskById.get(payload.taskId) : undefined;

              return (
                <TaskTimelineItem
                  event={event}
                  key={event.id}
                  onClick={() => setSelectedTask(task ?? tasks[0])}
                  task={task}
                />
              );
            })}
          </div>
        </GlassCard>
      </div>

      <AgentDetailDrawer node={selectedNode} onClose={() => setSelectedNode(null)} />
      <TaskDetailDrawer task={selectedTask} onClose={() => setSelectedTask(null)} />
      <SeededEvents eventsCount={mockEvents.length} />
    </section>
  );
}

function stateLabel(value: string): string {
  const labels: Record<string, string> = {
    active: "活跃",
    available: "可用",
    blocked: "阻塞",
    completed: "完成",
    connected: "已连接",
    evolving: "演化中",
    failed: "失败",
    idle: "空闲",
    offline: "离线",
    planning: "规划中",
    reconnecting: "重连中",
    running: "运行中",
    unavailable: "不可用",
    waiting_approval: "待审批",
  };
  return labels[value] ?? value;
}

function SeededEvents({ eventsCount }: { eventsCount: number }) {
  return <span className="opc-sr-only">{eventsCount} 条 mock 事件已载入</span>;
}
