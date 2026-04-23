import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Task } from '@opc/core'
import {
  Bell,
  BookOpen,
  Cable,
  Cpu,
  Database,
  Sparkles,
} from 'lucide-react'
import { MetricCard } from '@opc/ui'
import { TaskCapsuleDrawer } from '@/components/capsule/TaskCapsuleDrawer'
import { DetailDrawer } from '@/components/DetailDrawer'
import { AgentConstellation, AgentDrawerContent, ServiceDrawerContent } from '@/pages/dashboard/AgentConstellation'
import { TaskTimeline } from '@/pages/dashboard/TaskTimeline'
import { useAgentStore } from '@/stores/agentStore'
import { useEventStore } from '@/stores/eventStore'
import { useEvolverStore } from '@/stores/evolverStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { useSystemHealthStore } from '@/stores/systemHealthStore'
import { useTaskStore } from '@/stores/taskStore'

type ServiceSelection = 'service-lancedb' | 'service-obsidian' | undefined

export function CommandCenterPage() {
  const navigate = useNavigate()
  const { agents, selectedAgentId, selectAgent, clearSelectedAgent } = useAgentStore()
  const { health } = useSystemHealthStore()
  const { status: evolverStatus } = useEvolverStore()
  const { notifications, unreadCount, approvalCount } = useNotificationStore()
  const { events } = useEventStore()
  const { tasks } = useTaskStore()
  const [selectedTask, setSelectedTask] = useState<Task | undefined>()
  const [selectedService, setSelectedService] = useState<ServiceSelection>()
  const [now] = useState(() => Date.now())

  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId)
  const totalCodingSessions = agents
    .filter((agent) => agent.layer === 'coding')
    .reduce((sum, agent) => sum + (agent.metrics?.activeSessions ?? 0), 0)

  const onlineAgents = agents.filter((agent) => agent.status !== 'disconnected' && agent.status !== 'error').length

  const pendingPatchCount = notifications.filter((item) => item.type === 'skill_patch_pending').length

  const serviceContent = useMemo(() => {
    if (selectedService === 'service-lancedb') {
      return {
        title: 'LanceDB',
        subtitle: 'Memory service',
        status: health.lancedb.connected ? ('connected' as const) : ('disconnected' as const),
      }
    }

    if (selectedService === 'service-obsidian') {
      return {
        title: 'Obsidian',
        subtitle: 'Knowledge vault',
        status: health.obsidian.connected ? ('connected' as const) : ('disconnected' as const),
      }
    }

    return undefined
  }, [health.lancedb.connected, health.obsidian.connected, selectedService])

  const nextRun = evolverStatus?.nextRun ?? health.evolver.nextRun
  const daysUntilNextRun = nextRun
    ? Math.max(0, Math.ceil((new Date(nextRun).getTime() - now) / (24 * 60 * 60 * 1000)))
    : 0
  const pendingPatches = evolverStatus?.pendingPatches ?? pendingPatchCount
  const weeklyAutoPatches = evolverStatus?.weeklyAutoPatches ?? health.evolver.weeklyAutoPatches

  return (
    <div className="opc-page opc-dashboard-page">
      <section className="opc-metric-grid">
        <MetricCard
          title="Gateway"
          value={health.gateway.status}
          subtitle={`${onlineAgents} online agents`}
          accentColor="var(--opc-sky)"
          icon={<Cable />}
        />
        <MetricCard
          title="Evolver"
          value={
            <span className={evolverStatus?.status === 'running' ? 'opc-pulse-value' : ''}>
              {evolverStatus?.status ?? health.evolver.status}
            </span>
          }
          subtitle={
            <button
              className="opc-metric-link"
              onClick={() => navigate('/notifications?type=skill_patch_pending')}
            >
              {pendingPatches} pending · {weeklyAutoPatches} auto this week · {daysUntilNextRun} 天后
            </button>
          }
          accentColor="var(--opc-lavender)"
          icon={<Sparkles />}
        />
        <MetricCard
          title="LanceDB"
          value={health.lancedb.connected ? 'connected' : 'offline'}
          subtitle={`${health.lancedb.totalEntries} memory entries`}
          accentColor="var(--opc-mint)"
          icon={<Database />}
        />
        <MetricCard
          title="Obsidian"
          value={health.obsidian.connected ? 'connected' : 'offline'}
          subtitle={`${health.obsidian.fileCount} vault files`}
          accentColor="var(--opc-lemon)"
          icon={<BookOpen />}
        />
        <MetricCard
          title="Coding Agents"
          value={totalCodingSessions}
          subtitle="active sessions"
          accentColor="var(--opc-coral)"
          icon={<Cpu />}
        />
        <MetricCard
          title="Notifications"
          value={unreadCount}
          subtitle={`${approvalCount} pending approvals`}
          accentColor="var(--opc-peach)"
          icon={<Bell />}
        />
      </section>

      <section className="opc-dashboard-main">
        <AgentConstellation
          agents={agents}
          health={health}
          onSelectNode={(nodeId) => {
            if (nodeId.startsWith('service-')) {
              clearSelectedAgent()
              setSelectedService(nodeId as ServiceSelection)
              return
            }

            setSelectedService(undefined)
            selectAgent(nodeId)
          }}
        />
      </section>

      <section className="opc-dashboard-bottom">
        <TaskTimeline tasks={tasks} onSelectTask={setSelectedTask} />
      </section>

      <DetailDrawer
        open={Boolean(selectedAgent)}
        title={selectedAgent?.displayName ?? ''}
        subtitle={selectedAgent?.description}
        onClose={clearSelectedAgent}
      >
        {selectedAgent ? <AgentDrawerContent agent={selectedAgent} events={events} /> : null}
      </DetailDrawer>

      <DetailDrawer
        open={Boolean(serviceContent)}
        title={serviceContent?.title ?? ''}
        subtitle={serviceContent?.subtitle}
        onClose={() => setSelectedService(undefined)}
      >
        {serviceContent ? (
          <ServiceDrawerContent
            title={serviceContent.title}
            subtitle={serviceContent.subtitle}
            status={serviceContent.status}
            events={events}
          />
        ) : null}
      </DetailDrawer>

      <TaskCapsuleDrawer task={selectedTask} onClose={() => setSelectedTask(undefined)} />
    </div>
  )
}
