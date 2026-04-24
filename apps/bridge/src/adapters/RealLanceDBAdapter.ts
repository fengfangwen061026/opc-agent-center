import { randomUUID } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import * as lancedb from '@lancedb/lancedb'
import type { Connection, Table } from '@lancedb/lancedb'
import type { EvolverLogEntry, MemoryEntry, MemoryStats, MemoryType } from '@opc/core'
import {
  EvolverLogEntryListSchema,
  EvolverLogEntrySchema,
  MemoryEntryListSchema,
  MemoryEntrySchema,
} from '@opc/core'
import type {
  LanceDBAdapter,
  LanceDBConfig,
  LanceDBStatus,
  MemoryListParams,
  MemoryUpdatePatch,
} from './LanceDBAdapter'
import { deriveMemoryStats, keywordSearchEntries, listMemoryEntries, memoryTypes, nowIso } from './memoryUtils'

interface EmbeddingProbe {
  reachable: boolean
  model: string | null
}

interface RealLanceDBAdapterOptions {
  seedMockOnEmpty?: boolean
  embedText?: (text: string, config: LanceDBConfig, model: string) => Promise<number[]>
}

type MemoryRow = Record<string, unknown> & {
  id: string
  content: string
  type: MemoryType
  tags_json: string
  source: string
  created_at: string
  updated_at: string
  quality_score: number
  is_core: boolean
  merged_from_json: string
  archived_at: string
  vector: number[]
}

type EvolverLogRow = Record<string, unknown> & {
  id: string
  type: EvolverLogEntry['type']
  timestamp: string
  summary: string
  reason: string
  affected_ids_json: string
  retained_id: string
  score_before: number | null
  score_after: number | null
  vector: number[]
}

const EVOLVER_LOG_TABLE = 'evolver_log'
const FALLBACK_VECTOR_DIMENSION = 768
const repoRoot = resolve(process.cwd(), '../..')
const mockRoot = process.env.OPC_MOCK_ROOT ?? resolve(repoRoot, 'data/mock')

function expandHome(path: string) {
  return path.replace(/^~/, homedir())
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

function fallbackVector(dimension = FALLBACK_VECTOR_DIMENSION) {
  return Array.from({ length: dimension }, () => 0)
}

function compactReason(reason: string) {
  return reason.replace(/\s+/g, ' ').trim().slice(0, 240)
}

async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return fallback
    }
    throw error
  }
}

async function readMock<T>(fileName: string): Promise<T> {
  return JSON.parse(await readFile(resolve(mockRoot, fileName), 'utf8')) as T
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout`)), ms)
  })

  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}

async function probeEmbeddingModel(ollamaUrl: string, preferred: string): Promise<EmbeddingProbe> {
  try {
    const response = await fetch(`${ollamaUrl.replace(/\/$/, '')}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    })
    if (!response.ok) {
      return { reachable: false, model: null }
    }

    const payload = (await response.json()) as { models?: Array<{ name?: string }> }
    const names = payload.models?.map((model) => model.name).filter((name): name is string => Boolean(name)) ?? []
    const selected =
      names.find((name) => name === preferred || name.startsWith(`${preferred}:`)) ??
      names.find((name) => name.startsWith('nomic-embed-text')) ??
      names.find((name) => name.includes('embed')) ??
      null

    return { reachable: true, model: selected }
  } catch {
    return { reachable: false, model: null }
  }
}

