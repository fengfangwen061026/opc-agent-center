import type { Hono } from 'hono'
import type { AppContext } from '../server'
import { envelope } from '../server'

export function registerHealthRoutes(app: Hono, context: AppContext) {
  app.get('/api/health', async (c) => {
    const [baseHealth, lancedb, memoryStats, evolver, obsidian] = await Promise.all([
      context.adapter.getStatus(),
      context.memoryAdapter.status(),
      context.memoryAdapter.getStats(),
      context.evolverAdapter.getStatus(),
      context.obsidianAdapter.status(),
    ])
    const now = new Date().toISOString()
    const health = {
      ...baseHealth,
      lancedb: {
        connected: lancedb.connected,
        ollamaReachable: lancedb.ollamaReachable,
        embeddingModel: lancedb.embeddingModel,
        totalEntries: lancedb.totalEntries,
      },
      ollama: {
        ...baseHealth.ollama,
        status: lancedb.ollamaReachable ? ('connected' as const) : ('disconnected' as const),
        version: lancedb.embeddingModel ?? baseHealth.ollama.version,
        lastCheckedAt: now,
        message: lancedb.embeddingModel
          ? `${lancedb.embeddingModel} embedding model ready`
          : lancedb.ollamaReachable
            ? 'Ollama reachable, nomic-embed-text not installed; mock keyword recall is active'
            : 'Ollama unavailable; semantic recall is disabled',
      },
      evolver: {
        status: evolver.status,
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
    }
    return c.json(envelope(health, context.mode))
  })
}
