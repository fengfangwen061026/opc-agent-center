import type { Hono } from 'hono'
import { z } from 'zod'
import type { AppContext } from '../server'
import { envelope } from '../server'

const RejectPatchSchema = z.object({
  reason: z.string().optional(),
})

export function registerEvolverRoutes(app: Hono, context: AppContext) {
  app.get('/api/evolver/status', async (c) => {
    const status = await context.evolverAdapter.getStatus()
    return c.json(envelope(status, context.mode))
  })

  app.get('/api/evolver/patches', async (c) => {
    const patches = await context.evolverAdapter.getPendingPatches()
    return c.json(envelope(patches, context.mode))
  })

  app.post('/api/evolver/patches/:skillName/:patchId/approve', async (c) => {
    await context.evolverAdapter.approvePatch(c.req.param('skillName'), c.req.param('patchId'))
    await context.adapter.approveSkillPatch(c.req.param('skillName'))
    return c.json(envelope({ ok: true }, context.mode))
  })

  app.post('/api/evolver/patches/:skillName/:patchId/reject', async (c) => {
    const body = RejectPatchSchema.parse(await c.req.json().catch(() => ({})))
    await context.evolverAdapter.rejectPatch(c.req.param('skillName'), c.req.param('patchId'), body.reason)
    await context.adapter.rejectSkillPatch(c.req.param('skillName'))
    return c.json(envelope({ ok: true }, context.mode))
  })

  app.post('/api/evolver/eval/:skillName', async (c) => {
    const result = await context.evolverAdapter.triggerEval(c.req.param('skillName'))
    return c.json(envelope(result, context.mode))
  })
}
