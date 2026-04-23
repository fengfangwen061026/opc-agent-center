import { create } from 'zustand'
import type { SystemEvent, SystemHealth } from '@opc/core'
import { createBridgeWs } from '@/lib/bridgeClient'
import { useSystemHealthStore } from './systemHealthStore'
import eventData from '../../../../data/mock/events.json'

interface EventStore {
  events: SystemEvent[]
  bridgeStatus: 'online' | 'offline'
  pushEvent: (event: SystemEvent) => void
  subscribe: () => () => void
}

let timerId: number | undefined
let subscribers = 0

function createHeartbeatEvent(index: number): SystemEvent {
  const timestamp = new Date().toISOString()

  return {
    id: `heartbeat-${index}`,
    type: 'system.heartbeat',
    title: 'Mock heartbeat',
    message: 'Dashboard mock stream is active.',
    level: 'info',
    source: 'bridge',
    timestamp,
    metadata: {
      index,
    },
  }
}

export const useEventStore = create<EventStore>((set, get) => ({
  events: (eventData as SystemEvent[]).sort((left, right) =>
    left.timestamp.localeCompare(right.timestamp),
  ),
  bridgeStatus: 'offline',
  pushEvent: (event) =>
    set((state) => ({
      events: [...state.events, event].slice(-2000),
    })),
  subscribe: () => {
    subscribers += 1

    if (typeof window !== 'undefined' && timerId === undefined) {
      const stopWs = createBridgeWs({
        onEvent: (event) => get().pushEvent(event),
        onHealth: (health) => useSystemHealthStore.getState().setHealth(health as SystemHealth),
        onOpen: () => {
          set({ bridgeStatus: 'online' })
          useSystemHealthStore.getState().setBridgeOnline(true)
        },
        onOffline: () => {
          set({ bridgeStatus: 'offline' })
          useSystemHealthStore.getState().setBridgeOnline(false)
        },
      })

      timerId = window.setInterval(() => {
        if (get().bridgeStatus === 'online') {
          return
        }

        get().pushEvent(createHeartbeatEvent(get().events.length + 1))
      }, 9000)

      return () => {
        subscribers = Math.max(0, subscribers - 1)

        if (subscribers === 0 && timerId !== undefined) {
          stopWs()
          window.clearInterval(timerId)
          timerId = undefined
        }
      }
    }

    return () => {
      subscribers = Math.max(0, subscribers - 1)

      if (subscribers === 0 && timerId !== undefined) {
        window.clearInterval(timerId)
        timerId = undefined
      }
    }
  },
}))
