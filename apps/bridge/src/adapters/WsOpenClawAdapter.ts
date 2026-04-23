import WebSocket from 'ws'
import { randomUUID } from 'node:crypto'
import type { SystemEvent, SystemHealth } from '@opc/core'
import { MockOpenClawAdapter } from './MockOpenClawAdapter'

interface WsOpenClawAdapterOptions {
  gatewayUrl: string
  deviceName: string
  token?: string
}

export class WsOpenClawAdapter extends MockOpenClawAdapter {
  private socket: WebSocket | undefined
  private reconnectTimer: NodeJS.Timeout | undefined
  private reconnectMs = 1000
  private closed = false
  private liveConnected = false
  private authenticated = false
  private connectRequestId: string | undefined

  constructor(private readonly options: WsOpenClawAdapterOptions) {
    super()
  }

  override async connect(): Promise<void> {
    await super.connect()
    this.closed = false
    this.connectSocket()
  }

  override async getStatus(): Promise<SystemHealth> {
    const health = await super.getStatus()
    const status = this.authenticated ? 'connected' : this.liveConnected ? 'running' : 'disconnected'

    return {
      ...health,
      gateway: {
        ...health.gateway,
        status,
        endpoint: this.options.gatewayUrl,
        version: 'openclaw-gateway-live',
        lastCheckedAt: new Date().toISOString(),
        message: this.authenticated
          ? 'OpenClaw Gateway live session authenticated'
          : this.liveConnected
            ? 'OpenClaw Gateway connected; authentication pending'
            : 'OpenClaw Gateway live session unavailable; mock fallback active',
      },
    }
  }

  private connectSocket() {
    try {
      this.socket = new WebSocket(this.options.gatewayUrl, {
        headers: this.options.token ? { Authorization: `Bearer ${this.options.token}` } : undefined,
      })

      this.socket.on('open', () => {
        this.liveConnected = true
        this.authenticated = false
        console.log('[bridge] gateway connected')
      })

      this.socket.on('message', (payload) => {
        try {
          const message = JSON.parse(payload.toString()) as Record<string, unknown>
          const type = gatewayMessageType(message)

          if (type === 'connect.challenge' || message.challenge) {
            this.sendConnectRequest(message)
            return
          }

          if (this.isConnectResponse(message)) {
            if (message.ok === true) {
              this.authenticated = true
              this.reconnectMs = 1000
              console.log('[ws-adapter] gateway authenticated')
            } else {
              console.warn('[ws-adapter] gateway authentication failed', { error: message.error })
            }
            return
          }

          if (type === 'connect.ready' || type === 'auth.ok') {
            this.authenticated = true
            this.reconnectMs = 1000
            console.log('[ws-adapter] gateway authenticated')
            return
          }

          if (!this.authenticated) {
            return
          }

          const event = mapGatewayEvent(message)
          if (event) {
            this.emit(event)
          }
        } catch {
          // Ignore unknown live messages while the Gateway event contract is still evolving.
        }
      })
      this.socket.on('close', () => this.scheduleReconnect('closed'))
      this.socket.on('error', (error) => this.scheduleReconnect(error.message))
    } catch {
      this.scheduleReconnect('gateway unavailable')
    }
  }

  override async disconnect(): Promise<void> {
    this.closed = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = undefined
    }
    this.socket?.close()
    this.socket = undefined
    await super.disconnect()
  }

  private scheduleReconnect(reason: string) {
    if (this.closed || this.reconnectTimer) {
      return
    }
    if (this.liveConnected) {
      console.warn('[bridge] gateway disconnected; mock fallback remains active', { reason })
    } else {
      console.warn('[bridge] gateway unavailable; mock fallback active', { reason })
    }
    this.liveConnected = false
    this.authenticated = false
    this.connectRequestId = undefined
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined
      this.reconnectMs = Math.min(30000, this.reconnectMs * 2)
      this.connectSocket()
    }, this.reconnectMs)
  }

  private sendConnectRequest(message: Record<string, unknown>) {
    const payload = message.payload && typeof message.payload === 'object' ? (message.payload as Record<string, unknown>) : message
    const nonce = typeof payload.nonce === 'string' ? payload.nonce.trim() : ''
    if (!nonce) {
      console.warn('[ws-adapter] gateway challenge missing nonce')
      return
    }

    this.connectRequestId = `connect-${randomUUID()}`
    this.socket?.send(
      JSON.stringify({
        type: 'req',
        id: this.connectRequestId,
        method: 'connect',
        params: {
          minProtocol: 3,
          maxProtocol: 3,
          client: {
            id: 'gateway-client',
            displayName: this.options.deviceName || 'OPC Bridge',
            version: 'opc-bridge',
            platform: process.platform,
            mode: 'backend',
          },
          caps: [],
          auth: this.options.token ? { token: this.options.token } : undefined,
          role: 'operator',
          scopes: ['operator.read'],
          userAgent: 'opc-agent-center-bridge',
        },
      }),
    )
  }

  private isConnectResponse(message: Record<string, unknown>) {
    return message.type === 'res' && typeof message.id === 'string' && message.id === this.connectRequestId
  }
}

function gatewayMessageType(record: Record<string, unknown>) {
  return typeof record.event === 'string' ? record.event : typeof record.type === 'string' ? record.type : 'gateway.event'
}

function mapGatewayEvent(message: unknown): SystemEvent | null {
  if (!message || typeof message !== 'object') {
    return null
  }

  const record = message as Record<string, unknown>
  const eventName = String(record.event ?? record.type ?? 'gateway.event')
  if (eventName === 'event' && typeof record.event === 'string') {
    return null
  }

  if (eventName === 'connect.challenge') {
    return {
      id: `gateway-connect-challenge-${Date.now()}`,
      type: 'gateway.connect.challenge',
      title: 'Gateway challenge',
      message: 'OpenClaw Gateway issued a connection challenge.',
      level: 'debug',
      source: 'gateway',
      timestamp: new Date().toISOString(),
      metadata: { gatewayEvent: record },
    }
  }

  const payload = (record.payload && typeof record.payload === 'object' ? record.payload : record) as Record<string, unknown>
  return {
    id: String(record.id ?? `gateway-${eventName}-${Date.now()}`),
    type: eventName,
    title: String(record.title ?? eventName),
    message: String(record.message ?? payload.message ?? 'OpenClaw Gateway event'),
    level: record.level === 'error' ? 'error' : record.level === 'warn' ? 'warn' : 'info',
    source: 'gateway',
    timestamp: typeof record.timestamp === 'string' ? record.timestamp : new Date().toISOString(),
    agentId: typeof payload.agentId === 'string' ? payload.agentId : undefined,
    taskId: typeof payload.taskId === 'string' ? payload.taskId : undefined,
    skillId: typeof payload.skillId === 'string' ? payload.skillId : undefined,
    metadata: { gatewayEvent: record },
  }
}
