import { z } from 'zod'
import { SkillPatchSchema } from './skill'

export const EvolverLogEntrySchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['merge', 'prune', 'archive', 'skill_patch', 'eval']),
  timestamp: z.string().datetime(),
  summary: z.string(),
  reason: z.string(),
  affected_ids: z.array(z.string()),
  retained_id: z.string().optional(),
  score_before: z.number().optional(),
  score_after: z.number().optional(),
})

export const EvolverStatusSchema = z.object({
  status: z.enum(['idle', 'running', 'error', 'disabled']),
  lastRun: z.string().datetime().optional(),
  nextRun: z.string().datetime().optional(),
  pendingPatches: z.number().nonnegative(),
  weeklyAutoPatches: z.number().nonnegative(),
  currentOperation: z.string().optional(),
  lastError: z.string().optional(),
  autoPatchCountThisWeek: z.number().nonnegative(),
  evalsThisWeek: z.number().nonnegative(),
  memoryMaintenanceCount: z.number().nonnegative(),
})

export const EvolverLogEntryListSchema = z.array(EvolverLogEntrySchema)

export const EvolverEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('evolver.started'), triggeredBy: z.string() }),
  z.object({ type: z.literal('evolver.completed'), duration: z.number(), summary: z.string() }),
  z.object({ type: z.literal('evolver.error'), message: z.string() }),
  z.object({ type: z.literal('skill.patch.submitted'), skillName: z.string(), patch: SkillPatchSchema }),
  z.object({ type: z.literal('skill.patch.auto_applied'), skillName: z.string(), summary: z.string() }),
  z.object({ type: z.literal('memory.maintenance.started') }),
  z.object({
    type: z.literal('memory.maintenance.completed'),
    merged: z.number(),
    pruned: z.number(),
    archived: z.number(),
  }),
])

export type EvolverLogEntry = z.infer<typeof EvolverLogEntrySchema>
export type EvolverStatus = z.infer<typeof EvolverStatusSchema>
export type EvolverEvent = z.infer<typeof EvolverEventSchema>
