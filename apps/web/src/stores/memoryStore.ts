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

interface MemoryStore {
  entries: MemoryEntry[]
  total: number
  stats: MemoryStats | null
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

const mockEntries = memoryData as MemoryEntry[]
const mockLog = evolverLogData as EvolverLogEntry[]

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
    lastUpdated: entries.reduce((latest, entry) => (entry.updated_at > latest ? entry.updated_at : latest), new Date().toISOString()),
  }
}

export const useMemoryStore = create<MemoryStore>((set, get) => ({
  entries: mockEntries.filter((entry) => !entry.archived_at),
  total: mockEntries.filter((entry) => !entry.archived_at).length,
  stats: deriveStats(mockEntries),
  selectedId: null,
  filter: {
    tags: [],
    includeArchived: false,
    searchQuery: '',
    searchMode: 'semantic',
  },
  evolverLog: mockLog,
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
      const result = await fetchBridge<{ entries: MemoryEntry[]; total: number }>(`/api/memory?${params.toString()}`)
      set({ entries: result.entries, total: result.total })
    } catch {
      const tags = new Set(filter.tags)
      const fallback = mockEntries
        .filter((entry) => (filter.includeArchived ? true : !entry.archived_at))
        .filter((entry) => (filter.type ? entry.type === filter.type : true))
        .filter((entry) => (tags.size === 0 ? true : entry.tags.some((tag) => tags.has(tag))))
      set({ entries: fallback, total: fallback.length })
    }
  },
  fetchStats: async () => {
    try {
      const stats = await fetchBridge<MemoryStats>('/api/memory/stats')
      set({ stats })
    } catch {
      set({ stats: deriveStats(mockEntries) })
    }
  },
  search: async (query) => {
    set((state) => ({ filter: { ...state.filter, searchQuery: query } }))
    if (!query.trim()) {
      await get().fetchEntries()
      return
    }

    try {
      const entries = await fetchBridge<MemoryEntry[]>(`/api/memory/search?q=${encodeURIComponent(query)}&limit=50`)
      set({ entries, total: entries.length })
    } catch {
      const needle = query.toLowerCase()
      const entries = mockEntries.filter(
        (entry) =>
          !entry.archived_at &&
          (`${entry.content} ${entry.tags.join(' ')} ${entry.source}`.toLowerCase().includes(needle)),
      )
      set({ entries, total: entries.length })
    }
  },
  updateEntry: async (id, patch) => {
    set((state) => {
      const entries = state.entries.map((entry) =>
        entry.id === id ? { ...entry, ...patch, updated_at: new Date().toISOString() } : entry,
      )
      return { entries, stats: state.stats ? deriveStats([...mockEntries, ...entries]) : state.stats }
    })
    try {
      const entry = await fetchBridge<MemoryEntry>(`/api/memory/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      })
      set((state) => ({
        entries: state.entries.map((item) => (item.id === id ? entry : item)),
      }))
      await get().fetchStats()
    } catch {
      // Optimistic local state is retained when Bridge is offline.
    }
  },
  softDelete: async (id) => {
    const archivedAt = new Date().toISOString()
    set((state) => {
      const entries = state.filter.includeArchived
        ? state.entries.map((entry) => (entry.id === id ? { ...entry, archived_at: archivedAt } : entry))
        : state.entries.filter((entry) => entry.id !== id)
      return { entries, selectedId: state.selectedId === id ? null : state.selectedId }
    })
    try {
      await fetchBridge(`/api/memory/${id}`, { method: 'DELETE' })
      await Promise.all([get().fetchStats(), get().fetchEvolverLog()])
    } catch {
      // Local soft delete remains visible as fallback behavior.
    }
  },
  restore: async (id) => {
    try {
      const entry = await fetchBridge<MemoryEntry>(`/api/memory/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ archived_at: null }),
      })
      set((state) => ({
        entries: state.entries.map((item) => (item.id === id ? entry : item)),
      }))
      await Promise.all([get().fetchEntries(), get().fetchStats(), get().fetchEvolverLog()])
    } catch {
      set((state) => ({
        entries: state.entries.map((entry) => (entry.id === id ? { ...entry, archived_at: undefined } : entry)),
      }))
    }
  },
  fetchEvolverLog: async () => {
    try {
      const result = await fetchBridge<{ entries: EvolverLogEntry[]; total: number }>('/api/memory/evolver-log?page=1&pageSize=50')
      set({ evolverLog: result.entries })
    } catch {
      set({ evolverLog: mockLog })
    }
  },
  setFilter: (partial) => set((state) => ({ filter: { ...state.filter, ...partial } })),
  setViewMode: (viewMode) => set({ viewMode }),
  setSelected: (selectedId) => set({ selectedId }),
}))
