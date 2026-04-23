import { create } from 'zustand'
import type { SystemHealth } from '@opc/core'
import { fetchBridge } from '@/lib/bridgeClient'
import systemHealthData from '../../../../data/mock/system-health.json'

interface SystemHealthStore {
  health: SystemHealth
  bridgeOnline: boolean
  setBridgeOnline: (bridgeOnline: boolean) => void
  setHealth: (health: SystemHealth) => void
  fetchHealth: () => Promise<void>
}

export const useSystemHealthStore = create<SystemHealthStore>((set) => ({
  health: systemHealthData as SystemHealth,
  bridgeOnline: false,
  setBridgeOnline: (bridgeOnline) => set({ bridgeOnline }),
  setHealth: (health) => set({ health }),
  fetchHealth: async () => {
    try {
      const health = await fetchBridge<SystemHealth>('/api/health')
      set({ health, bridgeOnline: true })
    } catch {
      set({ health: systemHealthData as SystemHealth, bridgeOnline: false })
    }
  },
}))
