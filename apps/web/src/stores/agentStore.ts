import { create } from 'zustand'
import type { Agent } from '@opc/core'
import { fetchBridge } from '@/lib/bridgeClient'
import agentData from '../../../../data/mock/agents.json'

interface AgentStore {
  agents: Agent[]
  selectedAgentId?: string
  selectAgent: (id: string) => void
  clearSelectedAgent: () => void
  fetchAgents: () => Promise<void>
}

export const useAgentStore = create<AgentStore>((set) => ({
  agents: agentData as Agent[],
  selectedAgentId: undefined,
  selectAgent: (id) => set({ selectedAgentId: id }),
  clearSelectedAgent: () => set({ selectedAgentId: undefined }),
  fetchAgents: async () => {
    try {
      const agents = await fetchBridge<Agent[]>('/api/agents')
      set({ agents })
    } catch {
      set({ agents: agentData as Agent[] })
    }
  },
}))
