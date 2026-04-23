import type { Server } from 'node:http'
import { serve } from '@hono/node-server'
import { createOpenClawAdapter } from './adapters/factory'
import { loadEnv, sanitizeLog } from './env'
import { attachEventWebSocket } from './routes/events'
import { createApp } from './server'

const env = loadEnv()
const adapter = createOpenClawAdapter(env)

await adapter.connect()

const app = createApp({
  adapter,
  mode: env.mode,
})

const server = serve({
  fetch: app.fetch,
  port: env.port,
})

attachEventWebSocket(server as unknown as Server, {
  adapter,
  mode: env.mode,
})

console.log(
  '[bridge] listening',
  sanitizeLog({
    port: env.port,
    mode: env.mode,
    gatewayUrl: env.gatewayUrl,
    hasToken: Boolean(env.token),
  }),
)

const shutdown = async () => {
  await adapter.disconnect()
  server.close()
}

process.once('SIGINT', () => {
  void shutdown().finally(() => process.exit(0))
})

process.once('SIGTERM', () => {
  void shutdown().finally(() => process.exit(0))
})
