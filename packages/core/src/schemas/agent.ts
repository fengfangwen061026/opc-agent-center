import { z } from 'zod'

export const ConnectionStateSchema = z.enum([
  'connected',
  'disconnected',
  'running',
  'idle',
  'error',
])

export const AgentKindSchema = z.enum([
  'conductor',
  'evolver',
  'coding',
  'knowledge',
  'skill',
  'memory',
  'system',
])

export const AgentLayerSchema = z.enum([
  'core',
  'evolution',
  'coding',
  'knowledge',
  'skill',
  'memory',
  'service',
])

export const ConnectionStatusSchema = z.object({
  status: ConnectionStateSchema,
  endpoint: z.string().optional(),
  latencyMs: z.number().nonnegative().optional(),
  version: z.string().optional(),
  lastCheckedAt: z.string().datetime(),
  message: z.string().optional(),
})

export const AgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string(),
  kind: AgentKindSchema,
  layer: AgentLayerSchema,
  description: z.string(),
  status: ConnectionStateSchema,
  model: z.string().optional(),
  endpoint: z.string().optional(),
  accentColor: z.string(),
  icon: z.string(),
  capabilities: z.array(z.string()),
  tags: z.array(z.string()).default([]),
  currentTaskId: z.string().optional(),
  healthScore: z.number().min(0).max(1),
  lastSeenAt: z.string().datetime(),
  metrics: z
    .object({
      activeSessions: z.number().nonnegative().optional(),
      completedTasks: z.number().nonnegative().optional(),
      failedTasks: z.number().nonnegative().optional(),
      averageLatencyMs: z.number().nonnegative().optional(),
    })
    .optional(),
})

export const AgentListSchema = z.array(AgentSchema)

export type ConnectionState = z.infer<typeof ConnectionStateSchema>
export type AgentKind = z.infer<typeof AgentKindSchema>
export type AgentLayer = z.infer<typeof AgentLayerSchema>
export type ConnectionStatus = z.infer<typeof ConnectionStatusSchema>
export type Agent = z.infer<typeof AgentSchema>
