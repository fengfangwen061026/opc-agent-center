import { useEffect } from 'react'
import type { EvolverEvent } from '@opc/core'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/layouts/AppShell'
import { PlaceholderPage } from '@/pages/PlaceholderPage'
import { ChatPage } from '@/pages/chat/ChatPage'
import { CommandCenterPage } from '@/pages/CommandCenterPage'
import { MemoryPage } from '@/pages/memory/MemoryPage'
import { NotificationCenterPage } from '@/pages/notifications/NotificationCenterPage'
import { SettingsPage } from '@/pages/settings/SettingsPage'
import { SkillCenterPage } from '@/pages/skills/SkillCenterPage'
import { SkillDetailPage } from '@/pages/skills/SkillDetailPage'
import { useAgentStore } from '@/stores/agentStore'
import { useConversationStore } from '@/stores/conversationStore'
import { useEventStore } from '@/stores/eventStore'
import { useEvolverStore } from '@/stores/evolverStore'
import { useMemoryStore } from '@/stores/memoryStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { useSkillStore } from '@/stores/skillStore'
import { useSystemHealthStore } from '@/stores/systemHealthStore'
import { useTaskStore } from '@/stores/taskStore'

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

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<CommandCenterPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/chat/unmatched" element={<ChatPage unmatched />} />
          <Route
            path="/agents"
            element={<PlaceholderPage title="Agents" description="Agent management surfaces start from the dashboard graph." />}
          />
          <Route path="/skills" element={<SkillCenterPage />} />
          <Route path="/skills/:name" element={<SkillDetailPage />} />
          <Route path="/memory" element={<MemoryPage />} />
          <Route path="/notifications" element={<NotificationCenterPage />} />
          <Route
            path="/knowledge"
            element={<PlaceholderPage title="Knowledge" description="Knowledge capture remains mock-first until the Obsidian adapter lands." />}
          />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
