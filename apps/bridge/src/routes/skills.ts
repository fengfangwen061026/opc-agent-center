import type { Hono } from 'hono'
import { SkillUpdateInputSchema } from '@opc/core'
import type { AppContext } from '../server'
import { envelope } from '../server'

export function registerSkillRoutes(app: Hono, context: AppContext) {
  app.get('/api/skills', async (c) => {
    const skills = await context.adapter.listSkills()
    return c.json(envelope(skills, context.mode))
  })

  app.get('/api/skills/:name', async (c) => {
    const skill = await context.adapter.getSkill(c.req.param('name'))

    if (!skill) {
      return c.json(envelope({ error: 'Skill not found' }, context.mode), 404)
    }

    return c.json(envelope(skill, context.mode))
  })

  app.patch('/api/skills/:name', async (c) => {
    const body = SkillUpdateInputSchema.parse(await c.req.json())
    const skill = await context.adapter.updateSkill(c.req.param('name'), body)
    return c.json(envelope(skill, context.mode))
  })

  app.post('/api/skills/:name/eval', async (c) => {
    const result = await context.adapter.evalSkill(c.req.param('name'))
    return c.json(envelope(result, context.mode))
  })

  app.post('/api/skills/:name/approve-patch', async (c) => {
    await context.adapter.approveSkillPatch(c.req.param('name'))
    return c.json(envelope({ ok: true }, context.mode))
  })

  app.post('/api/skills/:name/reject-patch', async (c) => {
    await context.adapter.rejectSkillPatch(c.req.param('name'))
    return c.json(envelope({ ok: true }, context.mode))
  })

  app.post('/api/skills/:name/rollback', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { patchId?: string }
    await context.adapter.rollbackSkill(c.req.param('name'), body.patchId)
    return c.json(envelope({ ok: true }, context.mode))
  })
}
