import type { Hono } from 'hono'
import type { AppContext } from '../server'
import { envelope } from '../server'

export function registerHealthRoutes(app: Hono, context: AppContext) {
  app.get('/api/health', async (c) => {
    const health = await context.adapter.getStatus()
    return c.json(envelope(health, context.mode))
  })
}
