import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import type { BridgeMode } from '@opc/core'

const secretKeys = new Set([
  'token',
  'password',
  'apikey',
  'api_key',
  'secret',
  'authorization',
  'cookie',
  'private_key',
  'ssh_key',
  'session',
  'bearer',
])

export interface BridgeEnv {
  port: number
  mode: BridgeMode
  gatewayUrl: string
  deviceName: string
  token?: string
  lancedbPath: string
  ollamaUrl: string
  embeddingModel: string
  memoryAutoCapture: boolean
  memoryAutoRecall: boolean
  lancedbMode: 'mock' | 'real'
  obsidianMode: 'mock' | 'real'
  obsidianApiUrl: string
  obsidianApiKey?: string
  feishuAppId?: string
  feishuAppSecret?: string
}

function readOptionalSecretFile(path: string) {
  try {
    return readFileSync(path, 'utf8').trim() || undefined
  } catch {
    return undefined
  }
}

function readOpenClawGatewayToken() {
  try {
    const config = JSON.parse(readFileSync(`${homedir()}/.openclaw/openclaw.json`, 'utf8')) as {
      gatewayToken?: string
      gateway?: {
        token?: string
        auth?: {
          token?: string
        }
      }
    }
    return config.gatewayToken ?? config.gateway?.token ?? config.gateway?.auth?.token
  } catch {
    return undefined
  }
}

export function loadEnv(): BridgeEnv {
  const mode = process.env.OPENCLAW_MODE === 'live' ? 'live' : 'mock'

  return {
    port: Number(process.env.BRIDGE_PORT ?? 3001),
    mode,
    gatewayUrl: process.env.OPENCLAW_GATEWAY_URL ?? 'ws://127.0.0.1:18789',
    deviceName: process.env.OPENCLAW_DEVICE_NAME ?? 'opc-bridge',
    token: process.env.OPENCLAW_TOKEN ?? readOpenClawGatewayToken(),
    lancedbPath:
      process.env.LANCEDB_DB_PATH ?? process.env.LANCEDB_PATH ?? '~/.openclaw/memory/lancedb',
    ollamaUrl: process.env.OLLAMA_URL ?? 'http://localhost:11434',
    embeddingModel: process.env.EMBEDDING_MODEL ?? 'nomic-embed-text',
    memoryAutoCapture: process.env.MEMORY_AUTO_CAPTURE !== 'false',
    memoryAutoRecall: process.env.MEMORY_AUTO_RECALL !== 'false',
    lancedbMode: process.env.LANCEDB_MODE === 'real' ? 'real' : 'mock',
    obsidianMode: process.env.OBSIDIAN_MODE === 'real' ? 'real' : 'mock',
    obsidianApiUrl: process.env.OBSIDIAN_API_URL ?? 'http://localhost:27123',
    obsidianApiKey:
      process.env.OBSIDIAN_API_KEY ??
      readOptionalSecretFile(`${homedir()}/.openclaw/obsidian-api-token.txt`),
    feishuAppId: process.env.FEISHU_APP_ID,
    feishuAppSecret: process.env.FEISHU_APP_SECRET,
  }
}

export function sanitizeLog(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLog(item))
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => {
        if (secretKeys.has(key.toLowerCase())) {
          return [key, '[redacted]']
        }

        return [key, sanitizeLog(nested)]
      }),
    )
  }

  return value
}
