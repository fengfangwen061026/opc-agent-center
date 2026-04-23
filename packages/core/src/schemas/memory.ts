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

export type MemoryType = z.infer<typeof MemoryTypeSchema>
export type MemoryEntry = z.infer<typeof MemoryEntrySchema>
