import { Check, ExternalLink } from 'lucide-react'
import { GlassCard, LiquidButton, StatusPill } from '@opc/ui'
import { useObsidianStore } from '@/stores/obsidianStore'

export function ReviewQueuePanel() {
  const { reviewQueue, markReviewDone, openNote } = useObsidianStore()

  return (
    <GlassCard className="opc-review-queue-panel" variant="strong">
      <div className="opc-section-header">
        <div>
          <p className="opc-eyebrow">Review Queue</p>
          <h2 className="opc-section-title">Captured Knowledge</h2>
        </div>
      </div>
      <div className="opc-review-list">
        {reviewQueue.map((note) => {
          const status = note.frontmatter?.status === 'done' ? 'done' : 'pending'
          return (
            <GlassCard key={note.path} className="opc-review-card" variant="soft">
              <div className="opc-review-card__header">
                <div>
                  <h3>{String(note.frontmatter?.title ?? note.path.split('/').pop()?.replace(/\.md$/, '') ?? note.path)}</h3>
                  <p>{String(note.frontmatter?.sourceUrl ?? 'local capture')}</p>
                </div>
                <StatusPill status={status === 'done' ? 'connected' : 'running'} label={status === 'done' ? '已处理' : '待处理'} />
              </div>
              <p>{note.content.replace(/^---[\s\S]*?---/, '').replace(/^# .*/m, '').trim().slice(0, 220)}</p>
              <div className="opc-tag-list">
                {(Array.isArray(note.frontmatter?.tags) ? note.frontmatter.tags : []).slice(0, 5).map((tag) => (
                  <span key={String(tag)} className="opc-inline-tag">
                    {String(tag)}
                  </span>
                ))}
              </div>
              <div className="opc-drawer-actions">
                <LiquidButton variant="ghost" icon={<ExternalLink />} onClick={() => void openNote(note.path)}>
                  打开笔记
                </LiquidButton>
                <LiquidButton icon={<Check />} onClick={() => markReviewDone(note.path)}>
                  标记已处理
                </LiquidButton>
              </div>
            </GlassCard>
          )
        })}
      </div>
    </GlassCard>
  )
}
