import { z } from 'zod'

export const NotificationTypeSchema = z.enum([
  'skill_patch_pending',
  'skill_auto_patched',
  'skill_eval_complete',
  'memory_maintenance_report',
  'knowledge_capture',
  'evolver_error',
  'task_report',
  'approval_required',
])

export const NotificationSeveritySchema = z.enum(['info', 'success', 'warning', 'error'])
export const NotificationStatusSchema = z.enum(['unread', 'read', 'done', 'dismissed'])
export const NotificationPrioritySchema = z.enum(['low', 'medium', 'high'])

export const NotificationActionSchema = z.object({
  id: z.string(),
  label: z.string(),
  variant: z.enum(['primary', 'ghost', 'danger']),
})

export const NotificationSchema = z.object({
  id: z.string(),
  type: NotificationTypeSchema,
  title: z.string(),
  message: z.string(),
  severity: NotificationSeveritySchema,
  status: NotificationStatusSchema,
  priority: NotificationPrioritySchema.optional(),
  read: z.boolean(),
  actionRequired: z.boolean(),
  createdAt: z.string().datetime(),
  agentId: z.string().optional(),
  skillId: z.string().optional(),
  taskId: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  actions: z.array(NotificationActionSchema).default([]),
})

export const NotificationListSchema = z.array(NotificationSchema)

export type NotificationType = z.infer<typeof NotificationTypeSchema>
export type NotificationSeverity = z.infer<typeof NotificationSeveritySchema>
export type NotificationStatus = z.infer<typeof NotificationStatusSchema>
export type NotificationPriority = z.infer<typeof NotificationPrioritySchema>
export type NotificationAction = z.infer<typeof NotificationActionSchema>
export type Notification = z.infer<typeof NotificationSchema>
