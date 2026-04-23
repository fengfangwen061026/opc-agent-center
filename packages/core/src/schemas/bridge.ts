import { z } from 'zod'
import { ConversationChannelSchema } from './conversation'
import { NotificationStatusSchema, NotificationTypeSchema } from './notification'

export const BridgeModeSchema = z.enum(['mock', 'live'])

export const BridgeMetaSchema = z.object({
  timestamp: z.string().datetime(),
  mode: BridgeModeSchema,
})

export const BridgeEnvelopeSchema = <T extends z.ZodType>(schema: T) =>
  z.object({
    data: schema,
    meta: BridgeMetaSchema,
  })

export const NotificationFilterSchema = z.object({
  status: NotificationStatusSchema.optional(),
  type: NotificationTypeSchema.optional(),
})

export const SendMessageInputSchema = z.object({
  conversationId: z.string().optional(),
  agentId: z.string().optional(),
  content: z.string().min(1),
  channel: ConversationChannelSchema.default('web'),
})

export const NotificationActionInputSchema = z.object({
  action: z.string().min(1),
})

export const SkillUpdateInputSchema = z.object({
  configYaml: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
})

export type BridgeMode = z.infer<typeof BridgeModeSchema>
export type BridgeMeta = z.infer<typeof BridgeMetaSchema>
export type NotificationFilter = z.infer<typeof NotificationFilterSchema>
export type SendMessageInput = z.infer<typeof SendMessageInputSchema>
export type NotificationActionInput = z.infer<typeof NotificationActionInputSchema>
export type SkillUpdateInput = z.infer<typeof SkillUpdateInputSchema>
