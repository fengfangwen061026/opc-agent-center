import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type { EvolverLogEntry, MemoryEntry } from '@opc/core'
import { ChevronDown, RotateCcw } from 'lucide-react'
import { GlassCard, LiquidButton } from '@opc/ui'
import { useMemoryStore } from '@/stores/memoryStore'

function logAccent(type: EvolverLogEntry['type']) {
  if (type === 'merge') return 'var(--opc-sky)'
  if (type === 'prune') return 'var(--opc-peach)'
  if (type === 'archive') return 'var(--opc-text-2)'
  if (type === 'skill_patch') return 'var(--opc-lavender)'
  return 'var(--opc-success)'
}

function summaryFor(entry: MemoryEntry | undefined, id: string) {
  return entry?.content ?? `Memory ${id.slice(-8)}`
}

export function EvolverLogView() {
  const { evolverLog, entries, restore } = useMemoryStore()
  const [open, setOpen] = useState<string[]>([])
  const byId = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries])

  const toggle = (id: string) => {
    setOpen((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }

  return (
    <GlassCard className="opc-evolver-log-view" variant="strong">
      <div className="opc-section-header">
        <div>
          <p className="opc-eyebrow">Audit</p>
          <h2 className="opc-section-title">Evolver 整理日志</h2>
        </div>
      </div>
      <div className="opc-evolver-log-list">
        {evolverLog.map((log) => {
          const expanded = open.includes(log.id)
          const retained = log.retained_id ? byId.get(log.retained_id) : undefined
          const merged = log.affected_ids.filter((id) => id !== log.retained_id)

          return (
            <div key={log.id} className="opc-evolver-log-item" style={{ '--log-accent': logAccent(log.type) } as CSSProperties}>
              <button className="opc-evolver-log-item__summary" onClick={() => toggle(log.id)}>
                <span className="opc-log-type">{log.type.toUpperCase()}</span>
                <span>{new Date(log.timestamp).toLocaleString()}</span>
                <strong>{log.summary}</strong>
                <ChevronDown className={expanded ? 'is-open' : ''} />
              </button>

              {expanded ? (
                <div className="opc-evolver-log-item__body">
                  <p>{log.reason}</p>
                  {log.type === 'merge' ? (
                    <div className="opc-merge-comparison">
                      <div>
                        <span className="opc-inline-tag">已保留</span>
                        <p>{summaryFor(retained, log.retained_id ?? '')}</p>
                      </div>
                      <div>
                        <span className="opc-inline-tag">已合并</span>
                        {merged.map((id) => (
                          <div key={id} className="opc-log-memory-row">
                            <span>{summaryFor(byId.get(id), id)}</span>
                            <LiquidButton variant="ghost" icon={<RotateCcw />} onClick={() => void restore(id)}>
                              恢复
                            </LiquidButton>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {log.type === 'prune' || log.type === 'archive' ? (
                    <div className="opc-detail-list">
                      <p>{log.affected_ids.length} 条已软删除</p>
                      {log.affected_ids.map((id) => (
                        <div key={id} className="opc-log-memory-row">
                          <span>{summaryFor(byId.get(id), id)}</span>
                          <LiquidButton variant="ghost" icon={<RotateCcw />} onClick={() => void restore(id)}>
                            恢复
                          </LiquidButton>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {log.type === 'skill_patch' || log.type === 'eval' ? (
                    <p className="opc-detail-value">
                      Eval {log.score_before ?? '--'} → {log.score_after ?? '--'}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </GlassCard>
  )
}
