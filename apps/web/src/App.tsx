import { lazy, Suspense, useEffect } from 'react'
import type { ReactNode } from 'react'
import type { EvolverEvent } from '@opc/core'
import { BrowserRouter, HashRouter, Route, Routes } from 'react-router-dom'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { PageLoader } from '@/components/PageLoader'
import { AppShell } from '@/layouts/AppShell'
import { useAgentStore } from '@/stores/agentStore'
import { useConversationStore } from '@/stores/conversationStore'
import { useEventStore } from '@/stores/eventStore'
import { useEvolverStore } from '@/stores/evolverStore'
import { useMemoryStore } from '@/stores/memoryStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { useObsidianStore } from '@/stores/obsidianStore'
import { useSkillStore } from '@/stores/skillStore'
import { useSystemHealthStore } from '@/stores/systemHealthStore'
import { useTaskStore } from '@/stores/taskStore'

const ChatPage = lazy(() => import('@/pages/chat/ChatPage').then((module) => ({ default: module.ChatPage })))
const CommandCenterPage = lazy(() =>
  import('@/pages/CommandCenterPage').then((module) => ({ default: module.CommandCenterPage })),
)
const KnowledgePage = lazy(() =>
  import('@/pages/knowledge/KnowledgePage').then((module) => ({ default: module.KnowledgePage })),
)
const MemoryPage = lazy(() => import('@/pages/memory/MemoryPage').then((module) => ({ default: module.MemoryPage })))
const NotificationCenterPage = lazy(() =>
  import('@/pages/notifications/NotificationCenterPage').then((module) => ({ default: module.NotificationCenterPage })),
)
const PlaceholderPage = lazy(() =>
  import('@/pages/PlaceholderPage').then((module) => ({ default: module.PlaceholderPage })),
)
const SettingsPage = lazy(() => import('@/pages/settings/SettingsPage').then((module) => ({ default: module.SettingsPage })))
const SkillCenterPage = lazy(() =>
  import('@/pages/skills/SkillCenterPage').then((module) => ({ default: module.SkillCenterPage })),
)
const SkillDetailPage = lazy(() =>
  import('@/pages/skills/SkillDetailPage').then((module) => ({ default: module.SkillDetailPage })),
)

function page(name: string, element: ReactNode) {
  return <ErrorBoundary name={name}>{element}</ErrorBoundary>
}

export default function App() {
  useEffect(() => {
    void useSystemHealthStore.getState().fetchHealth()
    void useAgentStore.getState().fetchAgents()
    void useTaskStore.getState().fetchTasks()
    void useNotificationStore.getState().fetchNotifications()
    void useConversationStore.getState().fetchConversations()
    void useSkillStore.getState().fetchSkills()
    void useMemoryStore.getState().fetchStats()
    void useEvolverStore.getState().fetchStatus()
    void useEvolverStore.getState().fetchPendingPatches()
    void useObsidianStore.getState().fetchStatus()
    void useObsidianStore.getState().fetchReviewQueue()

    const stopEvents = useEventStore.getState().subscribe()
    const stopTaskSync = useTaskStore.getState().subscribeToEvents()
    const stopConversationSync = useEventStore.subscribe((state, previous) => {
      const latest = state.events[state.events.length - 1]
      if (latest && latest !== previous.events[previous.events.length - 1]) {
        useConversationStore.getState().handleEvent(latest)
        useNotificationStore.getState().handleEvent(latest)
        if (latest.source === 'evolver' && latest.metadata.evolverEvent) {
          useEvolverStore.getState().handleWsEvent(latest.metadata.evolverEvent as EvolverEvent)
        }
        if (latest.type === 'memory.maintenance.completed') {
          void useMemoryStore.getState().fetchEvolverLog()
          void useMemoryStore.getState().fetchEntries()
          void useMemoryStore.getState().fetchStats()
        }
        if (latest.type.startsWith('notification.')) {
          void useNotificationStore.getState().fetchNotifications()
        }
      }
    })

    return () => {
      stopConversationSync()
      stopTaskSync()
      stopEvents()
    }
  }, [])

  const Router = window.location.protocol === 'file:' ? HashRouter : BrowserRouter

  return (
    <Router>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={page('Dashboard', <CommandCenterPage />)} />
            <Route path="/chat" element={page('Chat', <ChatPage />)} />
            <Route path="/chat/unmatched" element={page('Chat', <ChatPage unmatched />)} />
            <Route
              path="/agents"
              element={page(
                'Agents',
                <PlaceholderPage title="Agents" description="Agent management surfaces start from the dashboard graph." />,
              )}
            />
            <Route path="/skills" element={page('Skills', <SkillCenterPage />)} />
            <Route path="/skills/:name" element={page('Skill Detail', <SkillDetailPage />)} />
            <Route path="/memory" element={page('Memory', <MemoryPage />)} />
            <Route path="/notifications" element={page('Notifications', <NotificationCenterPage />)} />
            <Route path="/knowledge" element={page('Knowledge', <KnowledgePage />)} />
            <Route path="/settings" element={page('Settings', <SettingsPage />)} />
          </Route>
        </Routes>
      </Suspense>
    </Router>
  )
}
