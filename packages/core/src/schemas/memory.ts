import { z } from 'zod'

export const MemoryTypeSchema = z.enum([
  'episodic',
  'semantic',
  'procedural',
])

export const MemoryEntrySchema = z.object({
  id: z.string().uuid(),
  content: z.string(),
  type: MemoryTypeSchema,
  tags: z.array(z.string()),
  source: z.string(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  quality_score: z.number().min(0).max(1),
  is_core: z.boolean().default(false),
  merged_from: z.array(z.string()).optional(),
  archived_at: z.string().datetime().optional(),
})

export const MemoryEntryListSchema = z.array(MemoryEntrySchema)

export const MemoryStatsSchema = z.object({
  total: z.number(),
  byType: z.object({
    episodic: z.number(),
    semantic: z.number(),
    procedural: z.number(),
  }),
  archived: z.number(),
  core: z.number(),
  lastUpdated: z.string().datetime(),
})

export const LanceDBStatusSchema = z.object({
  connected: z.boolean(),
  ollamaReachable: z.boolean(),
  embeddingModel: z.string().nullable(),
  totalEntries: z.number(),
  byType: z.object({
    episodic: z.number(),
    semantic: z.number(),
    procedural: z.number(),
  }),
})

export type MemoryType = z.infer<typeof MemoryTypeSchema>
export type MemoryEntry = z.infer<typeof MemoryEntrySchema>
export type MemoryStats = z.infer<typeof MemoryStatsSchema>
export type LanceDBStatus = z.infer<typeof LanceDBStatusSchema>
