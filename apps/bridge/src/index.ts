import type { Server } from 'node:http'
import { serve } from '@hono/node-server'
import { createEvolverAdapter, createLanceDBAdapter, createObsidianAdapter, createOpenClawAdapter } from './adapters/factory'
import { loadEnv, sanitizeLog } from './env'
import { attachEventWebSocket } from './routes/events'
import { createApp } from './server'

const env = loadEnv()
const adapter = createOpenClawAdapter(env)
const memoryAdapter = await createLanceDBAdapter(env)
const evolverAdapter = createEvolverAdapter()
const obsidianAdapter = createObsidianAdapter()

await adapter.connect()
await evolverAdapter.connect()
await obsidianAdapter.connect({
  apiUrl: env.obsidianApiUrl,
  apiKey: env.obsidianApiKey,
})

const app = createApp({
  adapter,
  memoryAdapter,
  evolverAdapter,
  obsidianAdapter,
  mode: env.mode,
})

const server = serve({
  fetch: app.fetch,
  port: env.port,
})

attachEventWebSocket(server as unknown as Server, {
  adapter,
  memoryAdapter,
  evolverAdapter,
  obsidianAdapter,
  mode: env.mode,
})

console.log(
  '[bridge] listening',
  sanitizeLog({
    port: env.port,
    mode: env.mode,
    gatewayUrl: env.gatewayUrl,
    lancedbPath: env.lancedbPath,
    ollamaUrl: env.ollamaUrl,
    embeddingModel: env.embeddingModel,
    lancedbMode: env.lancedbMode,
    obsidianApiUrl: env.obsidianApiUrl,
    hasToken: Boolean(env.token),
  }),
)

const shutdown = async () => {
  await Promise.all([adapter.disconnect(), memoryAdapter.disconnect(), evolverAdapter.disconnect(), obsidianAdapter.disconnect()])
  server.close()
}

process.once('SIGINT', () => {
  void shutdown().finally(() => process.exit(0))
})

process.once('SIGTERM', () => {
  void shutdown().finally(() => process.exit(0))
})
