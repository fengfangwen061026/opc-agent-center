import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'
import { GlassCard } from './GlassCard'
import { cx } from './utils'

export interface MetricCardProps extends HTMLAttributes<HTMLDivElement> {
  title: string
  value: ReactNode
  subtitle?: ReactNode
  accentColor: string
  icon?: ReactNode
}

export function MetricCard({
  className,
  title,
  value,
  subtitle,
  accentColor,
  icon,
  style,
  ...props
}: MetricCardProps) {
  return (
    <GlassCard
      className={cx('opc-metric-card', className)}
      style={{ '--opc-metric-accent': accentColor, ...style } as CSSProperties}
      {...props}
    >
      <div className="opc-metric-card__bar" />
      <div className="opc-metric-card__header">
        <span className="opc-metric-card__title">{title}</span>
        {icon ? <span className="opc-metric-card__icon">{icon}</span> : null}
      </div>
      <div className="opc-metric-card__value">{value}</div>
      {subtitle ? <div className="opc-metric-card__subtitle">{subtitle}</div> : null}
    </GlassCard>
  )
}
