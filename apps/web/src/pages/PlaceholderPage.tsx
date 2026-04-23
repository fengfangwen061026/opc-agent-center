import { ArrowRight } from 'lucide-react'
import { GlassCard, LiquidButton } from '@opc/ui'

interface PlaceholderPageProps {
  title: string
  description: string
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div className="opc-page opc-placeholder-page">
      <GlassCard className="opc-placeholder-card" variant="strong">
        <div>
          <p className="opc-eyebrow">Mock Surface</p>
          <h1 className="opc-page-title">{title}</h1>
          <p className="opc-page-copy">{description}</p>
        </div>
        <LiquidButton icon={<ArrowRight />} variant="ghost">
          Coming Next
        </LiquidButton>
      </GlassCard>
    </div>
  )
}
