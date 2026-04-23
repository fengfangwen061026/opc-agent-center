import { z } from 'zod'
import { ConnectionStatusSchema } from './agent'

export const SystemHealthSchema = z.object({
  gateway: ConnectionStatusSchema,
  lancedb: z.object({
    connected: z.boolean(),
    ollamaReachable: z.boolean(),
    embeddingModel: z.string().nullable(),
    totalEntries: z.number(),
  }),
  ollama: ConnectionStatusSchema,
  obsidian: z.object({
    connected: z.boolean(),
    vaultName: z.string().nullable(),
    fileCount: z.number(),
  }),
  evolver: z.object({
    status: z.enum(['idle', 'running', 'error', 'disabled']),
    lastRun: z.string().datetime().optional(),
    nextRun: z.string().datetime().optional(),
    pendingPatches: z.number(),
    weeklyAutoPatches: z.number(),
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
