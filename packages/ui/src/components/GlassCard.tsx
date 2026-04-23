import type { HTMLAttributes } from 'react'
import { forwardRef } from 'react'
import { cx } from './utils'

export type GlassCardVariant = 'default' | 'strong' | 'soft'
export type GlassCardPadding = 'none' | 'sm' | 'md' | 'lg'

export interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: GlassCardVariant
  padding?: GlassCardPadding
  interactive?: boolean
}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, variant = 'default', padding = 'md', interactive = false, ...props }, ref) => (
    <div
      ref={ref}
      className={cx(
        'opc-glass-card',
        `opc-glass-card--${variant}`,
        `opc-glass-card--pad-${padding}`,
        interactive && 'opc-glass-card--interactive',
        className,
      )}
      {...props}
    />
  ),
)

GlassCard.displayName = 'GlassCard'
