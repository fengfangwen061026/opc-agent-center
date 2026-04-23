import { useEffect, useState } from 'react'
import { FolderTree, Inbox, Search } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { GlassCard } from '@opc/ui'
import { NoteViewer } from '@/pages/knowledge/NoteViewer'
import { ReviewQueuePanel } from '@/pages/knowledge/ReviewQueuePanel'
import { VaultTree } from '@/pages/knowledge/VaultTree'
import { useObsidianStore } from '@/stores/obsidianStore'

export function KnowledgePage() {
  const [searchParams] = useSearchParams()
  const {
    status,
    viewMode,
    searchResults,
    fetchStatus,
    fetchTree,
    fetchReviewQueue,
    setViewMode,
    search,
    openNote,
  } = useObsidianStore()
  const [query, setQuery] = useState('')

  useEffect(() => {
    void fetchStatus()
    void fetchTree()
    void fetchReviewQueue()
  }, [fetchReviewQueue, fetchStatus, fetchTree])

  useEffect(() => {
    const view = searchParams.get('view')
    if (view === 'review-queue' || view === 'search' || view === 'tree') {
      setViewMode(view)
    }
  }, [searchParams, setViewMode])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (query.trim()) {
        void search(query)
      }
    }, 300)
    return () => window.clearTimeout(timer)
  }, [query, search])

  return (
    <div className="opc-page opc-knowledge-page">
      {!status?.connected ? (
        <GlassCard className="opc-memory-offline" variant="soft" padding="sm">
          Vault 未连接，以下为缓存内容。
        </GlassCard>
      ) : null}

      <GlassCard className="opc-knowledge-toolbar" variant="strong">
        <div className="opc-toolbar-search">
          <Search />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search vault" />
        </div>
        <div className="opc-segmented-control">
          <button className={viewMode === 'tree' ? 'is-active' : ''} onClick={() => setViewMode('tree')}>
            <FolderTree /> 文件树
          </button>
          <button className={viewMode === 'review-queue' ? 'is-active' : ''} onClick={() => setViewMode('review-queue')}>
            <Inbox /> Review Queue
          </button>
          <button className={viewMode === 'search' ? 'is-active' : ''} onClick={() => setViewMode('search')}>
            <Search /> 搜索结果
          </button>
        </div>
      </GlassCard>

      <div className="opc-knowledge-layout">
        <VaultTree />
        {viewMode === 'review-queue' ? <ReviewQueuePanel /> : null}
        {viewMode === 'search' ? (
          <GlassCard className="opc-search-results" variant="strong">
            <div className="opc-section-header">
              <div>
                <p className="opc-eyebrow">Search</p>
                <h2 className="opc-section-title">{searchResults.length} results</h2>
              </div>
            </div>
            <div className="opc-detail-list">
              {searchResults.map((result) => (
                <button key={result.path} className="opc-search-result" onClick={() => void openNote(result.path)}>
                  <strong>{result.path}</strong>
                  <span>{result.excerpt}</span>
                </button>
              ))}
            </div>
          </GlassCard>
        ) : null}
        {viewMode === 'tree' ? <NoteViewer /> : null}
      </div>
    </div>
  )
}
