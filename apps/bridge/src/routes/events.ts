import type { Server } from 'node:http'
import type { WebSocket } from 'ws'
import { WebSocketServer } from 'ws'
import type { EvolverEvent, SystemEvent } from '@opc/core'
import type { AppContext } from '../server'
import { envelope } from '../server'
import { buildSystemHealth } from '../systemHealth'

function sendJson(socket: WebSocket, payload: unknown) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload))
  }
}

function evolverEventToSystemEvent(event: EvolverEvent): SystemEvent {
  const timestamp = new Date().toISOString()
  const titles: Record<EvolverEvent['type'], string> = {
    'evolver.started': 'Evolver started',
    'evolver.completed': 'Evolver completed',
    'evolver.error': 'Evolver error',
    'skill.patch.submitted': 'Skill patch submitted',
    'skill.patch.auto_applied': 'Skill patch auto-applied',
    'memory.maintenance.started': 'Memory maintenance started',
    'memory.maintenance.completed': 'Memory maintenance completed',
  }

  const message =
    event.type === 'evolver.started'
      ? `Triggered by ${event.triggeredBy}`
      : event.type === 'evolver.completed'
        ? event.summary
        : event.type === 'evolver.error'
          ? event.message
          : event.type === 'skill.patch.submitted'
            ? `${event.skillName}: ${event.patch.summary}`
            : event.type === 'skill.patch.auto_applied'
              ? `${event.skillName}: ${event.summary}`
              : event.type === 'memory.maintenance.completed'
                ? `Merged ${event.merged}, pruned ${event.pruned}, archived ${event.archived}`
                : 'Memory maintenance is running'

  return {
    id: `event-${event.type}-${Date.now()}`,
    type: event.type,
    title: titles[event.type],
    message,
    level: event.type === 'evolver.error' ? 'error' : 'info',
    source: 'evolver',
    timestamp,
    skillId: 'skillName' in event ? event.skillName : undefined,
    metadata: { evolverEvent: event },
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
    const health = await buildSystemHealth(context)
    sendJson(socket, envelope({ type: 'system.health.snapshot', health }, context.mode))

    const unsubscribe = context.adapter.subscribe((event) => {
      sendJson(socket, envelope(event, context.mode))
    })
    const unsubscribeEvolver = context.evolverAdapter.subscribe((event) => {
      sendJson(socket, envelope(evolverEventToSystemEvent(event), context.mode))
    })

    const cleanup = () => {
      unsubscribe()
      unsubscribeEvolver()
    }

    socket.on('close', cleanup)
    socket.on('error', cleanup)
  })

  return wss
}
