import { z } from 'zod'

export const EventLevelSchema = z.enum(['debug', 'info', 'warn', 'error'])

export const SystemEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  message: z.string(),
  level: EventLevelSchema,
  source: z.string(),
  timestamp: z.string().datetime(),
  agentId: z.string().optional(),
  taskId: z.string().optional(),
  skillId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
})

export const SystemEventListSchema = z.array(SystemEventSchema)

export type EventLevel = z.infer<typeof EventLevelSchema>
export type SystemEvent = z.infer<typeof SystemEventSchema>
