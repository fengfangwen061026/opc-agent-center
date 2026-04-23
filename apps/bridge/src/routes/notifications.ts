import type { Hono } from 'hono'
import { NotificationActionInputSchema, NotificationFilterSchema } from '@opc/core'
import type { AppContext } from '../server'
import { envelope } from '../server'

export function registerNotificationRoutes(app: Hono, context: AppContext) {
  app.get('/api/notifications', async (c) => {
    const parsed = NotificationFilterSchema.safeParse({
      status: c.req.query('status'),
      type: c.req.query('type'),
    })
    const notifications = await context.adapter.listNotifications(parsed.success ? parsed.data : undefined)
    return c.json(envelope(notifications, context.mode))
  })

  app.post('/api/notifications/:id/action', async (c) => {
    const body = NotificationActionInputSchema.parse(await c.req.json())
    await context.adapter.actionNotification(c.req.param('id'), body.action)
    return c.json(envelope({ ok: true }, context.mode))
  })
}
