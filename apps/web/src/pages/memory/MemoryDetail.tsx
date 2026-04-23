import { useMemo, useState } from 'react'
import { Brain, Save, Star, Trash2, Undo2, X } from 'lucide-react'
import type { MemoryEntry } from '@opc/core'
import { GlassCard, LiquidButton, StatusPill } from '@opc/ui'
import { useMemoryStore } from '@/stores/memoryStore'

function qualityLabel(score: number) {
  return `${Math.round(score * 100)}%`
}

export function MemoryDetail() {
  const { entries, selectedId } = useMemoryStore()
  const selected = useMemo(() => entries.find((entry) => entry.id === selectedId), [entries, selectedId])

  if (!selected) {
    return null
  }

  return <MemoryDetailPanel key={selected.id} selected={selected} />
}

function MemoryDetailPanel({ selected }: { selected: MemoryEntry }) {
  const { setSelected, updateEntry, softDelete, restore } = useMemoryStore()
  const [draft, setDraft] = useState<MemoryEntry | undefined>(selected)
  const [tagInput, setTagInput] = useState('')

  if (!draft) {
    return null
  }

  const dirty = JSON.stringify(selected) !== JSON.stringify(draft)

  return (
    <GlassCard className="opc-memory-detail" variant="strong">
      <div className="opc-memory-detail__header">
        <div>
          <p className="opc-eyebrow">Memory Detail</p>
          <h2>
            <Brain /> {selected.id.slice(-8)}
          </h2>
        </div>
        <button className="opc-icon-button" onClick={() => setSelected(null)} aria-label="Close memory detail">
          <X />
        </button>
      </div>

      <div className="opc-detail-stack">
        <StatusPill status={selected.archived_at ? 'disconnected' : 'connected'} label={selected.archived_at ? '已归档' : selected.type} />

        <label className="opc-memory-label">
          Content
          <textarea
            className="opc-memory-editor"
            value={draft.content}
            onChange={(event) => setDraft({ ...draft, content: event.target.value })}
          />
        </label>

        <div className="opc-detail-grid">
          <div>
            <span className="opc-detail-label">Source</span>
            <p className="opc-detail-value">{selected.source}</p>
          </div>
          <div>
            <span className="opc-detail-label">Quality</span>
            <p className="opc-detail-value">{qualityLabel(draft.quality_score)}</p>
          </div>
          <div>
            <span className="opc-detail-label">Created</span>
            <p className="opc-detail-value">{new Date(selected.created_at).toLocaleString()}</p>
          </div>
          <div>
            <span className="opc-detail-label">Updated</span>
            <p className="opc-detail-value">{new Date(selected.updated_at).toLocaleString()}</p>
          </div>
        </div>

        <div className="opc-memory-quality">
          <div style={{ width: `${draft.quality_score * 100}%` }} />
        </div>

        <div className="opc-memory-tag-editor">
          {draft.tags.map((tag) => (
            <button key={tag} onClick={() => setDraft({ ...draft, tags: draft.tags.filter((item) => item !== tag) })}>
              {tag}
              <X />
            </button>
          ))}
          <input
            value={tagInput}
            placeholder="Add tag"
            onChange={(event) => setTagInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && tagInput.trim()) {
                event.preventDefault()
                setDraft({ ...draft, tags: Array.from(new Set([...draft.tags, tagInput.trim()])) })
                setTagInput('')
              }
            }}
          />
        </div>

        <label className="opc-memory-core-toggle">
          <input
            type="checkbox"
            checked={draft.is_core}
            onChange={(event) => setDraft({ ...draft, is_core: event.target.checked })}
          />
          <Star fill={draft.is_core ? 'currentColor' : 'none'} />
          核心记忆
        </label>
        {draft.is_core ? <p className="opc-warning-copy">核心记忆，不会被自动清理。</p> : null}

        {dirty ? (
          <div className="opc-drawer-actions">
            <LiquidButton
              icon={<Save />}
              onClick={() => {
                if (window.confirm('保存这条 memory 的修改？')) {
                  void updateEntry(selected.id, {
                    content: draft.content,
                    tags: draft.tags,
                    is_core: draft.is_core,
                    quality_score: draft.quality_score,
                  })
                }
              }}
            >
              保存
            </LiquidButton>
            <LiquidButton variant="ghost" onClick={() => setDraft(selected)}>
              取消
            </LiquidButton>
          </div>
        ) : null}

        {selected.archived_at ? (
          <LiquidButton variant="ghost" icon={<Undo2 />} onClick={() => void restore(selected.id)}>
            恢复
          </LiquidButton>
        ) : (
          <LiquidButton
            variant="danger"
            icon={<Trash2 />}
            onClick={() => {
              if (window.confirm('此操作可在 Evolver 日志中恢复。确认软删除？')) {
                void softDelete(selected.id)
              }
            }}
          >
            软删除
          </LiquidButton>
        )}
      </div>
    </GlassCard>
  )
}
