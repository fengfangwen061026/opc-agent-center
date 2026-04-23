import type { Server } from 'node:http'
import type { WebSocket } from 'ws'
import { WebSocketServer } from 'ws'
import type { AppContext } from '../server'
import { envelope } from '../server'

function sendJson(socket: WebSocket, payload: unknown) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload))
  }
}

export function attachEventWebSocket(server: Server, context: AppContext) {
  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (request, socket, head) => {
    if (!request.url?.startsWith('/ws/events')) {
      return
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request)
    })
  })

  wss.on('connection', async (socket) => {
    const health = await context.adapter.getStatus()
    sendJson(socket, envelope({ type: 'system.health.snapshot', health }, context.mode))

    const unsubscribe = context.adapter.subscribe((event) => {
      sendJson(socket, envelope(event, context.mode))
    })

    socket.on('close', unsubscribe)
    socket.on('error', unsubscribe)
  })

  return wss
}
