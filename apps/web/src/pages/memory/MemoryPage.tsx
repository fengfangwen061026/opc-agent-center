import { useEffect } from 'react'
import { GlassCard } from '@opc/ui'
import { EvolverLogView } from '@/pages/memory/EvolverLogView'
import { MemoryDetail } from '@/pages/memory/MemoryDetail'
import { MemoryList } from '@/pages/memory/MemoryList'
import { MemorySidebar } from '@/pages/memory/MemorySidebar'
import { useMemoryStore } from '@/stores/memoryStore'
import { useSystemHealthStore } from '@/stores/systemHealthStore'

export function MemoryPage() {
  const { health } = useSystemHealthStore()
  const { filter, viewMode, fetchEntries, fetchStats, fetchEvolverLog, selectedId } = useMemoryStore()

  useEffect(() => {
    void fetchStats()
  }, [fetchStats])

  useEffect(() => {
    if (viewMode === 'list') {
      void fetchEntries()
      return
    }

    void fetchEvolverLog()
  }, [fetchEntries, fetchEvolverLog, filter.includeArchived, filter.tags, filter.type, viewMode])

  return (
    <div className={`opc-page opc-memory-page ${selectedId ? 'has-selection' : ''}`}>
      {!health.lancedb.ollamaReachable || !health.lancedb.embeddingModel ? (
        <GlassCard className="opc-memory-offline" variant="soft" padding="sm">
          {health.lancedb.ollamaReachable
            ? 'Ollama 可达，但 nomic-embed-text 未安装；语义搜索使用 mock 关键词召回。'
            : 'Ollama 未运行，语义召回已关闭；Memory CRUD 仍可使用 mock fallback。'}
        </GlassCard>
      ) : null}
      <div className="opc-memory-layout">
        <MemorySidebar />
        {viewMode === 'evolver-log' ? <EvolverLogView /> : <MemoryList />}
        <MemoryDetail />
      </div>
    </div>
  )
}
