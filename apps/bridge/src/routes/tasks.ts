import type { Hono } from 'hono'
import type { AppContext } from '../server'
import { envelope } from '../server'

export function registerTaskRoutes(app: Hono, context: AppContext) {
  app.get('/api/tasks', async (c) => {
    const limitParam = c.req.query('limit')
    const limit = limitParam ? Number(limitParam) : undefined
    const tasks = await context.adapter.listTasks(Number.isFinite(limit) ? limit : undefined)
    return c.json(envelope(tasks, context.mode))
  })

  app.get('/api/tasks/:id', async (c) => {
    const tasks = await context.adapter.listTasks()
    const task = tasks.find((item) => item.id === c.req.param('id'))

    if (!task) {
      return c.json(envelope({ error: 'Task not found' }, context.mode), 404)
    }

    return c.json(envelope(task, context.mode))
  })
}
