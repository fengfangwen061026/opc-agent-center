import { create } from 'zustand'
import type { SystemEvent, Task } from '@opc/core'
import { fetchBridge } from '@/lib/bridgeClient'
import taskData from '../../../../data/mock/tasks.json'
import { useEventStore } from './eventStore'

interface TaskStore {
  tasks: Task[]
  fetchTasks: () => Promise<void>
  subscribeToEvents: () => () => void
}

let eventUnsubscribe: (() => void) | undefined

function updateTaskFromEvent(tasks: Task[], event: SystemEvent): Task[] {
  if (!event.taskId) {
    return tasks
  }

  return tasks.map((task) => {
    if (task.id !== event.taskId) {
      return task
    }

    const timestamp = event.timestamp

    if (event.type === 'task.progress') {
      const progress = typeof event.metadata.progress === 'number' ? event.metadata.progress : task.progress
      return {
        ...task,
        progress,
        updatedAt: timestamp,
      }
    }

    if (event.type === 'task.completed') {
      return {
        ...task,
        status: 'completed',
        progress: 100,
        updatedAt: timestamp,
        completedAt: timestamp,
      }
    }

    if (event.type === 'task.failed') {
      return {
        ...task,
        status: 'failed',
        updatedAt: timestamp,
        completedAt: timestamp,
      }
    }

    if (event.type === 'task.blocked') {
      return {
        ...task,
        status: 'blocked',
        updatedAt: timestamp,
        blockedReason:
          typeof event.metadata.reason === 'string' ? event.metadata.reason : task.blockedReason,
      }
    }

    return task
  })
}

export const useTaskStore = create<TaskStore>((set) => ({
  tasks: taskData as Task[],
  fetchTasks: async () => {
    try {
      const tasks = await fetchBridge<Task[]>('/api/tasks')
      set({ tasks })
    } catch {
      set({ tasks: taskData as Task[] })
    }
  },
  subscribeToEvents: () => {
    if (eventUnsubscribe) {
      return eventUnsubscribe
    }

    let lastLength = useEventStore.getState().events.length

    eventUnsubscribe = useEventStore.subscribe((state) => {
      if (state.events.length <= lastLength) {
        return
      }

      const latest = state.events[state.events.length - 1]
      lastLength = state.events.length

      if (!latest) {
        return
      }

      set((store) => ({
        tasks: updateTaskFromEvent(store.tasks, latest),
      }))
    })

    return () => {
      eventUnsubscribe?.()
      eventUnsubscribe = undefined
    }
  },
}))
