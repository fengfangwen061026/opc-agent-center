import { z } from 'zod'

export const ConversationRoleSchema = z.enum(['user', 'assistant', 'system', 'tool', 'agent'])
export const ConversationChannelSchema = z.enum([
  'default',
  'telegram',
  'whatsapp',
  'discord',
  'feishu',
  'weixin',
  'web',
])

export const ConversationMessageTypeSchema = z.enum([
  'text',
  'skill_invocation',
  'task_report',
  'approval_request',
])

export const ConversationMessageSchema = z.object({
  id: z.string(),
  role: ConversationRoleSchema,
  author: z.string(),
  content: z.string(),
  type: ConversationMessageTypeSchema.default('text'),
  channel: ConversationChannelSchema.default('default'),
  timestamp: z.string().datetime(),
  agentId: z.string().optional(),
  taskId: z.string().optional(),
  notificationId: z.string().optional(),
  skillId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
})

export const ConversationSchema = z.object({
  id: z.string(),
  title: z.string(),
  channel: ConversationChannelSchema.default('default'),
  participants: z.array(z.string()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  tags: z.array(z.string()),
  unreadCount: z.number().nonnegative().default(0),
  messages: z.array(ConversationMessageSchema).min(1),
})

export const ConversationListSchema = z.array(ConversationSchema)

export type ConversationRole = z.infer<typeof ConversationRoleSchema>
export type ConversationChannel = z.infer<typeof ConversationChannelSchema>
export type ConversationMessageType = z.infer<typeof ConversationMessageTypeSchema>
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>
export type Conversation = z.infer<typeof ConversationSchema>