async function ollamaEmbed(text: string, config: LanceDBConfig, model: string): Promise<number[]> {
  const response = await fetch(`${config.ollamaUrl.replace(/\/$/, '')}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt: text }),
    signal: AbortSignal.timeout(3000),
  })

  if (!response.ok) {
    throw new Error(`Ollama embedding failed: ${response.status}`)
  }

  const payload = (await response.json()) as { embedding?: number[] }
  if (!Array.isArray(payload.embedding) || payload.embedding.length === 0) {
    throw new Error('Ollama embedding response missing embedding')
  }

  return payload.embedding
}

function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string')
  }
  if (typeof value !== 'string' || !value.trim()) {
    return []
  }
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function rowToEntry(row: Record<string, unknown>): MemoryEntry | null {
  const parsedType = memoryTypes.find((type) => type === row.type)
  if (!parsedType || typeof row.id !== 'string' || typeof row.content !== 'string') {
    return null
  }

  const parsed = MemoryEntrySchema.safeParse({
    id: row.id,
    content: row.content,
    type: parsedType,
    tags: parseJsonArray(row.tags_json ?? row.tags),
    source: typeof row.source === 'string' ? row.source : 'unknown',
    created_at: typeof row.created_at === 'string' ? row.created_at : nowIso(),
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : nowIso(),
    quality_score: Number(row.quality_score ?? 0.5),
    is_core: Boolean(row.is_core),
    merged_from: parseJsonArray(row.merged_from_json ?? row.merged_from),
    archived_at: typeof row.archived_at === 'string' && row.archived_at ? row.archived_at : undefined,
  })

  return parsed.success ? parsed.data : null
}

function rowToLog(row: Record<string, unknown>): EvolverLogEntry | null {
  const parsed = EvolverLogEntrySchema.safeParse({
    id: row.id,
    type: row.type,
    timestamp: row.timestamp,
    summary: row.summary,
    reason: row.reason,
    affected_ids: parseJsonArray(row.affected_ids_json ?? row.affected_ids),
    retained_id: typeof row.retained_id === 'string' && row.retained_id ? row.retained_id : undefined,
    score_before:
      Number(row.score_before) >= 0 ? Number(row.score_before) : undefined,
    score_after:
      Number(row.score_after) >= 0 ? Number(row.score_after) : undefined,
  })

  return parsed.success ? parsed.data : null
}

export class RealLanceDBAdapter implements LanceDBAdapter {
  private connected = false
  private config: LanceDBConfig | undefined
  private connection: Connection | undefined
  private tables = new Map<string, Table>()
  private entries = new Map<string, MemoryEntry>()
  private evolverLog: EvolverLogEntry[] = []
  private ollamaReachable = false
  private selectedEmbeddingModel: string | null = null
  private semanticSearchReady = false
  private dbPath = ''
  private legacyMemoryStatePath = ''
  private legacyEvolverLogPath = ''
  private mutationQueue = Promise.resolve()

  constructor(private readonly options: RealLanceDBAdapterOptions = {}) {}

  async connect(config: LanceDBConfig): Promise<void> {
    this.config = config
    this.connected = false
    this.semanticSearchReady = false
    this.tables.clear()

    try {
      this.dbPath = expandHome(config.dbPath)
      this.legacyMemoryStatePath = join(this.dbPath, 'memory-state.json')
      this.legacyEvolverLogPath = join(this.dbPath, 'evolver-log.json')

      await mkdir(this.dbPath, { recursive: true })
      this.connection = await withTimeout(lancedb.connect(this.dbPath), 5000, 'LanceDB connect')

      const probe = await probeEmbeddingModel(config.ollamaUrl, config.embeddingModel)
      this.ollamaReachable = probe.reachable
      this.selectedEmbeddingModel = probe.model
      this.semanticSearchReady = Boolean(probe.reachable && probe.model)

      if (!probe.reachable) {
        console.warn('[lancedb] Ollama unavailable; semantic recall disabled')
      } else if (!probe.model) {
        console.warn('[lancedb] embedding model unavailable; keyword recall active')
      } else {
        console.log('[lancedb] embedding model ready', { model: probe.model })
      }

      await this.refreshFromTables()
      await this.importLegacyOrSeedIfEmpty()
      this.connected = true

      const stats = await this.getStats()
      console.log('[lancedb] connected', { entries: stats.total, archived: stats.archived })
    } catch (error) {
      console.error('[lancedb] connect failed, mock fallback required:', { reason: errorMessage(error) })
      await this.disconnect()
    }
  }

  isConnected(): boolean {
    return this.connected
  }

  async disconnect(): Promise<void> {
    for (const table of this.tables.values()) {
      table.close()
    }
    this.tables.clear()
    this.connection?.close()
    this.connection = undefined
    this.semanticSearchReady = false
    this.connected = false
  }

  async status(): Promise<LanceDBStatus> {
    const stats = await this.getStats()
    return {
      connected: this.connected,
      ollamaReachable: this.ollamaReachable,
      embeddingModel: this.selectedEmbeddingModel,
      source: this.connected ? 'live-connected' : 'live-unavailable',
      semanticSearch: this.semanticSearchReady ? 'vector' : 'keyword-fallback',
      totalEntries: stats.total,
      byType: stats.byType,
    }
  }

  async create(entry: Omit<MemoryEntry, 'id' | 'created_at' | 'updated_at'>): Promise<MemoryEntry> {
    return this.runMutation(async () => {
      this.assertReady()
      const timestamp = nowIso()
      const next: MemoryEntry = {
        ...entry,
        id: randomUUID(),
        created_at: timestamp,
        updated_at: timestamp,
      }

      await this.writeEntryRow(next)
      this.entries.set(next.id, next)
      return next
    })
  }

  async get(id: string): Promise<MemoryEntry | null> {
    await this.refreshFromTables()
    return this.entries.get(id) ?? null
  }

  async update(id: string, patch: MemoryUpdatePatch): Promise<MemoryEntry> {
    return this.runMutation(async () => {
      this.assertReady()
      await this.refreshFromTables()
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

      if (current.type !== next.type) {
        await this.deleteEntryRow(current)
      } else {
        await this.deleteEntryRow(current)
      }

      await this.writeEntryRow(next)
      this.entries.delete(current.id)
      this.entries.set(next.id, next)
      return next
    })
  }

  async softDelete(id: string): Promise<void> {
    await this.runMutation(async () => {
      this.assertReady()
      await this.refreshFromTables()
      const current = this.entries.get(id)
      if (!current) {
        throw new Error('Memory entry not found')
      }

      const archivedAt = nowIso()
      const next = { ...current, archived_at: archivedAt, updated_at: archivedAt }
      await this.updateEntryColumns(next)
      this.entries.set(id, next)
      await this.writeEvolverLogInternal({
        type: 'archive',
        timestamp: archivedAt,
        summary: `Soft deleted memory ${id.slice(-8)}.`,
        reason: 'Manual soft delete from Memory detail panel.',
        affected_ids: [id],
      })
    })
  }

  async list(params: MemoryListParams): Promise<{ entries: MemoryEntry[]; total: number }> {
    await this.refreshFromTables()
    return listMemoryEntries(this.entries.values(), params)
  }

  async search(query: string, limit = 20): Promise<MemoryEntry[]> {
    if (!query.trim()) {
      return []
    }

    await this.refreshFromTables()

    if (!this.config || !this.selectedEmbeddingModel || !this.semanticSearchReady) {
      return keywordSearchEntries(this.entries.values(), query, limit)
    }

    try {
      const vector = await this.embed(this.embeddingText({ content: query, tags: [], source: '' }))
      const records = (
        await Promise.all(
          memoryTypes.map(async (type) => {
            const table = await this.openExistingTable(type)
            if (!table) {
              return []
            }
            return table.vectorSearch(vector).limit(limit).toArray()
          }),
        )
      )
        .flat()
        .sort(
          (left, right) =>
            Number(left._distance ?? Number.POSITIVE_INFINITY) -
            Number(right._distance ?? Number.POSITIVE_INFINITY),
        )

      const seen = new Set<string>()
      const matches: MemoryEntry[] = []
      for (const record of records) {
        const id = String((record as { id?: string }).id ?? '')
        if (!id || seen.has(id)) {
          continue
        }

        const entry = this.entries.get(id)
        if (!entry || entry.archived_at) {
          continue
        }

        seen.add(id)
        matches.push(entry)
        if (matches.length >= Math.max(1, limit)) {
          break
        }
      }

      return matches.length > 0 ? matches : keywordSearchEntries(this.entries.values(), query, limit)
    } catch (error) {
      this.semanticSearchReady = false
      console.warn('[lancedb] semantic search failed, using keyword fallback:', {
        reason: errorMessage(error),
      })
      return keywordSearchEntries(this.entries.values(), query, limit)
    }
  }

  async getEvolverLog(page: number, pageSize: number): Promise<{ entries: EvolverLogEntry[]; total: number }> {
    await this.refreshEvolverLogFromTable()
    const normalizedPage = Math.max(1, page)
    const normalizedPageSize = Math.min(200, Math.max(1, pageSize))
    const start = (normalizedPage - 1) * normalizedPageSize

    return {
      entries: this.evolverLog.slice(start, start + normalizedPageSize),
      total: this.evolverLog.length,
    }
  }

  async writeEvolverLog(entry: Omit<EvolverLogEntry, 'id'>): Promise<void> {
    await this.runMutation(async () => {
      this.assertReady()
      await this.writeEvolverLogInternal(entry)
    })
  }

  async bulkSoftDelete(ids: string[], reason: string): Promise<void> {
    await this.runMutation(async () => {
      this.assertReady()
      await this.refreshFromTables()
      const archivedAt = nowIso()
      const touchedIds: string[] = []

      for (const id of ids) {
        const current = this.entries.get(id)
        if (!current) {
          continue
        }

        const next = { ...current, archived_at: archivedAt, updated_at: archivedAt }
        await this.updateEntryColumns(next)
        this.entries.set(id, next)
        touchedIds.push(id)
      }

      if (touchedIds.length === 0) {
        return
      }

      await this.writeEvolverLogInternal({
        type: 'archive',
        timestamp: archivedAt,
        summary: `Bulk archived ${touchedIds.length} memory entries.`,
        reason: compactReason(reason),
        affected_ids: touchedIds,
      })
    })
  }

  async getStats(): Promise<MemoryStats> {
    if (this.connected) {
      await this.refreshFromTables()
    }
    return deriveMemoryStats(this.entries.values())
  }

  private assertReady(): void {
    if (!this.connected || !this.connection || !this.config) {
      throw new Error('Real LanceDB adapter is not connected')
    }
  }

  private async runMutation<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.mutationQueue.then(operation, operation)
    this.mutationQueue = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }

  private async tableNames() {
    if (!this.connection) {
      return []
    }
    return this.connection.tableNames()
  }

  private async openExistingTable(name: string): Promise<Table | null> {
    if (!this.connection) {
      return null
    }

    const cached = this.tables.get(name)
    if (cached?.isOpen()) {
      return cached
    }

    const names = await this.tableNames()
    if (!names.includes(name)) {
      return null
    }

    const table = await this.connection.openTable(name)
    this.tables.set(name, table)
    return table
  }

  private async writeEntryRow(entry: MemoryEntry): Promise<void> {
    const row = await this.entryToRow(entry)
    await this.addRows(entry.type, [row])
  }

  private async addRows(tableName: string, rows: Record<string, unknown>[]): Promise<void> {
    if (!this.connection || rows.length === 0) {
      return
    }

    const table = await this.openExistingTable(tableName)
    if (table) {
      await table.add(rows)
      return
    }

    const created = await this.connection.createTable(tableName, rows, { mode: 'create', existOk: true })
    this.tables.set(tableName, created)
  }

  private async deleteEntryRow(entry: MemoryEntry): Promise<void> {
    const table = await this.openExistingTable(entry.type)
    if (!table) {
      return
    }
    await table.delete(`id = ${sqlString(entry.id)}`)
  }

  private async updateEntryColumns(entry: MemoryEntry): Promise<void> {
    const table = await this.openExistingTable(entry.type)
    if (!table) {
      await this.writeEntryRow(entry)
      return
    }

    await table.update({
      where: `id = ${sqlString(entry.id)}`,
      values: {
        updated_at: entry.updated_at,
        archived_at: entry.archived_at ?? '',
      },
    })
  }

  private async refreshFromTables(): Promise<void> {
    const entries: MemoryEntry[] = []

    for (const type of memoryTypes) {
      const table = await this.openExistingTable(type)
      if (!table) {
        continue
      }

      const rows = (await table.query().toArray()) as Array<Record<string, unknown>>
      for (const row of rows) {
        const entry = rowToEntry(row)
        if (entry) {
          entries.push(entry)
        }
      }
    }

    this.entries = new Map(entries.map((entry) => [entry.id, entry]))
  }

  private async refreshEvolverLogFromTable(): Promise<void> {
    const table = await this.openExistingTable(EVOLVER_LOG_TABLE)
    if (!table) {
      this.evolverLog = []
      return
    }

    const rows = (await table.query().toArray()) as Array<Record<string, unknown>>
    this.evolverLog = rows
      .map((row) => rowToLog(row))
      .filter((entry): entry is EvolverLogEntry => Boolean(entry))
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
  }

  private async importLegacyOrSeedIfEmpty(): Promise<void> {
    if (this.entries.size > 0) {
      await this.refreshEvolverLogFromTable()
      return
    }

    const legacyEntries = MemoryEntryListSchema.parse(
      await readJsonFile(this.legacyMemoryStatePath, [] as MemoryEntry[]),
    )
    const legacyLogs = EvolverLogEntryListSchema.parse(
      await readJsonFile(this.legacyEvolverLogPath, [] as EvolverLogEntry[]),
    )

    if (legacyEntries.length > 0) {
      await this.replaceMemoryTables(legacyEntries)
      await this.replaceEvolverLog(legacyLogs)
      console.log('[lancedb] migrated legacy memory state into LanceDB tables', {
        entries: legacyEntries.length,
        logs: legacyLogs.length,
      })
      return
    }

    if (this.options.seedMockOnEmpty ?? process.env.LANCEDB_SEED_MOCK_ON_EMPTY === 'true') {
      const seedEntries = MemoryEntryListSchema.parse(await readMock('memory.json'))
      const seedLogs = EvolverLogEntryListSchema.parse(await readMock('evolver-log.json'))
      await this.replaceMemoryTables(seedEntries)
      await this.replaceEvolverLog(seedLogs)
      console.log('[lancedb] seeded empty LanceDB tables from mock dataset', {
        entries: seedEntries.length,
        logs: seedLogs.length,
      })
      return
    }

    await this.refreshEvolverLogFromTable()
  }

  private async replaceMemoryTables(entries: MemoryEntry[]): Promise<void> {
    if (!this.connection) {
      return
    }

    const names = await this.tableNames()
    for (const type of memoryTypes) {
      if (names.includes(type)) {
        await this.connection.dropTable(type)
        this.tables.delete(type)
      }

      const rows = await Promise.all(entries.filter((entry) => entry.type === type).map((entry) => this.entryToRow(entry)))
      if (rows.length > 0) {
        await this.addRows(type, rows)
      }
    }

    this.entries = new Map(entries.map((entry) => [entry.id, entry]))
  }

  private async replaceEvolverLog(logs: EvolverLogEntry[]): Promise<void> {
    if (!this.connection) {
      return
    }

    const names = await this.tableNames()
    if (names.includes(EVOLVER_LOG_TABLE)) {
      await this.connection.dropTable(EVOLVER_LOG_TABLE)
      this.tables.delete(EVOLVER_LOG_TABLE)
    }

    const rows = logs.map((entry) => this.logToRow(entry))
    if (rows.length > 0) {
      await this.addRows(EVOLVER_LOG_TABLE, rows)
    }
    this.evolverLog = logs.sort((left, right) => right.timestamp.localeCompare(left.timestamp))
  }

  private async writeEvolverLogInternal(entry: Omit<EvolverLogEntry, 'id'>): Promise<void> {
    const next = EvolverLogEntrySchema.parse({
      ...entry,
      id: randomUUID(),
      reason: compactReason(entry.reason),
    })
    await this.addRows(EVOLVER_LOG_TABLE, [this.logToRow(next)])
    this.evolverLog = [next, ...this.evolverLog].sort((left, right) =>
      right.timestamp.localeCompare(left.timestamp),
    )
  }

  private async entryToRow(entry: MemoryEntry): Promise<MemoryRow> {
    return {
      id: entry.id,
      content: entry.content,
      type: entry.type,
      tags_json: JSON.stringify(entry.tags),
      source: entry.source,
      created_at: entry.created_at,
      updated_at: entry.updated_at,
      quality_score: entry.quality_score,
      is_core: entry.is_core,
      merged_from_json: JSON.stringify(entry.merged_from ?? []),
      archived_at: entry.archived_at ?? '',
      vector: await this.embed(this.embeddingText(entry)),
    }
  }

  private logToRow(entry: EvolverLogEntry): EvolverLogRow {
    return {
      id: entry.id,
      type: entry.type,
      timestamp: entry.timestamp,
      summary: entry.summary,
      reason: compactReason(entry.reason),
      affected_ids_json: JSON.stringify(entry.affected_ids),
      retained_id: entry.retained_id ?? '',
      score_before: entry.score_before ?? -1,
      score_after: entry.score_after ?? -1,
      vector: fallbackVector(),
    }
  }

  private async embed(text: string): Promise<number[]> {
    if (!this.config || !this.selectedEmbeddingModel) {
      this.semanticSearchReady = false
      return fallbackVector()
    }

    try {
      const vector = await (this.options.embedText ?? ollamaEmbed)(text, this.config, this.selectedEmbeddingModel)
      this.semanticSearchReady = true
      return vector
    } catch (error) {
      this.semanticSearchReady = false
      this.ollamaReachable = false
      console.warn('[lancedb] embedding unavailable; storing keyword-only row', {
        reason: errorMessage(error),
      })
      return fallbackVector()
    }
  }

  private embeddingText(entry: Pick<MemoryEntry, 'content' | 'tags' | 'source'>): string {
    return `${entry.content}\n${entry.tags.join(' ')}\n${entry.source}`
  }
}
