import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { MemoryEntry } from '@opc/core'
import { Search, Star } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { GlassCard } from '@opc/ui'
import { useMemoryStore } from '@/stores/memoryStore'

function typeColor(type: MemoryEntry['type']) {
  if (type === 'episodic') return 'var(--opc-sky)'
  if (type === 'semantic') return 'var(--opc-lavender)'
  return 'var(--opc-mint)'
}

function qualityColor(score: number) {
  if (score < 0.2) return 'var(--opc-danger)'
  if (score < 0.4) return 'var(--opc-coral)'
  if (score < 0.6) return 'var(--opc-warning)'
  if (score < 0.8) return 'var(--opc-sky)'
  return 'var(--opc-success)'
}

function MemoryRow({ entry, selected }: { entry: MemoryEntry; selected: boolean }) {
  const { setSelected } = useMemoryStore()
  const hiddenTags = Math.max(0, entry.tags.length - 3)

  return (
    <button
      className={`opc-memory-row ${selected ? 'is-selected' : ''} ${entry.archived_at ? 'is-archived' : ''}`}
      onClick={() => setSelected(entry.id)}
      style={{ '--memory-type-color': typeColor(entry.type), '--quality-color': qualityColor(entry.quality_score) } as CSSProperties}
    >
      <span className="opc-memory-row__type" />
      <div className="opc-memory-row__body">
        <div className="opc-memory-row__top">
          <div className="opc-tag-list">
            {entry.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="opc-inline-tag">
                {tag}
              </span>
            ))}
            {hiddenTags > 0 ? <span className="opc-inline-tag">+{hiddenTags}</span> : null}
          </div>
          <div className="opc-memory-row__icons">
            {entry.is_core ? <Star className="opc-core-star" fill="currentColor" /> : null}
            <span className="opc-quality-dot" />
            {entry.archived_at ? <span className="opc-archived-badge">已归档</span> : null}
          </div>
        </div>
        <p>{entry.content}</p>
        <small>
          {entry.source} · {new Date(entry.updated_at).toLocaleString()}
        </small>
      </div>
    </button>
  )
}

export function MemoryList() {
  const { entries, filter, selectedId, setFilter, search } = useMemoryStore()
  const [query, setQuery] = useState(filter.searchQuery)
  const parentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilter({ searchQuery: query })
      if (filter.searchMode === 'semantic') {
        void search(query)
      }
    }, 300)

    return () => window.clearTimeout(timer)
  }, [filter.searchMode, query, search, setFilter])

  const visibleEntries = useMemo(() => {
    if (filter.searchMode !== 'exact' || !query.trim()) {
      return entries
    }

    const needle = query.toLowerCase()
    return entries.filter((entry) => `${entry.content} ${entry.tags.join(' ')} ${entry.source}`.toLowerCase().includes(needle))
  }, [entries, filter.searchMode, query])

  const useVirtual = visibleEntries.length > 100
  // TanStack Virtual owns its scroll measurement functions; the hook is isolated here.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: visibleEntries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 132,
    overscan: 8,
  })

  return (
    <GlassCard className="opc-memory-list-panel" variant="strong">
      <div className="opc-memory-toolbar">
        <div className="opc-toolbar-search">
          <Search />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="语义搜索..." />
        </div>
        <div className="opc-segmented-control">
          <button
            className={filter.searchMode === 'semantic' ? 'is-active' : ''}
            onClick={() => setFilter({ searchMode: 'semantic' })}
          >
            语义
          </button>
          <button
            className={filter.searchMode === 'exact' ? 'is-active' : ''}
            onClick={() => setFilter({ searchMode: 'exact' })}
          >
            精确
          </button>
        </div>
        <label className="opc-inline-check">
          <input
            type="checkbox"
            checked={filter.includeArchived}
            onChange={(event) => setFilter({ includeArchived: event.target.checked })}
          />
          显示已归档
        </label>
      </div>

      <div ref={parentRef} className="opc-memory-scroll">
        {useVirtual ? (
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const entry = visibleEntries[virtualItem.index]
              return (
                <div
                  key={entry.id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <MemoryRow entry={entry} selected={entry.id === selectedId} />
                </div>
              )
            })}
          </div>
        ) : (
          <div className="opc-memory-list">
            {visibleEntries.map((entry) => (
              <MemoryRow key={entry.id} entry={entry} selected={entry.id === selectedId} />
            ))}
          </div>
        )}
      </div>
    </GlassCard>
  )
}
