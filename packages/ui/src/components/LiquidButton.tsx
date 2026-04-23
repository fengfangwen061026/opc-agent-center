import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { forwardRef } from 'react'
import { cx } from './utils'

export type LiquidButtonVariant = 'primary' | 'ghost' | 'danger'

export interface LiquidButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: LiquidButtonVariant
  icon?: ReactNode
}

export const LiquidButton = forwardRef<HTMLButtonElement, LiquidButtonProps>(
  ({ className, variant = 'primary', icon, children, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cx('opc-liquid-button', `opc-liquid-button--${variant}`, className)}
      {...props}
    >
      {icon ? <span className="opc-liquid-button__icon">{icon}</span> : null}
      {children ? <span className="opc-liquid-button__label">{children}</span> : null}
    </button>
  ),
)

LiquidButton.displayName = 'LiquidButton'
