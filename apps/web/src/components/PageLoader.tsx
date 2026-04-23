import { GlassCard } from '@opc/ui'

export function PageLoader() {
  return (
    <div className="opc-page-loader">
      <GlassCard className="opc-page-loader__card" variant="strong">
        <span className="opc-loader-spinner" />
        <strong>Loading...</strong>
      </GlassCard>
    </div>
  )
}
