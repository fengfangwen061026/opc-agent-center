import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MockLanceDBAdapter } from '../adapters/MockLanceDBAdapter'
import { RealLanceDBAdapter } from '../adapters/RealLanceDBAdapter'

describe('RealLanceDBAdapter', () => {
  const tempDirs: string[] = []

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      }),
    )
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  async function createAdapter() {
    const dir = await mkdtemp(join(tmpdir(), 'opc-lancedb-real-'))
    tempDirs.push(dir)

    const adapter = new RealLanceDBAdapter()
    await adapter.connect({
      dbPath: dir,
      ollamaUrl: 'http://127.0.0.1:11434',
      embeddingModel: 'nomic-embed-text',
      autoCapture: true,
      autoRecall: true,
    })

    expect(adapter.isConnected()).toBe(true)
    return { adapter, dir }
  }

  it('keeps mock mode memory operations working', async () => {
    const adapter = new MockLanceDBAdapter()
    await adapter.connect({
      dbPath: '/tmp/not-used',
      ollamaUrl: 'http://127.0.0.1:11434',
      embeddingModel: 'nomic-embed-text',
      autoCapture: true,
      autoRecall: true,
    })

    const status = await adapter.status()
    expect(status.source).toBe('mock')
    expect(status.semanticSearch).toBe('keyword-fallback')

    const created = await adapter.create({
      content: 'mock mode lifecycle entry',
      type: 'semantic',
      tags: ['mock-mode'],
      source: 'test',
      quality_score: 0.5,
      is_core: false,
    })
    expect(await adapter.get(created.id)).toMatchObject({ id: created.id })
    expect((await adapter.search('mock mode', 5)).map((entry) => entry.id)).toContain(created.id)

    await adapter.disconnect()
  })

  it('connects real mode when Ollama is unavailable and exposes keyword fallback status', async () => {
    const { adapter } = await createAdapter()
    const status = await adapter.status()

    expect(status.source).toBe('live-connected')
    expect(status.ollamaReachable).toBe(false)
    expect(status.semanticSearch).toBe('keyword-fallback')
  })

  it('persists create/update/delete/restore across adapter restarts', async () => {
    const { adapter, dir } = await createAdapter()

    const created = await adapter.create({
      content: '初始偏好：更喜欢简洁、直接的工程解释',
      type: 'semantic',
      tags: ['preference', 'style'],
      source: 'conversation:test',
      quality_score: 0.82,
      is_core: true,
    })

    expect(await adapter.get(created.id)).toMatchObject({
      id: created.id,
      content: created.content,
      is_core: true,
    })

    const updated = await adapter.update(created.id, {
      content: '更新后的偏好：解释要简洁，并明确列出风险边界',
      tags: ['preference', 'style', 'risk'],
      quality_score: 0.91,
    })

    expect(updated.content).toContain('风险边界')
    expect(updated.tags).toContain('risk')
    expect((await adapter.search('风险边界', 5)).map((entry) => entry.id)).toContain(created.id)

    const activeList = await adapter.list({
      page: 1,
      pageSize: 20,
      includeArchived: false,
    })
    expect(activeList.total).toBe(1)
    expect(activeList.entries[0]?.id).toBe(created.id)

    await adapter.softDelete(created.id)

    const archivedHidden = await adapter.list({
      page: 1,
      pageSize: 20,
      includeArchived: false,
    })
    expect(archivedHidden.total).toBe(0)

    const archivedVisible = await adapter.list({
      page: 1,
      pageSize: 20,
      includeArchived: true,
    })
    expect(archivedVisible.entries[0]?.archived_at).toBeTruthy()

    const restored = await adapter.update(created.id, { archived_at: null })
    expect(restored.archived_at).toBeUndefined()

    await adapter.disconnect()

    const second = new RealLanceDBAdapter()
    await second.connect({
      dbPath: dir,
      ollamaUrl: 'http://127.0.0.1:11434',
      embeddingModel: 'nomic-embed-text',
      autoCapture: true,
      autoRecall: true,
    })

    expect(second.isConnected()).toBe(true)
    expect(await second.get(created.id)).toMatchObject({
      id: created.id,
      content: '更新后的偏好：解释要简洁，并明确列出风险边界',
      tags: ['preference', 'style', 'risk'],
    })

    await second.disconnect()
  })

  it('migrates an entry between LanceDB type tables when type changes', async () => {
    const { adapter, dir } = await createAdapter()

    const created = await adapter.create({
      content: '跨表迁移验证：semantic memory becomes episodic',
      type: 'semantic',
      tags: ['migration'],
      source: 'test:type-migration',
      quality_score: 0.64,
      is_core: false,
    })

    const migrated = await adapter.update(created.id, { type: 'episodic', tags: ['migration', 'episodic'] })
    expect(migrated.type).toBe('episodic')

    const semanticList = await adapter.list({ type: 'semantic', page: 1, pageSize: 20 })
    const episodicList = await adapter.list({ type: 'episodic', page: 1, pageSize: 20 })
    expect(semanticList.entries.map((entry) => entry.id)).not.toContain(created.id)
    expect(episodicList.entries.map((entry) => entry.id)).toContain(created.id)

    await adapter.disconnect()

    const second = new RealLanceDBAdapter()
    await second.connect({
      dbPath: dir,
      ollamaUrl: 'http://127.0.0.1:11434',
      embeddingModel: 'nomic-embed-text',
      autoCapture: true,
      autoRecall: true,
    })

    expect(await second.get(created.id)).toMatchObject({ id: created.id, type: 'episodic' })
    await second.disconnect()
  })

  it('keeps CRUD real, falls back to keyword search, and persists stats/logs', async () => {
    const { adapter, dir } = await createAdapter()

    const semantic = await adapter.create({
      content: '编程偏好：优先选择严格类型和可维护的模块边界',
      type: 'semantic',
      tags: ['编程', '偏好'],
      source: 'conversation:memory-test',
      quality_score: 0.88,
      is_core: true,
    })
    const episodic = await adapter.create({
      content: '2026-04-24：用户要求把 real memory path 从 mock 提升到可持久化',
      type: 'episodic',
      tags: ['memory', 'hardening'],
      source: 'task:truthfulness-hardening',
      quality_score: 0.72,
      is_core: false,
    })
    const procedural = await adapter.create({
      content: '执行偏好：修改桥接层后必须补最小关键测试',
      type: 'procedural',
      tags: ['testing', 'workflow'],
      source: 'conversation:memory-test',
      quality_score: 0.67,
      is_core: false,
    })

    await adapter.bulkSoftDelete([procedural.id], 'archive test entry')
    await adapter.writeEvolverLog({
      type: 'eval',
      timestamp: '2026-04-24T10:00:00.000Z',
      summary: 'Eval completed for memory hardening flow.',
      reason: 'Regression check after real adapter rewrite.',
      affected_ids: [semantic.id, episodic.id],
      score_before: 0.71,
      score_after: 0.89,
    })

    const searchResults = await adapter.search('编程偏好', 5)
    expect(searchResults.map((entry) => entry.id)).toContain(semantic.id)

    const stats = await adapter.getStats()
    expect(stats).toMatchObject({
      total: 2,
      archived: 1,
      core: 1,
      byType: {
        episodic: 1,
        semantic: 1,
        procedural: 0,
      },
    })

    const pageOne = await adapter.getEvolverLog(1, 2)
    expect(pageOne.total).toBe(2)
    expect(pageOne.entries).toHaveLength(2)
    expect(pageOne.entries.map((entry) => entry.type)).toEqual(
      expect.arrayContaining(['archive', 'eval']),
    )

    await adapter.disconnect()

    const second = new RealLanceDBAdapter()
    await second.connect({
      dbPath: dir,
      ollamaUrl: 'http://127.0.0.1:11434',
      embeddingModel: 'nomic-embed-text',
      autoCapture: true,
      autoRecall: true,
    })

    expect(await second.search('编程偏好', 5)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: semantic.id })]),
    )
    expect(await second.getStats()).toMatchObject({
      total: 2,
      archived: 1,
      core: 1,
    })
    expect((await second.getEvolverLog(1, 10)).total).toBe(2)

    await second.disconnect()
  })
})
