import type { HTMLAttributes } from 'react'
import type { StatusPillStatus } from './StatusPill'
import { cx } from './utils'

export interface ConnectionBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  label: string
  status: StatusPillStatus
  detail?: string
}

export function ConnectionBadge({ className, label, status, detail, ...props }: ConnectionBadgeProps) {
  return (
    <span
      className={cx('opc-connection-badge', `opc-connection-badge--${status}`, className)}
      title={detail}
      {...props}
    >
      <span className="opc-connection-badge__dot" />
      <span className="opc-connection-badge__label">{label}</span>
    </span>
  )
}
