import { z } from 'zod'
import { ConnectionStatusSchema } from './agent'

export const SystemHealthSchema = z.object({
  gateway: ConnectionStatusSchema,
  lancedb: ConnectionStatusSchema,
  ollama: ConnectionStatusSchema,
  obsidian: ConnectionStatusSchema,
  evolver: z.object({
    status: z.enum(['idle', 'running', 'error']),
    lastRun: z.string().datetime().optional(),
    nextRun: z.string().datetime().optional(),
    pendingPatches: z.number(),
  }),
  memory: z.object({
    totalEntries: z.number(),
    episodic: z.number(),
    semantic: z.number(),
    procedural: z.number(),
    lastMaintenance: z.string().datetime().optional(),
  }),
})

export type SystemHealth = z.infer<typeof SystemHealthSchema>
