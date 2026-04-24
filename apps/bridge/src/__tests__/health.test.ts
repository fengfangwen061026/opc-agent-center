import { afterEach, describe, expect, it } from 'vitest'
import type {
  Conversation,
  EvolverStatus,
  LanceDBStatus,
  Notification,
  ObsidianStatus,
  ReviewQueueEntry,
  Skill,
  SystemEvent,
  SystemHealth,
  Task,
  VaultNode,
  VaultNote,
  VaultSearchResult,
} from '@opc/core'
import type { EvolverAdapter } from '../adapters/EvolverAdapter'
import type { LanceDBAdapter } from '../adapters/LanceDBAdapter'
import type { ObsidianAdapter } from '../adapters/ObsidianAdapter'
import type { OpenClawAdapter } from '../adapters/OpenClawAdapter'
import { createApp } from '../server'
import { buildSystemHealth } from '../systemHealth'

const baseHealth: SystemHealth = {
  gateway: {
    status: 'connected',
    endpoint: 'ws://127.0.0.1:18789',
    latencyMs: 8,
    version: 'openclaw-gateway',
    lastCheckedAt: '2026-04-24T12:00:00.000Z',
    message: 'Gateway connected',
  },
  lancedb: {
    connected: false,
    ollamaReachable: false,
    embeddingModel: null,
    source: 'mock',
    semanticSearch: 'keyword-fallback',
    totalEntries: 0,
  },
  ollama: {
    status: 'disconnected',
    endpoint: 'http://127.0.0.1:11434',
    latencyMs: 0,
    version: 'unknown',
    lastCheckedAt: '2026-04-24T12:00:00.000Z',
    message: 'Ollama unavailable',
  },
  obsidian: {
    connected: false,
    vaultName: null,
    fileCount: 0,
  },
  evolver: {
    status: 'idle',
    source: 'mock',
    pendingPatches: 0,
    weeklyAutoPatches: 0,
  },
  memory: {
    totalEntries: 0,
    episodic: 0,
    semantic: 0,
    procedural: 0,
  },
}

const lancedbStatus: LanceDBStatus = {
  connected: true,
  ollamaReachable: true,
  embeddingModel: 'nomic-embed-text:latest',
  source: 'live-connected',
  semanticSearch: 'vector',
  totalEntries: 99,
  byType: {
    episodic: 3,
    semantic: 2,
    procedural: 1,
  },
}

const evolverStatus: EvolverStatus = {
  status: 'running',
  source: 'live-connected',
  pendingPatches: 2,
  weeklyAutoPatches: 4,
  autoPatchCountThisWeek: 4,
  evalsThisWeek: 1,
  memoryMaintenanceCount: 1,
  currentOperation: 'memory-maintenance',
  lastRun: '2026-04-24T03:00:00.000Z',
  nextRun: '2026-05-01T03:00:00.000Z',
}

const obsidianStatus: ObsidianStatus = {
  connected: true,
  vaultName: 'opc-vault',
  fileCount: 17,
}

function createOpenClawStub(): OpenClawAdapter {
  return {
    connect: async () => {},
    disconnect: async () => {},
    getStatus: async () => baseHealth,
    listAgents: async () => [],
    listTasks: async (limit?: number): Promise<Task[]> => {
      void limit
      return []
    },
    listSkills: async (): Promise<Skill[]> => [],
    getSkill: async () => undefined,
    updateSkill: async () => {
      throw new Error('not used in health test')
    },
    evalSkill: async () => {
      throw new Error('not used in health test')
    },
    approveSkillPatch: async () => {},
    rejectSkillPatch: async () => {},
    rollbackSkill: async () => {},
    listNotifications: async (): Promise<Notification[]> => [],
    actionNotification: async () => {},
    sendNotification: async () => {},
    listConversations: async (): Promise<Conversation[]> => [],
    sendMessage: async () => {},
    subscribe: (handler: (event: SystemEvent) => void) => {
      void handler
      return () => {}
    },
  }
}

function createMemoryStub(): LanceDBAdapter {
  return {
    connect: async () => {},
    isConnected: () => true,
    disconnect: async () => {},
    status: async () => lancedbStatus,
    create: async () => {
      throw new Error('not used in health test')
    },
    get: async () => null,
    update: async () => {
      throw new Error('not used in health test')
    },
    softDelete: async () => {},
    list: async () => ({ entries: [], total: 0 }),
    search: async () => [],
    getEvolverLog: async () => ({ entries: [], total: 0 }),
    writeEvolverLog: async () => {},
    bulkSoftDelete: async () => {},
    getStats: async () => ({
      total: 6,
      byType: {
        episodic: 3,
        semantic: 2,
        procedural: 1,
      },
      archived: 2,
      core: 2,
      lastUpdated: '2026-04-24T12:10:00.000Z',
    }),
  }
}

function createEvolverStub(): EvolverAdapter {
  return {
    connect: async () => {},
    disconnect: async () => {},
    getStatus: async () => evolverStatus,
    getPendingPatches: async () => [],
    approvePatch: async () => {},
    rejectPatch: async () => {},
    triggerEval: async () => ({ jobId: 'job-test' }),
    subscribe: () => () => {},
  }
}

function createObsidianStub(): ObsidianAdapter {
  return {
    connect: async () => {},
    disconnect: async () => {},
    status: async () => obsidianStatus,
    getTree: async (path?: string): Promise<VaultNode[]> => {
      void path
      return []
    },
    getNote: async (path: string): Promise<VaultNote | null> => {
      void path
      return null
    },
    writeNote: async () => {},
    appendNote: async () => {},
    deleteNote: async () => {},
    search: async (query: string, limit?: number): Promise<VaultSearchResult[]> => {
      void query
      void limit
      return []
    },
    getReviewQueue: async (): Promise<VaultNote[]> => [],
    addToReviewQueue: async (note: ReviewQueueEntry) => {
      void note
    },
  }
}

describe('health aggregation', () => {
  afterEach(async () => {
    await Promise.resolve()
  })

  it('returns the same health object over REST and direct aggregation', async () => {
    const context = {
      adapter: createOpenClawStub(),
      memoryAdapter: createMemoryStub(),
      evolverAdapter: createEvolverStub(),
      obsidianAdapter: createObsidianStub(),
      mode: 'live' as const,
    }

    const app = createApp(context)
    const restResponse = await app.request('http://bridge.test/api/health')
    const restPayload = (await restResponse.json()) as { data: SystemHealth }
    const direct = await buildSystemHealth(context)
    expect(restPayload.data).toEqual(direct)
  }, 10000)
})
