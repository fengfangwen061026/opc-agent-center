import type { MemoryEntry, MemoryStats, MemoryType } from '@opc/core'
import { MemoryStatsSchema } from '@opc/core'
import type { MemoryListParams } from './LanceDBAdapter'

export const memoryTypes: MemoryType[] = ['episodic', 'semantic', 'procedural']

export function nowIso() {
  return new Date().toISOString()
}

export function listMemoryEntries(
  entries: Iterable<MemoryEntry>,
  params: MemoryListParams,
): { entries: MemoryEntry[]; total: number } {
  const tags = new Set(params.tags ?? [])
  const page = Math.max(1, params.page)
  const pageSize = Math.min(200, Math.max(1, params.pageSize))
  const filtered = Array.from(entries)
    .filter((entry) => (params.includeArchived ? true : !entry.archived_at))
    .filter((entry) => (params.type ? entry.type === params.type : true))
    .filter((entry) => (tags.size === 0 ? true : entry.tags.some((tag) => tags.has(tag))))
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at))

  const start = (page - 1) * pageSize
  return { entries: filtered.slice(start, start + pageSize), total: filtered.length }
}

export function keywordSearchEntries(
  entries: Iterable<MemoryEntry>,
  query: string,
  limit = 20,
): MemoryEntry[] {
  const needle = query.trim().toLowerCase()
  if (!needle) {
    return []
  }

  return Array.from(entries)
    .filter((entry) => !entry.archived_at)
    .map((entry) => {
      const haystack = `${entry.content} ${entry.tags.join(' ')} ${entry.source}`.toLowerCase()
      const tagMatch = entry.tags.some((tag) => tag.toLowerCase().includes(needle)) ? 2 : 0
      const contentMatch = haystack.includes(needle) ? 1 : 0
      return { entry, score: tagMatch + contentMatch + entry.quality_score }
    })
    .filter((item) => item.score > item.entry.quality_score)
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, limit))
    .map((item) => item.entry)
}

export function deriveMemoryStats(entries: Iterable<MemoryEntry>): MemoryStats {
  const all = Array.from(entries)
  const active = all.filter((entry) => !entry.archived_at)
  const byType = Object.fromEntries(
    memoryTypes.map((type) => [type, active.filter((entry) => entry.type === type).length]),
  ) as Record<MemoryType, number>

  return MemoryStatsSchema.parse({
    total: active.length,
    byType,
    archived: all.length - active.length,
    core: active.filter((entry) => entry.is_core).length,
    lastUpdated: all.reduce(
      (latest, entry) => (entry.updated_at > latest ? entry.updated_at : latest),
      nowIso(),
    ),
  })
}
