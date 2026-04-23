import { create } from 'zustand'
import type { ObsidianStatus, VaultNode, VaultNote, VaultSearchResult } from '@opc/core'
import { fetchBridge } from '@/lib/bridgeClient'

interface ObsidianStore {
  status: ObsidianStatus | null
  tree: VaultNode[]
  activeNote: VaultNote | null
  reviewQueue: VaultNote[]
  searchResults: VaultSearchResult[]
  viewMode: 'tree' | 'review-queue' | 'search'
  fetchStatus: () => Promise<void>
  fetchTree: (path?: string) => Promise<void>
  openNote: (path: string) => Promise<void>
  search: (query: string) => Promise<void>
  fetchReviewQueue: () => Promise<void>
  markReviewDone: (path: string) => void
  setViewMode: (mode: ObsidianStore['viewMode']) => void
}

const fallbackStatus: ObsidianStatus = {
  connected: false,
  vaultName: 'Mock OPC Vault',
  fileCount: 0,
}

export const useObsidianStore = create<ObsidianStore>((set, get) => ({
  status: fallbackStatus,
  tree: [],
  activeNote: null,
  reviewQueue: [],
  searchResults: [],
  viewMode: 'tree',
  fetchStatus: async () => {
    try {
      const status = await fetchBridge<ObsidianStatus>('/api/obsidian/status')
      set({ status })
    } catch {
      set({ status: fallbackStatus })
    }
  },
  fetchTree: async (path) => {
    try {
      const suffix = path ? `?path=${encodeURIComponent(path)}` : ''
      const tree = await fetchBridge<VaultNode[]>(`/api/obsidian/tree${suffix}`)
      set({ tree })
    } catch {
      set({ tree: [] })
    }
  },
  openNote: async (path) => {
    try {
      const note = await fetchBridge<VaultNote>(`/api/obsidian/note?path=${encodeURIComponent(path)}`)
      set({ activeNote: note, viewMode: 'tree' })
    } catch {
      set({ activeNote: null })
    }
  },
  search: async (query) => {
    const trimmed = query.trim()
    if (!trimmed) {
      set({ searchResults: [] })
      return
    }
    try {
      const searchResults = await fetchBridge<VaultSearchResult[]>(
        `/api/obsidian/search?q=${encodeURIComponent(trimmed)}&limit=30`,
      )
      set({ searchResults, viewMode: 'search' })
    } catch {
      set({ searchResults: [] })
    }
  },
  fetchReviewQueue: async () => {
    try {
      const reviewQueue = await fetchBridge<VaultNote[]>('/api/obsidian/review-queue')
      set({ reviewQueue })
    } catch {
      set({ reviewQueue: [] })
    }
  },
  markReviewDone: (path) => {
    set((state) => ({
      reviewQueue: state.reviewQueue.map((note) =>
        note.path === path
          ? { ...note, frontmatter: { ...note.frontmatter, status: 'done' }, modified: new Date().toISOString() }
          : note,
      ),
    }))
    void fetchBridge('/api/obsidian/note/append', {
      method: 'POST',
      body: JSON.stringify({ path, content: '\n\nReviewed: true' }),
    }).catch(() => undefined)
  },
  setViewMode: (viewMode) => {
    set({ viewMode })
    if (viewMode === 'review-queue') {
      void get().fetchReviewQueue()
    }
  },
}))
