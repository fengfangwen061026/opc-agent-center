import type { MemoryEntry, MemoryType } from '@opc/core'
import { BookMarked, Brain, Database, History } from 'lucide-react'
import { GlassCard } from '@opc/ui'
import { useMemoryStore } from '@/stores/memoryStore'

const memoryTypes: Array<{ value?: MemoryType; label: string; icon: typeof Brain }> = [
  { value: undefined, label: '全部', icon: Database },
  { value: 'episodic', label: 'Episodic', icon: Brain },
  { value: 'semantic', label: 'Semantic', icon: BookMarked },
  { value: 'procedural', label: 'Procedural', icon: History },
]

function tagCounts(entries: MemoryEntry[]) {
  const counts = new Map<string, number>()
  for (const entry of entries) {
    for (const tag of entry.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 15)
}

export function MemorySidebar() {
  const { entries, filter, stats, viewMode, setFilter, setViewMode } = useMemoryStore()
  const tags = tagCounts(entries)

  return (
    <GlassCard className="opc-memory-sidebar" variant="strong">
      <div>
        <p className="opc-eyebrow">LanceDB</p>
        <h1 className="opc-section-title">Memory</h1>
      </div>

      <div className="opc-memory-type-list">
        {memoryTypes.map((item) => {
          const Icon = item.icon
          const count = item.value ? stats?.byType[item.value] : stats?.total

          return (
            <button
              key={item.label}
              className={viewMode === 'list' && filter.type === item.value ? 'is-active' : ''}
              onClick={() => {
                setViewMode('list')
                setFilter({ type: item.value })
              }}
            >
              <Icon />
              <span>{item.label}</span>
              <strong>{count ?? 0}</strong>
            </button>
          )
        })}
      </div>

      <div className="opc-memory-divider" />

      <button
        className={`opc-memory-log-button ${viewMode === 'evolver-log' ? 'is-active' : ''}`}
        onClick={() => setViewMode('evolver-log')}
      >
        <History />
        Evolver 日志
      </button>

      <div className="opc-memory-tag-cloud">
        {tags.map(([tag, count]) => (
          <button
            key={tag}
            className={filter.tags.includes(tag) ? 'is-active' : ''}
            onClick={() =>
              setFilter({
                tags: filter.tags.includes(tag) ? filter.tags.filter((item) => item !== tag) : [...filter.tags, tag],
              })
            }
          >
            {tag}
            <span>{count}</span>
          </button>
        ))}
      </div>

      <div className="opc-memory-sidebar__footer">
        <span>{stats?.total ?? 0} active</span>
        <span>{stats?.archived ?? 0} archived</span>
      </div>
    </GlassCard>
  )
}
