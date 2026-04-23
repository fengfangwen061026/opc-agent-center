import type { HTMLAttributes } from 'react'
import { cx } from './utils'

export type StatusPillStatus = 'connected' | 'disconnected' | 'running' | 'idle' | 'error'

export interface StatusPillProps extends HTMLAttributes<HTMLSpanElement> {
  status: StatusPillStatus
  label?: string
}

const fallbackLabel: Record<StatusPillStatus, string> = {
  connected: 'Connected',
  disconnected: 'Disconnected',
  running: 'Running',
  idle: 'Idle',
  error: 'Error',
}

export function StatusPill({ className, status, label, ...props }: StatusPillProps) {
  return (
    <span className={cx('opc-status-pill', `opc-status-pill--${status}`, className)} {...props}>
      <span className="opc-status-pill__dot" />
      {label ?? fallbackLabel[status]}
    </span>
  )
}
