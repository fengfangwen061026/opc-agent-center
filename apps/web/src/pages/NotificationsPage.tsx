import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Check, Eye, Filter, RotateCcw, X } from "lucide-react";
import { GlassCard, LiquidButton, NotificationCard, StatusPill } from "@opc/ui";
import { VirtualList } from "../components/virtual/VirtualList";
import {
  actApproval,
  applyHermesCandidate,
  actHermesCandidate,
  actNotification,
  getAgents,
  getApprovals,
  getHermesCandidates,
  getNotifications,
} from "../lib/api";

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"notifications" | "approvals" | "hermes">("notifications");
  const [status, setStatus] = useState("");
  const [risk, setRisk] = useState("");
  const [type, setType] = useState("");
  const [agentId, setAgentId] = useState("");
  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: getNotifications,
  });
  const { data: approvals = [] } = useQuery({
    queryKey: ["approvals"],
    queryFn: getApprovals,
  });
  const { data: candidates = [] } = useQuery({
    queryKey: ["hermes-candidates"],
    queryFn: getHermesCandidates,
  });
  const { data: agents = [] } = useQuery({ queryKey: ["agents"], queryFn: getAgents });
  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) => actNotification(id, action),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const approvalMutation = useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string;
      action: "approve" | "reject" | "request-changes" | "archive";
    }) => actApproval(id, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["coding-runs"] });
    },
  });
  const candidateMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "reject" | "archive" }) =>
      actHermesCandidate(id, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hermes-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
    },
  });
  const applyCandidateMutation = useMutation({
    mutationFn: (id: string) => applyHermesCandidate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hermes-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["skills"] });
    },
  });
  const filtered = useMemo(
    () =>
      notifications.filter((notification) => {
        if (status && notification.status !== status) return false;
        if (risk && notification.risk !== risk) return false;
        if (type && notification.type !== type) return false;
        if (agentId && notification.source.agentId !== agentId) return false;
        return true;
      }),
    [agentId, notifications, risk, status, type],
  );

  return (
    <section className="opc-page-stack">
      <header className="opc-page-title">
        <span>审核中心</span>
        <h1>通知</h1>
      </header>
      <GlassCard className="opc-tab-list">
        <button
          className={tab === "notifications" ? "is-active" : undefined}
          onClick={() => setTab("notifications")}
          type="button"
        >
          全部通知
        </button>
        <button
          className={tab === "approvals" ? "is-active" : undefined}
          onClick={() => setTab("approvals")}
          type="button"
        >
          待审批 ({approvals.filter((item) => item.status === "waiting_action").length})
        </button>
        <button
          className={tab === "hermes" ? "is-active" : undefined}
          onClick={() => setTab("hermes")}
          type="button"
        >
          Hermes 候选 ({candidates.length})
        </button>
      </GlassCard>
      {tab === "approvals" ? (
        <GlassCard className="opc-list-panel">
          <VirtualList
            items={approvals}
            renderItem={(approval) => (
              <article className="opc-action-card" key={approval.id}>
                <div className="opc-panel-heading">
                  <strong>{approval.title}</strong>
                  <StatusPill label={approval.status} status="waiting_approval" />
                </div>
                <p>{approval.summary}</p>
                <dl className="opc-detail-grid">
                  <div>
                    <dt>风险</dt>
                    <dd>{approval.risk}</dd>
                  </div>
                  <div>
                    <dt>动作</dt>
                    <dd>{approval.proposedAction.label}</dd>
                  </div>
                  <div>
                    <dt>可回滚</dt>
                    <dd>{approval.proposedAction.reversible ? "是" : "否"}</dd>
                  </div>
                  <div>
                    <dt>恢复动作</dt>
                    <dd>
                      {approval.effect
                        ? `${approval.effect.targetType}/${approval.effect.action}`
                        : "仅状态审批"}
                    </dd>
                  </div>
                  <div>
                    <dt>参数 Hash</dt>
                    <dd>{approval.effect?.paramsHash.slice(0, 12) ?? "无"}</dd>
                  </div>
                  <div>
                    <dt>幂等键</dt>
                    <dd>{approval.effect?.idempotencyKey ?? "无"}</dd>
                  </div>
                  <div>
                    <dt>策略决策</dt>
                    <dd>
                      {approval.policyDecision
                        ? `${approval.policyDecision.allowed ? "允许" : "阻止"} / ${approval.policyDecision.reason}`
                        : "等待执行时评估"}
                    </dd>
                  </div>
                  <div>
                    <dt>回滚说明</dt>
                    <dd>
                      {approval.policyDecision?.rollbackNote ??
                        approval.proposedAction.rollbackPlan ??
                        "无"}
                    </dd>
                  </div>
                </dl>
                {approval.proposedAction.filesTouched.length ? (
                  <p>写入路径：{approval.proposedAction.filesTouched.join(" / ")}</p>
                ) : null}
                {approval.proposedAction.rollbackPlan ? (
                  <p>回滚方式：{approval.proposedAction.rollbackPlan}</p>
                ) : null}
                {approval.proposedAction.diffPreview ? (
                  <pre>{approval.proposedAction.diffPreview}</pre>
                ) : null}
                <div className="opc-action-row">
                  <LiquidButton
                    icon={<Check size={15} />}
                    onClick={() => approvalMutation.mutate({ id: approval.id, action: "approve" })}
                    variant="secondary"
                  >
                    批准
                  </LiquidButton>
                  <LiquidButton
                    icon={<X size={15} />}
                    onClick={() => approvalMutation.mutate({ id: approval.id, action: "reject" })}
                    variant="ghost"
                  >
                    拒绝
                  </LiquidButton>
                  <LiquidButton
                    icon={<RotateCcw size={15} />}
                    onClick={() =>
                      approvalMutation.mutate({ id: approval.id, action: "request-changes" })
                    }
                    variant="ghost"
                  >
                    要求修改
                  </LiquidButton>
                  <LiquidButton
                    icon={<Archive size={15} />}
                    onClick={() => approvalMutation.mutate({ id: approval.id, action: "archive" })}
                    variant="ghost"
                  >
                    归档
                  </LiquidButton>
                </div>
              </article>
            )}
          />
        </GlassCard>
      ) : null}
      {tab === "hermes" ? (
        <GlassCard className="opc-list-panel">
          <VirtualList
            items={candidates}
            renderItem={(candidate) => (
              <article className="opc-action-card" key={candidate.id}>
                <div className="opc-panel-heading">
                  <strong>{candidate.title}</strong>
                  <StatusPill label={candidate.status} status="evolving" />
                </div>
                <p>{candidate.rationale}</p>
                <pre>{candidate.patch ?? candidate.content}</pre>
                <div className="opc-action-row">
                  <LiquidButton
                    onClick={() => applyCandidateMutation.mutate(candidate.id)}
                    variant="secondary"
                  >
                    应用到草稿/实验
                  </LiquidButton>
                  <LiquidButton
                    onClick={() => candidateMutation.mutate({ id: candidate.id, action: "reject" })}
                    variant="ghost"
                  >
                    拒绝
                  </LiquidButton>
                </div>
              </article>
            )}
          />
        </GlassCard>
      ) : null}
      {tab === "notifications" ? (
        <>
          <GlassCard className="opc-filter-bar">
            <Filter size={18} />
            <select onChange={(event) => setStatus(event.target.value)} value={status}>
              <option value="">全部状态</option>
              <option value="waiting_action">待处理</option>
              <option value="unread">未读</option>
              <option value="resolved">已解决</option>
              <option value="rejected">已拒绝</option>
              <option value="changes_requested">已要求修改</option>
              <option value="archived">已归档</option>
            </select>
            <select onChange={(event) => setRisk(event.target.value)} value={risk}>
              <option value="">全部风险</option>
              {["S0", "S1", "S2", "S3", "S4"].map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select onChange={(event) => setType(event.target.value)} value={type}>
              <option value="">全部类型</option>
              {[...new Set(notifications.map((notification) => notification.type))].map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select onChange={(event) => setAgentId(event.target.value)} value={agentId}>
              <option value="">全部智能体</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </GlassCard>
          <GlassCard className="opc-list-panel">
            <VirtualList
              items={filtered}
              renderItem={(notification) => (
                <div className="opc-action-card" key={notification.id}>
                  <NotificationCard notification={notification} />
                  <div className="opc-action-row">
                    <LiquidButton
                      icon={<Check size={15} />}
                      onClick={() =>
                        actionMutation.mutate({ id: notification.id, action: "approve" })
                      }
                      variant="secondary"
                    >
                      批准
                    </LiquidButton>
                    <LiquidButton
                      icon={<X size={15} />}
                      onClick={() =>
                        actionMutation.mutate({ id: notification.id, action: "reject" })
                      }
                      variant="ghost"
                    >
                      拒绝
                    </LiquidButton>
                    <LiquidButton
                      icon={<Eye size={15} />}
                      onClick={() =>
                        actionMutation.mutate({ id: notification.id, action: "mark_resolved" })
                      }
                      variant="ghost"
                    >
                      标记解决
                    </LiquidButton>
                    <LiquidButton
                      icon={<RotateCcw size={15} />}
                      onClick={() =>
                        actionMutation.mutate({
                          id: notification.id,
                          action: "request_changes",
                        })
                      }
                      variant="ghost"
                    >
                      要求修改
                    </LiquidButton>
                    <LiquidButton
                      icon={<Archive size={15} />}
                      onClick={() =>
                        actionMutation.mutate({ id: notification.id, action: "archive" })
                      }
                      variant="ghost"
                    >
                      归档
                    </LiquidButton>
                  </div>
                  {notification.links.some((link) => link.kind === "capsule") ? (
                    <p>
                      关联 Capsule：
                      {notification.links.find((link) => link.kind === "capsule")?.href}
                    </p>
                  ) : null}
                </div>
              )}
            />
          </GlassCard>
        </>
      ) : null}
    </section>
  );
}
