import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import type { EvolverLogEntry, MemoryEntry, MemoryStats, MemoryType } from '@opc/core'
import { EvolverLogEntryListSchema, MemoryEntryListSchema, MemoryStatsSchema } from '@opc/core'
import type {
  LanceDBAdapter,
  LanceDBConfig,
  LanceDBStatus,
  MemoryListParams,
  MemoryUpdatePatch,
} from './LanceDBAdapter'

const repoRoot = resolve(process.cwd(), '../..')
const mockRoot = resolve(repoRoot, 'data/mock')
const memoryTypes: MemoryType[] = ['episodic', 'semantic', 'procedural']

async function readMock<T>(fileName: string): Promise<T> {
  return JSON.parse(await readFile(resolve(mockRoot, fileName), 'utf8')) as T
}

function nowIso() {
  return new Date().toISOString()
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
    const hasModel = models.some((model) => model === config.embeddingModel || model === `${config.embeddingModel}:latest`)
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
      archived_at: patch.archived_at === null ? undefined : (patch.archived_at ?? current.archived_at),
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
    const tags = new Set(params.tags ?? [])
    const page = Math.max(1, params.page)
    const pageSize = Math.min(200, Math.max(1, params.pageSize))
    const filtered = Array.from(this.entries.values())
      .filter((entry) => (params.includeArchived ? true : !entry.archived_at))
      .filter((entry) => (params.type ? entry.type === params.type : true))
      .filter((entry) => (tags.size === 0 ? true : entry.tags.some((tag) => tags.has(tag))))
      .sort((left, right) => right.updated_at.localeCompare(left.updated_at))

    const start = (page - 1) * pageSize
    return { entries: filtered.slice(start, start + pageSize), total: filtered.length }
  }

  async search(query: string, limit = 20): Promise<MemoryEntry[]> {
    const needle = query.trim().toLowerCase()
    if (!needle) {
      return []
    }

    return Array.from(this.entries.values())
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

  async getEvolverLog(page: number, pageSize: number): Promise<{ entries: EvolverLogEntry[]; total: number }> {
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
    const all = Array.from(this.entries.values())
    const active = all.filter((entry) => !entry.archived_at)
    const byType = Object.fromEntries(
      memoryTypes.map((type) => [type, active.filter((entry) => entry.type === type).length]),
    ) as Record<MemoryType, number>

    return MemoryStatsSchema.parse({
      total: active.length,
      byType,
      archived: all.length - active.length,
      core: active.filter((entry) => entry.is_core).length,
      lastUpdated: all.reduce((latest, entry) => (entry.updated_at > latest ? entry.updated_at : latest), nowIso()),
    })
  }
}
