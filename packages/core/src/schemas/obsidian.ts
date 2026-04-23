import { z } from 'zod'

type VaultNodeShape = {
  path: string
  name: string
  type: 'file' | 'folder'
  children?: VaultNodeShape[]
  modified?: string
}

export const VaultNodeSchema: z.ZodType<VaultNodeShape> = z.lazy(() =>
  z.object({
    path: z.string(),
    name: z.string(),
    type: z.enum(['file', 'folder']),
    children: z.array(VaultNodeSchema).optional(),
    modified: z.string().datetime().optional(),
  }),
)

export const VaultNoteSchema = z.object({
  path: z.string(),
  content: z.string(),
  frontmatter: z.record(z.string(), z.unknown()).optional(),
  modified: z.string().datetime(),
})

export const VaultSearchResultSchema = z.object({
  path: z.string(),
  score: z.number(),
  excerpt: z.string(),
})

export const ReviewQueueEntrySchema = z.object({
  title: z.string(),
  sourceUrl: z.string().url().optional(),
  summary: z.string(),
  tags: z.array(z.string()),
  capturedAt: z.string().datetime(),
  taskId: z.string().optional(),
})

export const ObsidianStatusSchema = z.object({
  connected: z.boolean(),
  vaultName: z.string().nullable(),
  fileCount: z.number(),
})

export const VaultNodeListSchema = z.array(VaultNodeSchema)
export const VaultNoteListSchema = z.array(VaultNoteSchema)
export const VaultSearchResultListSchema = z.array(VaultSearchResultSchema)

export type VaultNode = z.infer<typeof VaultNodeSchema>
export type VaultNote = z.infer<typeof VaultNoteSchema>
export type VaultSearchResult = z.infer<typeof VaultSearchResultSchema>
export type ReviewQueueEntry = z.infer<typeof ReviewQueueEntrySchema>
export type ObsidianStatus = z.infer<typeof ObsidianStatusSchema>
