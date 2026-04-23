import type { ObsidianStatus, ReviewQueueEntry, VaultNode, VaultNote, VaultSearchResult } from '@opc/core'

export interface ObsidianConfig {
  apiUrl: string
  apiKey?: string
}

export interface WriteOptions {
  createParents?: boolean
  overwrite?: boolean
}

export interface ObsidianAdapter {
  connect(config: ObsidianConfig): Promise<void>
  disconnect(): Promise<void>
  status(): Promise<ObsidianStatus>
  getTree(path?: string): Promise<VaultNode[]>
  getNote(path: string): Promise<VaultNote | null>
  writeNote(path: string, content: string, options?: WriteOptions): Promise<void>
  appendNote(path: string, content: string): Promise<void>
  deleteNote(path: string): Promise<void>
  search(query: string, limit?: number): Promise<VaultSearchResult[]>
  getReviewQueue(): Promise<VaultNote[]>
  addToReviewQueue(note: ReviewQueueEntry): Promise<void>
}
