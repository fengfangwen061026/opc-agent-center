import type { Hono } from 'hono'
import { z } from 'zod'
import { EvolverLogEntrySchema, MemoryTypeSchema } from '@opc/core'
import type { AppContext } from '../server'
import { envelope } from '../server'

const MemoryPatchSchema = z.object({
  content: z.string().optional(),
  type: MemoryTypeSchema.optional(),
  tags: z.array(z.string()).optional(),
  is_core: z.boolean().optional(),
  quality_score: z.number().min(0).max(1).optional(),
  archived_at: z.string().datetime().nullable().optional(),
})

const BulkDeleteSchema = z.object({
  ids: z.array(z.string()).min(1),
  reason: z.string().min(1),
})

function parsePositive(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

export function registerMemoryRoutes(app: Hono, context: AppContext) {
  app.get('/api/memory/search', async (c) => {
    const query = c.req.query('q') ?? ''
    const limit = parsePositive(c.req.query('limit'), 20)
    const entries = await context.memoryAdapter.search(query, limit)
    return c.json(envelope(entries, context.mode))
  })

  app.get('/api/memory/stats', async (c) => {
    const stats = await context.memoryAdapter.getStats()
    return c.json(envelope(stats, context.mode))
  })

  app.get('/api/memory/evolver-log', async (c) => {
    const page = parsePositive(c.req.query('page'), 1)
    const pageSize = parsePositive(c.req.query('pageSize'), 25)
    const result = await context.memoryAdapter.getEvolverLog(page, pageSize)
    return c.json(envelope(result, context.mode))
  })

  app.post('/api/memory/evolver-log', async (c) => {
    const body = EvolverLogEntrySchema.parse(await c.req.json())
    await context.memoryAdapter.writeEvolverLog({
      type: body.type,
      timestamp: body.timestamp,
      summary: body.summary,
      reason: body.reason,
      affected_ids: body.affected_ids,
      retained_id: body.retained_id,
      score_before: body.score_before,
      score_after: body.score_after,
    })
    return c.json(envelope({ ok: true }, context.mode))
  })

  app.post('/api/memory/bulk-delete', async (c) => {
    const body = BulkDeleteSchema.parse(await c.req.json())
    await context.memoryAdapter.bulkSoftDelete(body.ids, body.reason)
    return c.json(envelope({ ok: true }, context.mode))
  })

  app.get('/api/memory/:id', async (c) => {
    const entry = await context.memoryAdapter.get(c.req.param('id'))
    if (!entry) {
      return c.json(envelope({ error: 'Memory entry not found' }, context.mode), 404)
    }
    return c.json(envelope(entry, context.mode))
  })

  app.patch('/api/memory/:id', async (c) => {
    const body = MemoryPatchSchema.parse(await c.req.json())
    const entry = await context.memoryAdapter.update(c.req.param('id'), body)
    return c.json(envelope(entry, context.mode))
  })

  app.delete('/api/memory/:id', async (c) => {
    await context.memoryAdapter.softDelete(c.req.param('id'))
    return c.json(envelope({ ok: true }, context.mode))
  })

  app.get('/api/memory', async (c) => {
    const type = MemoryTypeSchema.safeParse(c.req.query('type'))
    const tags = c.req.query('tags')?.split(',').filter(Boolean) ?? []
    const page = parsePositive(c.req.query('page'), 1)
    const pageSize = parsePositive(c.req.query('pageSize'), 50)
    const includeArchived = c.req.query('includeArchived') === 'true'
    const result = await context.memoryAdapter.list({
      type: type.success ? type.data : undefined,
      tags,
      page,
      pageSize,
      includeArchived,
    })
    return c.json(envelope(result, context.mode))
  })
}
