import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { BridgeMode } from '@opc/core'
import type { EvolverAdapter } from './adapters/EvolverAdapter'
import type { LanceDBAdapter } from './adapters/LanceDBAdapter'
import type { OpenClawAdapter } from './adapters/OpenClawAdapter'
import { sanitizeLog } from './env'
import { registerAgentRoutes } from './routes/agents'
import { registerConversationRoutes } from './routes/conversations'
import { registerEvolverRoutes } from './routes/evolver'
import { registerHealthRoutes } from './routes/health'
import { registerMemoryRoutes } from './routes/memory'
import { registerNotificationRoutes } from './routes/notifications'
import { registerSkillRoutes } from './routes/skills'
import { registerTaskRoutes } from './routes/tasks'

export interface AppContext {
  adapter: OpenClawAdapter
  memoryAdapter: LanceDBAdapter
  evolverAdapter: EvolverAdapter
  mode: BridgeMode
}

export function envelope<T>(data: T, mode: BridgeMode) {
  return {
    data,
    meta: {
      timestamp: new Date().toISOString(),
      mode,
    },
  }
}

export function createApp(context: AppContext) {
  const app = new Hono()

  app.use(
    '*',
    cors({
      origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5174', 'http://127.0.0.1:5174'],
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
      credentials: false,
    }),
  )

  app.onError((error, c) => {
    console.error('[bridge:error]', sanitizeLog({ message: error.message, stack: error.stack }))
    return c.json(
      envelope(
        {
          error: error.message,
        },
        context.mode,
      ),
      500,
    )
  })

  registerHealthRoutes(app, context)
  registerAgentRoutes(app, context)
  registerTaskRoutes(app, context)
  registerSkillRoutes(app, context)
  registerNotificationRoutes(app, context)
  registerConversationRoutes(app, context)
  registerMemoryRoutes(app, context)
  registerEvolverRoutes(app, context)

  app.get('/', (c) => c.json(envelope({ ok: true, service: 'opc-bridge' }, context.mode)))

  return app
}
