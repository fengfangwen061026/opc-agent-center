import type { Hono } from 'hono'
import { z } from 'zod'
import { ReviewQueueEntrySchema } from '@opc/core'
import type { AppContext } from '../server'
import { envelope } from '../server'

const WriteNoteSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
  options: z
    .object({
      createParents: z.boolean().optional(),
      overwrite: z.boolean().optional(),
    })
    .optional(),
})

const AppendNoteSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
})

const DeleteNoteSchema = z.object({
  path: z.string().min(1),
})

function parseLimit(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(100, Math.floor(parsed)) : fallback
}

export function registerObsidianRoutes(app: Hono, context: AppContext) {
  app.get('/api/obsidian/status', async (c) => {
    const status = await context.obsidianAdapter.status()
    return c.json(envelope(status, context.mode))
  })

  app.get('/api/obsidian/tree', async (c) => {
    const tree = await context.obsidianAdapter.getTree(c.req.query('path'))
    return c.json(envelope(tree, context.mode))
  })

  app.get('/api/obsidian/note', async (c) => {
    const path = c.req.query('path')
    if (!path) {
      return c.json(envelope({ error: 'path is required' }, context.mode), 400)
    }
    const note = await context.obsidianAdapter.getNote(path)
    if (!note) {
      return c.json(envelope({ error: 'Note not found' }, context.mode), 404)
    }
    return c.json(envelope(note, context.mode))
  })

  app.post('/api/obsidian/note', async (c) => {
    const body = WriteNoteSchema.parse(await c.req.json())
    await context.obsidianAdapter.writeNote(body.path, body.content, body.options)
    return c.json(envelope({ ok: true }, context.mode))
  })

  app.post('/api/obsidian/note/append', async (c) => {
    const body = AppendNoteSchema.parse(await c.req.json())
    await context.obsidianAdapter.appendNote(body.path, body.content)
    return c.json(envelope({ ok: true }, context.mode))
  })

  app.delete('/api/obsidian/note', async (c) => {
    const body = DeleteNoteSchema.parse(await c.req.json())
    await context.obsidianAdapter.deleteNote(body.path)
    return c.json(envelope({ ok: true }, context.mode))
  })

  app.get('/api/obsidian/search', async (c) => {
    const results = await context.obsidianAdapter.search(c.req.query('q') ?? '', parseLimit(c.req.query('limit'), 20))
    return c.json(envelope(results, context.mode))
  })

  app.get('/api/obsidian/review-queue', async (c) => {
    const notes = await context.obsidianAdapter.getReviewQueue()
    return c.json(envelope(notes, context.mode))
  })

  app.post('/api/obsidian/review-queue', async (c) => {
    const body = ReviewQueueEntrySchema.parse(await c.req.json())
    await context.obsidianAdapter.addToReviewQueue(body)
    return c.json(envelope({ ok: true }, context.mode))
  })
}
