import type { SystemEvent } from '@opc/core'

interface BridgeEnvelope<T> {
  data: T
  meta: {
    timestamp: string
    mode: 'mock' | 'live'
  }
}

interface BridgeWsOptions {
  onEvent: (event: SystemEvent) => void
  onHealth: (health: unknown) => void
  onOpen?: () => void
  onOffline?: () => void
}

const defaultBridgeUrl = import.meta.env.VITE_BRIDGE_URL ?? 'http://localhost:3001'

export function getBridgeBaseUrl() {
  return sessionStorage.getItem('opc.bridgeUrl') || defaultBridgeUrl
}

export function setBridgeBaseUrl(url: string) {
  sessionStorage.setItem('opc.bridgeUrl', url.replace(/\/$/, ''))
}

export function getSessionToken() {
  return sessionStorage.getItem('opc.sessionToken') ?? ''
}

export function setSessionToken(token: string) {
  if (token) {
    sessionStorage.setItem('opc.sessionToken', token)
    return
  }

  sessionStorage.removeItem('opc.sessionToken')
}

export async function fetchBridge<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 3500)
  const token = getSessionToken()

  try {
    const response = await fetch(`${getBridgeBaseUrl()}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`Bridge ${response.status}`)
    }

    const payload = (await response.json()) as BridgeEnvelope<T>
    return payload.data
  } finally {
    window.clearTimeout(timeout)
  }
}

export function createBridgeWs({ onEvent, onHealth, onOpen, onOffline }: BridgeWsOptions) {
  let closed = false
  let socket: WebSocket | undefined
  let reconnectMs = 1000
  let reconnectTimer: number | undefined

  const connect = () => {
    if (closed) return

    const base = getBridgeBaseUrl().replace(/^http/, 'ws')
    socket = new WebSocket(`${base}/ws/events`)

    socket.addEventListener('open', () => {
      reconnectMs = 1000
      onOpen?.()
    })

    socket.addEventListener('message', (event) => {
      const payload = JSON.parse(event.data as string) as BridgeEnvelope<
        SystemEvent | { type: 'system.health.snapshot'; health: unknown }
      >

      if ('health' in payload.data && payload.data.type === 'system.health.snapshot') {
        onHealth(payload.data.health)
        return
      }

      onEvent(payload.data as SystemEvent)
    })

    socket.addEventListener('close', scheduleReconnect)
    socket.addEventListener('error', scheduleReconnect)
  }

  const scheduleReconnect = () => {
    if (closed || reconnectTimer !== undefined) return

    onOffline?.()
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = undefined
      reconnectMs = Math.min(30000, reconnectMs * 2)
      connect()
    }, reconnectMs)
  }

  connect()

  return () => {
    closed = true
    if (reconnectTimer !== undefined) {
      window.clearTimeout(reconnectTimer)
    }
    socket?.close()
  }
}
