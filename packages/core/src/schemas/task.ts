import { z } from 'zod'

export const TaskStatusSchema = z.enum(['pending', 'running', 'completed', 'failed', 'blocked'])
export const TaskPrioritySchema = z.enum(['low', 'medium', 'high', 'critical'])

export const TaskCapsuleSchema = z.object({
  goal: z.string(),
  inputs: z.array(z.string()),
  plan: z.array(z.string()),
  outputs: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  notes: z.string().optional(),
  executionLog: z
    .array(
      z.object({
        id: z.string(),
        step: z.string(),
        tool: z.string().optional(),
        parameters: z.record(z.string(), z.unknown()).default({}),
        result: z.string(),
        durationMs: z.number().nonnegative(),
        timestamp: z.string().datetime(),
      }),
    )
    .default([]),
  skillCalls: z
    .array(
      z.object({
        skillId: z.string(),
        status: z.enum(['success', 'fail']),
        durationMs: z.number().nonnegative(),
        summary: z.string(),
      }),
    )
    .default([]),
  evolverAnalysis: z
    .object({
      score: z.number().min(0).max(1),
      suggestions: z.array(z.string()),
    })
    .optional(),
})

export const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  agentId: z.string(),
  skillId: z.string().optional(),
  status: TaskStatusSchema,
  priority: TaskPrioritySchema,
  progress: z.number().min(0).max(100),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  blockedReason: z.string().optional(),
  capsule: TaskCapsuleSchema,
})

export const TaskListSchema = z.array(TaskSchema)

export type TaskStatus = z.infer<typeof TaskStatusSchema>
export type TaskPriority = z.infer<typeof TaskPrioritySchema>
export type TaskCapsule = z.infer<typeof TaskCapsuleSchema>
export type Task = z.infer<typeof TaskSchema>
