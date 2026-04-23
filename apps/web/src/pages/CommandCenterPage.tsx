import { useMemo, useState } from 'react'
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
import { useNotificationStore } from '@/stores/notificationStore'
import { useSystemHealthStore } from '@/stores/systemHealthStore'
import { useTaskStore } from '@/stores/taskStore'

type ServiceSelection = 'service-lancedb' | 'service-obsidian' | undefined

export function CommandCenterPage() {
  const { agents, selectedAgentId, selectAgent, clearSelectedAgent } = useAgentStore()
  const { health } = useSystemHealthStore()
  const { notifications, unreadCount, approvalCount } = useNotificationStore()
  const { events } = useEventStore()
  const { tasks } = useTaskStore()
  const [selectedTask, setSelectedTask] = useState<Task | undefined>()
  const [selectedService, setSelectedService] = useState<ServiceSelection>()

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
        status: health.lancedb.status,
      }
    }

    if (selectedService === 'service-obsidian') {
      return {
        title: 'Obsidian',
        subtitle: 'Knowledge vault',
        status: health.obsidian.status,
      }
    }

    return undefined
  }, [health.lancedb.status, health.obsidian.status, selectedService])

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
          value={health.evolver.status}
          subtitle={`${pendingPatchCount} pending patches · next ${new Date(health.evolver.nextRun ?? '').toLocaleString()}`}
          accentColor="var(--opc-lavender)"
          icon={<Sparkles />}
        />
        <MetricCard
          title="LanceDB"
          value={health.lancedb.status}
          subtitle={`${health.memory.totalEntries} memory entries`}
          accentColor="var(--opc-mint)"
          icon={<Database />}
        />
        <MetricCard
          title="Obsidian"
          value={health.obsidian.status}
          subtitle="482 vault files"
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
