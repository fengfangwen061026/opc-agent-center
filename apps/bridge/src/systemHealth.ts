import type { SystemHealth } from '@opc/core'
import { SystemHealthSchema } from '@opc/core'
import type { AppContext } from './server'

export async function buildSystemHealth(context: AppContext): Promise<SystemHealth> {
  const [baseHealth, lancedb, memoryStats, evolver, obsidian] = await Promise.all([
    context.adapter.getStatus(),
    context.memoryAdapter.status(),
    context.memoryAdapter.getStats(),
    context.evolverAdapter.getStatus(),
    context.obsidianAdapter.status(),
  ])

  return SystemHealthSchema.parse({
    ...baseHealth,
    lancedb: {
      connected: lancedb.connected,
      ollamaReachable: lancedb.ollamaReachable,
      embeddingModel: lancedb.embeddingModel,
      source: lancedb.source,
      semanticSearch: lancedb.semanticSearch,
      totalEntries: memoryStats.total,
    },
    ollama: {
      ...baseHealth.ollama,
      status: lancedb.ollamaReachable ? 'connected' : 'disconnected',
      version: lancedb.embeddingModel ?? baseHealth.ollama.version,
      lastCheckedAt: baseHealth.ollama.lastCheckedAt,
      message: lancedb.embeddingModel
        ? `${lancedb.embeddingModel} embedding model ready`
        : lancedb.ollamaReachable
          ? 'Ollama reachable, embedding model unavailable; keyword recall is active'
          : 'Ollama unavailable; semantic recall is disabled',
    },
    evolver: {
      status: evolver.status,
      source: evolver.source,
      lastRun: evolver.lastRun,
      nextRun: evolver.nextRun,
      pendingPatches: evolver.pendingPatches,
      weeklyAutoPatches: evolver.weeklyAutoPatches,
    },
    obsidian,
    memory: {
      totalEntries: memoryStats.total,
      episodic: memoryStats.byType.episodic,
      semantic: memoryStats.byType.semantic,
      procedural: memoryStats.byType.procedural,
      lastMaintenance: baseHealth.memory.lastMaintenance,
    },
  })
}
