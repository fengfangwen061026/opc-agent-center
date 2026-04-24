import { create } from 'zustand'
import type { EvolverLogEntry, MemoryEntry, MemoryStats, MemoryType } from '@opc/core'
import { fetchBridge } from '@/lib/bridgeClient'
import evolverLogData from '../../../../data/mock/evolver-log.json'
import memoryData from '../../../../data/mock/memory.json'

interface MemoryFilter {
  type?: MemoryType
  tags: string[]
  includeArchived: boolean
  searchQuery: string
  searchMode: 'semantic' | 'exact'
}

export type MemorySourceStatus = 'live' | 'bridge-offline-fallback' | 'optimistic-local'

interface MemoryStore {
  entries: MemoryEntry[]
  total: number
  stats: MemoryStats | null
  source: MemorySourceStatus
  statusMessage?: string
  selectedId: string | null
  filter: MemoryFilter
  evolverLog: EvolverLogEntry[]
  viewMode: 'list' | 'evolver-log'
  fetchEntries: () => Promise<void>
  fetchStats: () => Promise<void>
  search: (query: string) => Promise<void>
  updateEntry: (id: string, patch: Partial<MemoryEntry>) => Promise<void>
  softDelete: (id: string) => Promise<void>
  restore: (id: string) => Promise<void>
  fetchEvolverLog: () => Promise<void>
  setFilter: (partial: Partial<MemoryFilter>) => void
  setViewMode: (mode: 'list' | 'evolver-log') => void
  setSelected: (id: string | null) => void
}

function cloneData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

let fallbackEntries = cloneData(memoryData as MemoryEntry[])
let fallbackLog = cloneData(evolverLogData as EvolverLogEntry[])

function deriveStats(entries: MemoryEntry[]): MemoryStats {
  const active = entries.filter((entry) => !entry.archived_at)
  return {
    total: active.length,
    byType: {
      episodic: active.filter((entry) => entry.type === 'episodic').length,
      semantic: active.filter((entry) => entry.type === 'semantic').length,
      procedural: active.filter((entry) => entry.type === 'procedural').length,
    },
    archived: entries.length - active.length,
    core: active.filter((entry) => entry.is_core).length,
    lastUpdated: entries.reduce(
      (latest, entry) => (entry.updated_at > latest ? entry.updated_at : latest),
      new Date().toISOString(),
    ),
  }
}

function applyFilter(entries: MemoryEntry[], filter: MemoryFilter): MemoryEntry[] {
  const tags = new Set(filter.tags)
  return entries
    .filter((entry) => (filter.includeArchived ? true : !entry.archived_at))
    .filter((entry) => (filter.type ? entry.type === filter.type : true))
    .filter((entry) => (tags.size === 0 ? true : entry.tags.some((tag) => tags.has(tag))))
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
}

function keywordSearch(entries: MemoryEntry[], query: string): MemoryEntry[] {
  const needle = query.trim().toLowerCase()
  if (!needle) {
    return []
  }

  return entries
    .filter((entry) =>
      `${entry.content} ${entry.tags.join(' ')} ${entry.source}`.toLowerCase().includes(needle),
    )
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
}

function deriveFallbackView(filter: MemoryFilter): { entries: MemoryEntry[]; total: number } {
  const searchQuery = filter.searchQuery.trim()
  if (!searchQuery) {
    const entries = applyFilter(fallbackEntries, filter)
    return { entries, total: entries.length }
  }

  const base =
    filter.searchMode === 'exact'
      ? keywordSearch(fallbackEntries, searchQuery)
      : keywordSearch(fallbackEntries, searchQuery)

  const entries = applyFilter(base, filter)
  return { entries, total: entries.length }
}

function keywordFilter(entries: MemoryEntry[], query: string): MemoryEntry[] {
  const needle = query.trim().toLowerCase()
  if (!needle) {
    return entries
  }

  return entries.filter((entry) =>
    `${entry.content} ${entry.tags.join(' ')} ${entry.source}`.toLowerCase().includes(needle),
  )
}

function refreshFallbackState(filter: MemoryFilter) {
  const view = deriveFallbackView(filter)
  return {
    entries: view.entries,
    total: view.total,
    stats: deriveStats(fallbackEntries),
  }
}

function applyFallbackPatch(
  id: string,
  patch: Omit<Partial<MemoryEntry>, 'archived_at'> & { archived_at?: string | null },
) {
  fallbackEntries = fallbackEntries.map((entry) =>
    entry.id === id
      ? {
          ...entry,
          ...patch,
          archived_at:
            patch.archived_at === null ? undefined : (patch.archived_at ?? entry.archived_at),
          updated_at: new Date().toISOString(),
        }
      : entry,
  )
}

function appendFallbackArchiveLog(id: string, summary: string, reason: string) {
  fallbackLog = [
    {
      id: crypto.randomUUID(),
      type: 'archive',
      timestamp: new Date().toISOString(),
      summary,
      reason,
      affected_ids: [id],
    },
    ...fallbackLog,
  ]
}

