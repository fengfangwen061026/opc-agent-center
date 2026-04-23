import WebSocket from 'ws'
import type { SystemEvent } from '@opc/core'
import { MockOpenClawAdapter } from './MockOpenClawAdapter'

interface WsOpenClawAdapterOptions {
  gatewayUrl: string
  deviceName: string
  token?: string
}

export class WsOpenClawAdapter extends MockOpenClawAdapter {
  private socket: WebSocket | undefined

  constructor(private readonly options: WsOpenClawAdapterOptions) {
    super()
  }

  override async connect(): Promise<void> {
    // TODO: Replace mock hydration with the real OpenClaw Gateway protocol once
    // the Gateway is installed and :18789 exposes a stable event/schema contract.
    await super.connect()

    try {
      this.socket = new WebSocket(this.options.gatewayUrl, {
        headers: this.options.token ? { Authorization: `Bearer ${this.options.token}` } : undefined,
      })

      this.socket.on('message', (payload) => {
        try {
          const event = JSON.parse(payload.toString()) as SystemEvent
          this.subscribe(() => undefined)
          void event
        } catch {
          // Ignore unknown live messages until the OpenClaw event contract is wired.
        }
      })
    } catch {
      // Mock fallback stays active if the live gateway is unavailable.
    }
  }

  override async disconnect(): Promise<void> {
    this.socket?.close()
    this.socket = undefined
    await super.disconnect()
  }
}
