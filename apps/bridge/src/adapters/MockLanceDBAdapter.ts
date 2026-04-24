import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import type { EvolverLogEntry, MemoryEntry, MemoryStats } from '@opc/core'
import { EvolverLogEntryListSchema, MemoryEntryListSchema } from '@opc/core'
import type {
  LanceDBAdapter,
  LanceDBConfig,
  LanceDBStatus,
  MemoryListParams,
  MemoryUpdatePatch,
} from './LanceDBAdapter'
import { deriveMemoryStats, keywordSearchEntries, listMemoryEntries, nowIso } from './memoryUtils'

const repoRoot = resolve(process.cwd(), '../..')
const mockRoot = process.env.OPC_MOCK_ROOT ?? resolve(repoRoot, 'data/mock')

async function readMock<T>(fileName: string): Promise<T> {
  return JSON.parse(await readFile(resolve(mockRoot, fileName), 'utf8')) as T
}

async function probeOllama(config: LanceDBConfig) {
  try {
    const response = await fetch(`${config.ollamaUrl.replace(/\/$/, '')}/api/tags`, {
      signal: AbortSignal.timeout(1200),
    })
    if (!response.ok) {
      return { reachable: false, model: null as string | null }
    }
    const payload = (await response.json()) as { models?: Array<{ name?: string }> }
    const models = payload.models?.map((model) => model.name).filter(Boolean) ?? []
    const hasModel = models.some(
      (model) => model === config.embeddingModel || model === `${config.embeddingModel}:latest`,
    )
    return { reachable: true, model: hasModel ? config.embeddingModel : null }
  } catch {
    return { reachable: false, model: null as string | null }
  }
}

export class MockLanceDBAdapter implements LanceDBAdapter {
  protected connected = false
  private config: LanceDBConfig | undefined
  private ollamaReachable = false
  private embeddingModel: string | null = null
  private entries = new Map<string, MemoryEntry>()
  private evolverLog: EvolverLogEntry[] = []

  async connect(config: LanceDBConfig): Promise<void> {
    this.config = config
    const probe = await probeOllama(config)
    this.ollamaReachable = probe.reachable
    this.embeddingModel = probe.model
    const memory = MemoryEntryListSchema.parse(await readMock('memory.json'))
    const logs = EvolverLogEntryListSchema.parse(await readMock('evolver-log.json'))
    this.entries = new Map(memory.map((entry) => [entry.id, entry]))
    this.evolverLog = logs.sort((left, right) => right.timestamp.localeCompare(left.timestamp))
    this.connected = true
  }

  isConnected(): boolean {
    return this.connected
  }

  async disconnect(): Promise<void> {
    this.connected = false
  }

  async status(): Promise<LanceDBStatus> {
    const stats = await this.getStats()
    return {
      connected: this.connected,
      ollamaReachable: this.ollamaReachable,
      embeddingModel: this.embeddingModel,
      source: 'mock',
      semanticSearch: this.ollamaReachable && this.embeddingModel ? 'vector' : 'keyword-fallback',
      totalEntries: stats.total,
      byType: stats.byType,
    }
  }

  async create(entry: Omit<MemoryEntry, 'id' | 'created_at' | 'updated_at'>): Promise<MemoryEntry> {
    const timestamp = nowIso()
    const next: MemoryEntry = {
      ...entry,
      id: randomUUID(),
      created_at: timestamp,
      updated_at: timestamp,
    }
    this.entries.set(next.id, next)
    return next
  }

  async get(id: string): Promise<MemoryEntry | null> {
    return this.entries.get(id) ?? null
  }

  async update(id: string, patch: MemoryUpdatePatch): Promise<MemoryEntry> {
    const current = this.entries.get(id)
    if (!current) {
      throw new Error('Memory entry not found')
    }

    const next: MemoryEntry = {
      ...current,
      ...patch,
      archived_at:
        patch.archived_at === null ? undefined : (patch.archived_at ?? current.archived_at),
      updated_at: nowIso(),
    }
    this.entries.set(id, next)
    return next
  }

  async softDelete(id: string): Promise<void> {
    const entry = this.entries.get(id)
    if (!entry) {
      throw new Error('Memory entry not found')
    }
    const archivedAt = nowIso()
    this.entries.set(id, { ...entry, archived_at: archivedAt, updated_at: archivedAt })
    await this.writeEvolverLog({
      type: 'archive',
      timestamp: archivedAt,
      summary: `Soft deleted memory ${id.slice(-8)}.`,
      reason: 'Manual soft delete from Memory detail panel.',
      affected_ids: [id],
    })
  }

  async list(params: MemoryListParams): Promise<{ entries: MemoryEntry[]; total: number }> {
    return listMemoryEntries(this.entries.values(), params)
  }

  async search(query: string, limit = 20): Promise<MemoryEntry[]> {
    return keywordSearchEntries(this.entries.values(), query, limit)
  }

  async getEvolverLog(
    page: number,
    pageSize: number,
  ): Promise<{ entries: EvolverLogEntry[]; total: number }> {
    const start = (Math.max(1, page) - 1) * pageSize
    return {
      entries: this.evolverLog.slice(start, start + pageSize),
      total: this.evolverLog.length,
    }
  }

  async writeEvolverLog(entry: Omit<EvolverLogEntry, 'id'>): Promise<void> {
    this.evolverLog = [{ ...entry, id: randomUUID() }, ...this.evolverLog]
  }

  async bulkSoftDelete(ids: string[], reason: string): Promise<void> {
    const archivedAt = nowIso()
    for (const id of ids) {
      const entry = this.entries.get(id)
      if (entry) {
        this.entries.set(id, { ...entry, archived_at: archivedAt, updated_at: archivedAt })
      }
    }

    await this.writeEvolverLog({
      type: 'archive',
      timestamp: archivedAt,
      summary: `Bulk archived ${ids.length} memory entries.`,
      reason,
      affected_ids: ids,
    })
  }

  async getStats(): Promise<MemoryStats> {
    return deriveMemoryStats(this.entries.values())
  }
}
