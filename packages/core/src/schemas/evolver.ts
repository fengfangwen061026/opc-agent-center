import { z } from 'zod'

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
  status: z.enum(['idle', 'running', 'error']),
  lastRun: z.string().datetime().optional(),
  nextRun: z.string().datetime().optional(),
  pendingPatches: z.number().nonnegative(),
  currentOperation: z.string().optional(),
  lastError: z.string().optional(),
  autoPatchCountThisWeek: z.number().nonnegative(),
  evalsThisWeek: z.number().nonnegative(),
  memoryMaintenanceCount: z.number().nonnegative(),
})

export const EvolverLogEntryListSchema = z.array(EvolverLogEntrySchema)

export type EvolverLogEntry = z.infer<typeof EvolverLogEntrySchema>
export type EvolverStatus = z.infer<typeof EvolverStatusSchema>
