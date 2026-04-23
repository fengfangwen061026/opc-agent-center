import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import * as lancedb from '@lancedb/lancedb'
import type { MemoryEntry, MemoryType } from '@opc/core'
import type { Connection, Table } from '@lancedb/lancedb'
import type { LanceDBConfig, LanceDBStatus } from './LanceDBAdapter'
import { MockLanceDBAdapter } from './MockLanceDBAdapter'

const memoryTypes: MemoryType[] = ['episodic', 'semantic', 'procedural']

function expandHome(path: string) {
  return path.replace(/^~/, homedir())
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout`)), ms)
  })

  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function resolveEmbeddingModel(ollamaUrl: string, preferred: string): Promise<string | null> {
  try {
    const response = await fetch(`${ollamaUrl.replace(/\/$/, '')}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    })
    if (!response.ok) return null
    const payload = (await response.json()) as { models?: Array<{ name?: string }> }
    const names = payload.models?.map((model) => model.name).filter((name): name is string => Boolean(name)) ?? []

    return (
      names.find((name) => name === preferred || name.startsWith(`${preferred}:`)) ??
      names.find((name) => name.startsWith('nomic-embed-text')) ??
      names.find((name) => name.includes('embed')) ??
      names[0] ??
      null
    )
  } catch {
    return null
  }
}

async function embed(text: string, config: LanceDBConfig, model: string): Promise<number[]> {
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
  if (!Array.isArray(payload.embedding)) {
    throw new Error('Ollama embedding response missing embedding')
  }
  return payload.embedding
}

function toRecord(entry: MemoryEntry, vector: number[]) {
  return {
    vector,
    id: entry.id,
    content: entry.content,
    type: entry.type,
    tags: entry.tags.join(','),
    source: entry.source,
    created_at: entry.created_at,
    updated_at: entry.updated_at,
    quality_score: entry.quality_score,
    is_core: entry.is_core,
    archived_at: entry.archived_at ?? '',
  }
}

function fromRecord(record: Record<string, unknown>): MemoryEntry {
  return {
    id: String(record.id),
    content: String(record.content),
    type: String(record.type) as MemoryType,
    tags: String(record.tags ?? '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
    source: String(record.source),
    created_at: String(record.created_at),
    updated_at: String(record.updated_at),
    quality_score: Number(record.quality_score),
    is_core: Boolean(record.is_core),
    archived_at: record.archived_at ? String(record.archived_at) : undefined,
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = []
  let cursor = 0

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor
        cursor += 1
        results[index] = await mapper(items[index])
      }
    }),
  )

  return results
}

export class RealLanceDBAdapter extends MockLanceDBAdapter {
  private realConfig: LanceDBConfig | undefined
  private connection: Connection | undefined
  private tables = new Map<MemoryType, Table>()
  private selectedEmbeddingModel: string | null = null
  private realReady = false

  override async connect(config: LanceDBConfig): Promise<void> {
    this.realConfig = config
    this.realReady = false

    // Hydrate the in-memory adapter first so CRUD and fallback search remain available.
    await super.connect(config)

    try {
      const dbPath = expandHome(config.dbPath)
      this.selectedEmbeddingModel = await resolveEmbeddingModel(config.ollamaUrl, config.embeddingModel)

      if (!this.selectedEmbeddingModel) {
        console.warn('[lancedb] Ollama not reachable, semantic search disabled')
      } else {
        console.log(`[lancedb] embedding model: ${this.selectedEmbeddingModel}`)
      }

      await mkdir(dbPath, { recursive: true })
      this.connection = await withTimeout(lancedb.connect(dbPath), 5000, 'LanceDB connect')
      await this.initTables()

      this.realReady = true
      console.log(`[lancedb] connected, ${await this.countEntries()} entries`)
    } catch (error) {
      console.error('[lancedb] connect failed, using mock fallback:', { reason: errorMessage(error) })
      this.realReady = false
      this.connected = false
      this.tables.clear()
      this.connection?.close()
      this.connection = undefined
    }
  }

  override isConnected(): boolean {
    return this.realReady
  }

  override async status(): Promise<LanceDBStatus> {
    const stats = await this.getStats()
    return {
      connected: this.realReady,
      ollamaReachable: Boolean(this.selectedEmbeddingModel),
      embeddingModel: this.selectedEmbeddingModel,
      totalEntries: stats.total,
      byType: stats.byType,
    }
  }

  override async disconnect(): Promise<void> {
    for (const table of this.tables.values()) {
      table.close()
    }
    this.tables.clear()
    this.connection?.close()
    this.connection = undefined
    this.realReady = false
    await super.disconnect()
  }

  override async search(query: string, limit = 20): Promise<MemoryEntry[]> {
    if (!this.realReady || !this.realConfig || !this.selectedEmbeddingModel || this.tables.size === 0) {
      return super.search(query, limit)
    }

    try {
      const vector = await embed(query, this.realConfig, this.selectedEmbeddingModel)
      const results = (
        await Promise.all(
          Array.from(this.tables.values()).map((table) => table.vectorSearch(vector).limit(limit).toArray()),
        )
      )
        .flat()
        .sort((left, right) => Number(left._distance ?? 0) - Number(right._distance ?? 0))
        .slice(0, limit)
        .map((record) => fromRecord(record as Record<string, unknown>))

      return results
    } catch (error) {
      console.warn('[lancedb] semantic search failed, using keyword fallback:', { reason: errorMessage(error) })
      return super.search(query, limit)
    }
  }

  private async initTables(): Promise<void> {
    if (!this.connection) {
      throw new Error('LanceDB connection is not initialized')
    }

    const existing = new Set(await withTimeout(this.connection.tableNames(), 5000, 'LanceDB tableNames'))

    for (const type of memoryTypes) {
      if (existing.has(type)) {
        const table = await withTimeout(this.connection.openTable(type), 5000, `LanceDB openTable ${type}`)
        if ((await table.countRows()) > 0) {
          this.tables.set(type, table)
          continue
        }
        table.close()
      }

      if (!this.selectedEmbeddingModel || !this.realConfig) {
        console.warn(`[lancedb] skipped ${type} table seed because embedding model is unavailable`)
        continue
      }

      const rows = await this.seedRows(type)
      if (rows.length > 0) {
        const table = await withTimeout(
          this.connection.createTable(type, rows, { mode: 'overwrite' }),
          5000,
          `LanceDB createTable ${type}`,
        )
        this.tables.set(type, table)
      }
    }
  }

  private async seedRows(type: MemoryType): Promise<Array<ReturnType<typeof toRecord>>> {
    if (!this.realConfig || !this.selectedEmbeddingModel) {
      return []
    }

    const all = await super.list({ page: 1, pageSize: 500, includeArchived: true })
    const entries = all.entries.filter((entry) => entry.type === type)
    console.log(`[lancedb] seeding ${type} table with ${entries.length} entries`)

    return mapWithConcurrency(entries, 4, async (entry) =>
      toRecord(entry, await embed(`${entry.content}\n${entry.tags.join(' ')}`, this.realConfig!, this.selectedEmbeddingModel!)),
    )
  }

  private async countEntries(): Promise<number> {
    if (this.tables.size === 0) {
      const stats = await this.getStats()
      return stats.total
    }

    const counts = await Promise.all(Array.from(this.tables.values()).map((table) => table.countRows()))
    return counts.reduce((sum, count) => sum + count, 0)
  }
}