export const useMemoryStore = create<MemoryStore>((set, get) => {
  const refreshVisibleEntries = async () => {
    const { filter } = get()
    if (filter.searchQuery.trim()) {
      await get().search(filter.searchQuery)
      return
    }

    await get().fetchEntries()
  }

  return {
  entries: applyFilter(fallbackEntries, {
    tags: [],
    includeArchived: false,
    searchQuery: '',
    searchMode: 'semantic',
  }),
  total: applyFilter(fallbackEntries, {
    tags: [],
    includeArchived: false,
    searchQuery: '',
    searchMode: 'semantic',
  }).length,
  stats: deriveStats(fallbackEntries),
  source: 'bridge-offline-fallback',
  statusMessage: 'Bridge offline; showing local fallback data.',
  selectedId: null,
  filter: {
    tags: [],
    includeArchived: false,
    searchQuery: '',
    searchMode: 'semantic',
  },
  evolverLog: fallbackLog,
  viewMode: 'list',
  fetchEntries: async () => {
    const { filter } = get()
    try {
      const params = new URLSearchParams({
        page: '1',
        pageSize: '200',
        includeArchived: String(filter.includeArchived),
      })
      if (filter.type) params.set('type', filter.type)
      if (filter.tags.length > 0) params.set('tags', filter.tags.join(','))
      const result = await fetchBridge<{ entries: MemoryEntry[]; total: number }>(
        `/api/memory?${params.toString()}`,
      )
      set({ entries: result.entries, total: result.total, source: 'live', statusMessage: undefined })
    } catch {
      set({
        ...refreshFallbackState(filter),
        source: 'bridge-offline-fallback',
        statusMessage: 'Bridge offline; showing local fallback data.',
      })
    }
  },
  fetchStats: async () => {
    try {
      const stats = await fetchBridge<MemoryStats>('/api/memory/stats')
      set({ stats, source: 'live', statusMessage: undefined })
    } catch {
      set({
        stats: deriveStats(fallbackEntries),
        source: 'bridge-offline-fallback',
        statusMessage: 'Bridge offline; showing local fallback data.',
      })
    }
  },
  search: async (query) => {
    set((state) => ({ filter: { ...state.filter, searchQuery: query } }))
    if (!query.trim()) {
      await get().fetchEntries()
      return
    }

    const { filter } = get()
    try {
      if (filter.searchMode === 'exact') {
        const params = new URLSearchParams({
          page: '1',
          pageSize: '200',
          includeArchived: String(filter.includeArchived),
        })
        if (filter.type) params.set('type', filter.type)
        if (filter.tags.length > 0) params.set('tags', filter.tags.join(','))
        const result = await fetchBridge<{ entries: MemoryEntry[]; total: number }>(
          `/api/memory?${params.toString()}`,
        )
        const entries = keywordFilter(result.entries, query)
        set({ entries, total: entries.length, source: 'live', statusMessage: undefined })
        return
      }

      const entries = await fetchBridge<MemoryEntry[]>(
        `/api/memory/search?q=${encodeURIComponent(query)}&limit=50`,
      )
      set({ entries, total: entries.length, source: 'live', statusMessage: undefined })
    } catch {
      const view = deriveFallbackView({ ...filter, searchQuery: query })
      set({
        entries: view.entries,
        total: view.total,
        source: 'bridge-offline-fallback',
        statusMessage: 'Bridge offline; search is using local fallback data.',
      })
    }
  },
  updateEntry: async (id, patch) => {
    set((state) => ({
      entries: state.entries.map((entry) =>
        entry.id === id ? { ...entry, ...patch, updated_at: new Date().toISOString() } : entry,
      ),
    }))

    try {
      await fetchBridge<MemoryEntry>(`/api/memory/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      })
      await Promise.all([refreshVisibleEntries(), get().fetchStats()])
    } catch {
      applyFallbackPatch(id, patch)
      set((state) => ({
        ...refreshFallbackState(state.filter),
        source: 'optimistic-local',
        statusMessage: 'Bridge save failed; this edit is local only and not persisted.',
      }))
    }
  },
  softDelete: async (id) => {
    const archivedAt = new Date().toISOString()
    set((state) => {
      const entries = state.filter.includeArchived
        ? state.entries.map((entry) =>
            entry.id === id ? { ...entry, archived_at: archivedAt, updated_at: archivedAt } : entry,
          )
        : state.entries.filter((entry) => entry.id !== id)
      return { entries, selectedId: state.selectedId === id ? null : state.selectedId }
    })

    try {
      await fetchBridge(`/api/memory/${id}`, { method: 'DELETE' })
      await Promise.all([refreshVisibleEntries(), get().fetchStats(), get().fetchEvolverLog()])
    } catch {
      applyFallbackPatch(id, { archived_at: archivedAt })
      appendFallbackArchiveLog(id, `Soft deleted memory ${id.slice(-8)}.`, 'Offline fallback soft delete')
      set((state) => ({
        ...refreshFallbackState(state.filter),
        source: 'optimistic-local',
        statusMessage: 'Bridge delete failed; this archive is local only and not persisted.',
        selectedId: state.selectedId === id ? null : state.selectedId,
        evolverLog: fallbackLog,
      }))
    }
  },
  restore: async (id) => {
    try {
      await fetchBridge<MemoryEntry>(`/api/memory/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ archived_at: null }),
      })
      await Promise.all([refreshVisibleEntries(), get().fetchStats(), get().fetchEvolverLog()])
    } catch {
      applyFallbackPatch(id, { archived_at: null })
      set((state) => ({
        ...refreshFallbackState(state.filter),
        source: 'optimistic-local',
        statusMessage: 'Bridge restore failed; this restore is local only and not persisted.',
      }))
    }
  },
  fetchEvolverLog: async () => {
    try {
      const result = await fetchBridge<{ entries: EvolverLogEntry[]; total: number }>(
        '/api/memory/evolver-log?page=1&pageSize=50',
      )
      set({ evolverLog: result.entries, source: 'live', statusMessage: undefined })
    } catch {
      set({
        evolverLog: fallbackLog,
        source: 'bridge-offline-fallback',
        statusMessage: 'Bridge offline; Evolver log is local fallback data.',
      })
    }
  },
  setFilter: (partial) => set((state) => ({ filter: { ...state.filter, ...partial } })),
  setViewMode: (viewMode) => set({ viewMode }),
  setSelected: (selectedId) => set({ selectedId }),
  }
})
