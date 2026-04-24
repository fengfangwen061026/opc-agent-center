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
  const {
    filter,
    viewMode,
    fetchEntries,
    fetchStats,
    fetchEvolverLog,
    selectedId,
    source,
    statusMessage,
  } = useMemoryStore()

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
      {source !== 'live' ? (
        <GlassCard className="opc-memory-offline is-critical" variant="soft" padding="sm">
          {source === 'optimistic-local'
            ? (statusMessage ?? '当前修改仅保存在本地 fallback，尚未真实持久化。')
            : 'Bridge 离线：当前为本地 mock/fallback 数据，修改不会持久化。'}
        </GlassCard>
      ) : null}
      {health.lancedb.source !== 'live-connected' ? (
        <GlassCard className="opc-memory-offline is-critical" variant="soft" padding="sm">
          LanceDB real 未连接：memory 为 mock/fallback，当前数据不是 live 持久化结果。
        </GlassCard>
      ) : null}
      {health.lancedb.semanticSearch === 'keyword-fallback' ? (
        <GlassCard className="opc-memory-offline" variant="soft" padding="sm">
          {health.lancedb.ollamaReachable
            ? 'Ollama 可达，但 embedding 模型不可用；语义搜索已降级为关键词召回。'
            : 'Ollama 离线：语义搜索关闭，使用关键词搜索。'}
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
