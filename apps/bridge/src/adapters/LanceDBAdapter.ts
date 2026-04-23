import type { EvolverLogEntry, MemoryEntry, MemoryStats, MemoryType } from '@opc/core'

export interface LanceDBConfig {
  dbPath: string
  ollamaUrl: string
  embeddingModel: string
  autoCapture: boolean
  autoRecall: boolean
}

export interface LanceDBStatus {
  connected: boolean
  ollamaReachable: boolean
  embeddingModel: string | null
  totalEntries: number
  byType: Record<MemoryType, number>
}

export interface MemoryListParams {
  type?: MemoryType
  tags?: string[]
  page: number
  pageSize: number
  includeArchived?: boolean
}

export interface MemoryUpdatePatch {
  content?: string
  tags?: string[]
  is_core?: boolean
  quality_score?: number
  archived_at?: string | null
}

export interface LanceDBAdapter {
  connect(config: LanceDBConfig): Promise<void>
  isConnected(): boolean
  disconnect(): Promise<void>
  status(): Promise<LanceDBStatus>
  create(entry: Omit<MemoryEntry, 'id' | 'created_at' | 'updated_at'>): Promise<MemoryEntry>
  get(id: string): Promise<MemoryEntry | null>
  update(id: string, patch: MemoryUpdatePatch): Promise<MemoryEntry>
  softDelete(id: string): Promise<void>
  list(params: MemoryListParams): Promise<{ entries: MemoryEntry[]; total: number }>
  search(query: string, limit?: number): Promise<MemoryEntry[]>
  getEvolverLog(page: number, pageSize: number): Promise<{ entries: EvolverLogEntry[]; total: number }>
  writeEvolverLog(entry: Omit<EvolverLogEntry, 'id'>): Promise<void>
  bulkSoftDelete(ids: string[], reason: string): Promise<void>
  getStats(): Promise<MemoryStats>
}
