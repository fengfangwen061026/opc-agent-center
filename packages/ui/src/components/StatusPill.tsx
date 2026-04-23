import type { OpcAgentStatus } from "@opc/core";
import { cn } from "../utils";

export type StatusPillStatus =
  | OpcAgentStatus
  | "planned"
  | "queued"
  | "active"
  | "available"
  | "connected"
  | "reconnecting"
  | "unavailable"
  | "requested"
  | "approved"
  | "preparing_workspace"
  | "collecting_artifacts"
  | "testing_optional"
  | "enabled"
  | "disabled"
  | "draft"
  | "deprecated";

const statusLabels: Record<string, string> = {
  idle: "空闲",
  planning: "规划中",
  running: "运行中",
  waiting_approval: "待审批",
  blocked: "阻塞",
  failed: "失败",
  completed: "完成",
  evolving: "演化中",
  offline: "离线",
  planned: "已计划",
  queued: "排队中",
  active: "活跃",
  available: "可用",
  connected: "已连接",
  reconnecting: "重连中",
  unavailable: "不可用",
  requested: "已请求",
  approved: "已批准",
  preparing_workspace: "准备工作区",
  collecting_artifacts: "收集产物",
  testing_optional: "测试中",
  enabled: "启用",
  disabled: "停用",
  draft: "草稿",
  deprecated: "废弃",
};

export type StatusPillProps = {
  status: StatusPillStatus;
  label?: string;
  className?: string;
};

export function StatusPill({ className, label, status }: StatusPillProps) {
  return (
    <span className={cn("opc-status-pill", className)} data-status={status}>
      <span className="opc-status-pill__dot" aria-hidden="true" />
      <span>{label ?? statusLabels[status] ?? status}</span>
    </span>
  );
}
