import type { Hono } from 'hono'
import type { AppContext } from '../server'
import { envelope } from '../server'
import { buildSystemHealth } from '../systemHealth'

export function registerHealthRoutes(app: Hono, context: AppContext) {
  app.get('/api/health', async (c) => {
    const health = await buildSystemHealth(context)
    return c.json(envelope(health, context.mode))
  })
}
