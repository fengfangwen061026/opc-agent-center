import type { ReactNode } from "react";
import { GlassCard } from "./GlassCard";
import { cn } from "../utils";

export type MetricCardProps = {
  title: string;
  value: string;
  detail?: string;
  trend?: string;
  icon?: ReactNode;
  className?: string;
};

export function MetricCard({ className, detail, icon, title, trend, value }: MetricCardProps) {
  return (
    <GlassCard className={cn("opc-metric-card", className)} interactive>
      <div className="opc-metric-card__topline">
        <span>{title}</span>
        {icon ? <span className="opc-metric-card__icon">{icon}</span> : null}
      </div>
      <div className="opc-metric-card__value">{value}</div>
      <div className="opc-metric-card__footer">
        {detail ? <span>{detail}</span> : null}
        {trend ? <strong>{trend}</strong> : null}
      </div>
    </GlassCard>
  );
}
