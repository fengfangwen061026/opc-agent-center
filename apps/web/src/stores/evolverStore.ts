import { create } from 'zustand'
import type { EvolverEvent, EvolverStatus, SkillPatch } from '@opc/core'
import { fetchBridge } from '@/lib/bridgeClient'
import { useNotificationStore } from './notificationStore'

interface EvolverStore {
  status: EvolverStatus | null
  pendingPatches: SkillPatch[]
  recentEvents: EvolverEvent[]
  fetchStatus: () => Promise<void>
  fetchPendingPatches: () => Promise<void>
  approvePatch: (skillName: string, patchId: string) => Promise<void>
  rejectPatch: (skillName: string, patchId: string, reason?: string) => Promise<void>
  triggerEval: (skillName: string) => Promise<void>
  handleWsEvent: (event: EvolverEvent) => void
}

const fallbackStatus: EvolverStatus = {
  status: 'idle',
  pendingPatches: 2,
  weeklyAutoPatches: 5,
  autoPatchCountThisWeek: 5,
  evalsThisWeek: 3,
  memoryMaintenanceCount: 1,
  nextRun: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
  lastRun: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
}

export const useEvolverStore = create<EvolverStore>((set, get) => ({
  status: fallbackStatus,
  pendingPatches: [],
  recentEvents: [],
  fetchStatus: async () => {
    try {
      const status = await fetchBridge<EvolverStatus>('/api/evolver/status')
      set({ status })
    } catch {
      set({ status: fallbackStatus })
    }
  },
  fetchPendingPatches: async () => {
    try {
      const pendingPatches = await fetchBridge<SkillPatch[]>('/api/evolver/patches')
      set({ pendingPatches })
    } catch {
      set({ pendingPatches: [] })
    }
  },
  approvePatch: async (skillName, patchId) => {
    set((state) => ({
      pendingPatches: state.pendingPatches.filter((patch) => patch.id !== patchId),
      status: state.status
        ? { ...state.status, pendingPatches: Math.max(0, state.status.pendingPatches - 1) }
        : state.status,
    }))
    useNotificationStore.getState().resolveSkillPatch(skillName, 'approve')
    try {
      await fetchBridge(`/api/evolver/patches/${encodeURIComponent(skillName)}/${encodeURIComponent(patchId)}/approve`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      await Promise.all([get().fetchStatus(), get().fetchPendingPatches()])
    } catch {
      // Optimistic update remains in mock fallback.
    }
  },
  rejectPatch: async (skillName, patchId, reason) => {
    set((state) => ({
      pendingPatches: state.pendingPatches.filter((patch) => patch.id !== patchId),
      status: state.status
        ? { ...state.status, pendingPatches: Math.max(0, state.status.pendingPatches - 1) }
        : state.status,
    }))
    useNotificationStore.getState().resolveSkillPatch(skillName, 'reject')
    try {
      await fetchBridge(`/api/evolver/patches/${encodeURIComponent(skillName)}/${encodeURIComponent(patchId)}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      })
      await Promise.all([get().fetchStatus(), get().fetchPendingPatches()])
    } catch {
      // Optimistic update remains in mock fallback.
    }
  },
  triggerEval: async (skillName) => {
    set((state) => ({
      status: state.status ? { ...state.status, status: 'running', currentOperation: `Eval ${skillName}` } : state.status,
    }))
    try {
      await fetchBridge(`/api/evolver/eval/${encodeURIComponent(skillName)}`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
    } catch {
      window.setTimeout(() => {
        set((state) => ({
          status: state.status ? { ...state.status, status: 'idle', currentOperation: undefined } : state.status,
        }))
      }, 1600)
    }
  },
  handleWsEvent: (event) => {
    set((state) => ({
      recentEvents: [event, ...state.recentEvents].slice(0, 20),
      status:
        event.type === 'evolver.started'
          ? state.status
            ? { ...state.status, status: 'running', currentOperation: event.triggeredBy }
            : state.status
          : event.type === 'evolver.completed'
            ? state.status
              ? { ...state.status, status: 'idle', currentOperation: undefined, lastRun: new Date().toISOString() }
              : state.status
            : event.type === 'evolver.error'
              ? state.status
                ? { ...state.status, status: 'error', lastError: event.message }
                : state.status
              : state.status,
    }))
    if (event.type === 'skill.patch.submitted') {
      set((state) => ({
        pendingPatches: [event.patch, ...state.pendingPatches],
        status: state.status ? { ...state.status, pendingPatches: state.status.pendingPatches + 1 } : state.status,
      }))
    }
  },
}))
