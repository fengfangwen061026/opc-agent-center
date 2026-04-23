import type { BridgeMode } from '@opc/core'

const secretKeys = new Set(['token', 'password', 'apikey', 'api_key', 'secret', 'authorization', 'cookie'])

export interface BridgeEnv {
  port: number
  mode: BridgeMode
  gatewayUrl: string
  deviceName: string
  token?: string
}

export function loadEnv(): BridgeEnv {
  const mode = process.env.OPENCLAW_MODE === 'live' ? 'live' : 'mock'

  return {
    port: Number(process.env.BRIDGE_PORT ?? 3001),
    mode,
    gatewayUrl: process.env.OPENCLAW_GATEWAY_URL ?? 'ws://127.0.0.1:18789',
    deviceName: process.env.OPENCLAW_DEVICE_NAME ?? 'opc-bridge',
    token: process.env.OPENCLAW_TOKEN,
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
