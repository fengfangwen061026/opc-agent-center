import type { Hono } from 'hono'
import { SendMessageInputSchema } from '@opc/core'
import type { AppContext } from '../server'
import { envelope } from '../server'

export function registerConversationRoutes(app: Hono, context: AppContext) {
  app.get('/api/conversations', async (c) => {
    const conversations = await context.adapter.listConversations()
    return c.json(envelope(conversations, context.mode))
  })

  app.post('/api/chat/send', async (c) => {
    const body = SendMessageInputSchema.parse(await c.req.json())
    await context.adapter.sendMessage(body)
    return c.json(envelope({ ok: true }, context.mode))
  })
}
