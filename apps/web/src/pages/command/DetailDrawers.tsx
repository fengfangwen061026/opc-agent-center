import type { TaskCapsule } from "@opc/core";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Copy, Download, Send, Sparkles, X } from "lucide-react";
import { AgentAvatar, GlassCard, LiquidButton, StatusPill } from "@opc/ui";
import { createCapsule, getHealth, reflectTask, requestContextPack } from "../../lib/api";
import { getAgentAvatarKind, type OpcGraphNodeData } from "./graphModel";

type AgentDetailDrawerProps = {
  node: OpcGraphNodeData | null;
  onClose: () => void;
};

export function AgentDetailDrawer({ node, onClose }: AgentDetailDrawerProps) {
  if (!node) return null;

  return (
    <aside className="opc-detail-drawer" aria-label="智能体详情">
      <GlassCard className="opc-detail-drawer__card">
        <DrawerHeader title={node.label} onClose={onClose} />
        <div className="opc-detail-drawer__hero">
          <AgentAvatar
            kind={node.agent ? getAgentAvatarKind(node.agent) : getAvatarKindForNode(node)}
            name={node.label}
            status={node.status}
          />
          <div>
            <StatusPill status={node.status} />
            <p>{node.agent?.role ?? node.skill?.description ?? node.subtitle}</p>
          </div>
        </div>
        {node.agent ? (
          <dl className="opc-detail-grid">
            <div>
              <dt>类型</dt>
              <dd>{node.agent.type}</dd>
            </div>
            <div>
              <dt>风险上限</dt>
              <dd>{node.agent.riskCeiling}</dd>
            </div>
            <div>
              <dt>当前技能</dt>
              <dd>{node.agent.currentSkill ?? "无"}</dd>
            </div>
            <div>
              <dt>运行时</dt>
              <dd>{node.agent.runtime ?? "未知"}</dd>
            </div>
          </dl>
        ) : null}
      </GlassCard>
    </aside>
  );
}

function getAvatarKindForNode(node: OpcGraphNodeData) {
  if (node.kind === "skill") return "skill";
  if (node.kind === "store") return "store";
  if (node.kind === "approval") return "approval";
  if (node.kind === "hermes") return "hermes";
  if (node.kind === "coding") return "coding";
  return "conductor";
}

type TaskDetailDrawerProps = {
  task: TaskCapsule | null;
  onClose: () => void;
};

export function TaskDetailDrawer({ onClose, task }: TaskDetailDrawerProps) {
  const [copied, setCopied] = useState(false);
  const { data: health } = useQuery({ queryKey: ["health"], queryFn: getHealth });
  const contextMutation = useMutation({
    mutationFn: () => requestContextPack(task?.taskId ?? "", task?.goal),
  });
  const reflectionMutation = useMutation({
    mutationFn: () => reflectTask(task?.taskId ?? ""),
  });
  const capsuleMutation = useMutation({
    mutationFn: () => createCapsule(task?.taskId ?? ""),
  });

  if (!task) return null;
  const capsuleJson = JSON.stringify(task, null, 2);

  return (
    <aside className="opc-detail-drawer" aria-label="任务详情">
      <GlassCard className="opc-detail-drawer__card">
        <DrawerHeader title={task.title} onClose={onClose} />
        <div className="opc-detail-drawer__hero">
          <StatusPill status={task.status} />
          <p>{task.goal}</p>
        </div>
        <div className="opc-detail-actions">
          <LiquidButton
            icon={<Copy size={16} />}
            onClick={() => {
              navigator.clipboard.writeText(capsuleJson).then(() => setCopied(true));
            }}
            variant="secondary"
          >
            {copied ? "已复制" : "复制 JSON"}
          </LiquidButton>
          <LiquidButton
            icon={<Download size={16} />}
            onClick={() => {
              capsuleMutation.mutate();
              const blob = new Blob([capsuleJson], { type: "application/json" });
              const link = document.createElement("a");
              link.href = URL.createObjectURL(blob);
              link.download = `${task.taskId}.json`;
              link.click();
              URL.revokeObjectURL(link.href);
            }}
            variant="secondary"
          >
            导出
          </LiquidButton>
          {health?.hermes !== "unavailable" ? (
            <>
              <LiquidButton
                icon={<Sparkles size={16} />}
                onClick={() => contextMutation.mutate()}
                variant="primary"
              >
                请求上下文包
              </LiquidButton>
              <LiquidButton
                icon={<Send size={16} />}
                onClick={() => reflectionMutation.mutate()}
                variant="primary"
              >
                发送反思
              </LiquidButton>
            </>
          ) : null}
        </div>
        <dl className="opc-detail-grid">
          <div>
            <dt>风险</dt>
            <dd>{task.risk}</dd>
          </div>
          <div>
            <dt>执行智能体</dt>
            <dd>{task.workerAgentIds.join(", ")}</dd>
          </div>
          <div>
            <dt>技能</dt>
            <dd>{task.skillsUsed.join(", ")}</dd>
          </div>
          <div>
            <dt>工具调用</dt>
            <dd>{task.metrics.toolCalls ?? 0}</dd>
          </div>
        </dl>
        <div className="opc-detail-section">
          <strong>动作摘要</strong>
          <ul>
            {task.actionsSummary.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        {contextMutation.data ? (
          <div className="opc-detail-section">
            <strong>Hermes 上下文包</strong>
            <pre>{JSON.stringify(contextMutation.data, null, 2)}</pre>
          </div>
        ) : null}
        {reflectionMutation.data ? (
          <div className="opc-detail-section">
            <strong>Hermes 反思结果</strong>
            <pre>{JSON.stringify(reflectionMutation.data, null, 2)}</pre>
          </div>
        ) : null}
        <div className="opc-detail-section">
          <strong>Capsule JSON</strong>
          <pre>{capsuleJson}</pre>
        </div>
      </GlassCard>
    </aside>
  );
}

function DrawerHeader({ onClose, title }: { onClose: () => void; title: string }) {
  return (
    <div className="opc-detail-drawer__header">
      <strong>{title}</strong>
      <LiquidButton aria-label="关闭抽屉" icon={<X size={16} />} onClick={onClose} variant="ghost">
        关闭
      </LiquidButton>
    </div>
  );
}
