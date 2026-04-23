import type { Hono } from 'hono'
import type { AppContext } from '../server'
import { envelope } from '../server'

export function registerAgentRoutes(app: Hono, context: AppContext) {
  app.get('/api/agents', async (c) => {
    const agents = await context.adapter.listAgents()
    return c.json(envelope(agents, context.mode))
  })
}
