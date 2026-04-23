import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { LiquidButton } from '@opc/ui'

interface DetailDrawerProps {
  open: boolean
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}

export function DetailDrawer({ open, title, subtitle, onClose, children, wide = false }: DetailDrawerProps) {
  return (
    <div className={`opc-drawer-root ${open ? 'is-open' : ''}`} aria-hidden={!open}>
      <button className="opc-drawer-backdrop" onClick={onClose} aria-label="Close drawer" />
      <aside className={`opc-drawer-panel ${wide ? 'is-wide' : ''}`}>
        <div className="opc-drawer-header">
          <div>
            <h2 className="opc-drawer-title">{title}</h2>
            {subtitle ? <p className="opc-drawer-subtitle">{subtitle}</p> : null}
          </div>
          <LiquidButton variant="ghost" icon={<X />} onClick={onClose} aria-label="Close drawer" />
        </div>
        <div className="opc-drawer-body">{children}</div>
      </aside>
    </div>
  )
}
