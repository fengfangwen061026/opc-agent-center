import type { OpcNotification } from "@opc/core";
import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";
import { cn } from "../utils";
import { StatusPill } from "./StatusPill";

const iconMap = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: ShieldAlert,
};

const notificationStatusLabels: Record<string, string> = {
  unread: "未读",
  read: "已读",
  waiting_action: "待处理",
  resolved: "已解决",
  rejected: "已拒绝",
  changes_requested: "要求修改",
  archived: "已归档",
  dismissed: "已忽略",
};

export type NotificationCardProps = {
  notification: OpcNotification;
  compact?: boolean;
  className?: string;
};

export function NotificationCard({
  className,
  compact = false,
  notification,
}: NotificationCardProps) {
  const Icon = iconMap[notification.severity];

  return (
    <article
      className={cn(
        "opc-notification-card",
        compact && "opc-notification-card--compact",
        className,
      )}
    >
      <div className="opc-notification-card__icon" data-severity={notification.severity}>
        <Icon aria-hidden="true" size={17} />
      </div>
      <div className="opc-notification-card__body">
        <div className="opc-notification-card__title-row">
          <strong>{notification.title}</strong>
          {notification.risk ? <span className="opc-risk-badge">{notification.risk}</span> : null}
        </div>
        <p>{notification.summary}</p>
        <StatusPill
          status={notification.status === "waiting_action" ? "waiting_approval" : "idle"}
          label={notificationStatusLabels[notification.status] ?? notification.status}
        />
      </div>
    </article>
  );
}
