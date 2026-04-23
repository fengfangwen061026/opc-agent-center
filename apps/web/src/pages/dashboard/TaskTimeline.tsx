import type { Task } from '@opc/core'
import { GlassCard, StatusPill } from '@opc/ui'

function taskStatusToPill(status: Task['status']) {
  switch (status) {
    case 'completed':
      return { status: 'connected' as const, label: 'Completed' }
    case 'failed':
      return { status: 'error' as const, label: 'Failed' }
    case 'blocked':
      return { status: 'disconnected' as const, label: 'Blocked' }
    case 'running':
      return { status: 'running' as const, label: 'Running' }
    default:
      return { status: 'idle' as const, label: 'Pending' }
  }
}

interface TaskTimelineProps {
  tasks: Task[]
  onSelectTask: (task: Task) => void
}

export function TaskTimeline({ tasks, onSelectTask }: TaskTimelineProps) {
  return (
    <GlassCard className="opc-dashboard-panel" variant="strong">
      <div className="opc-section-header">
        <div>
          <p className="opc-eyebrow">Execution</p>
          <h2 className="opc-section-title">Live Task Timeline</h2>
        </div>
      </div>
      <div className="opc-task-timeline">
        {tasks.map((task) => {
          const pill = taskStatusToPill(task.status)

          return (
            <button
              type="button"
              key={task.id}
              className="opc-task-card"
              onClick={() => onSelectTask(task)}
            >
              <div className="opc-task-card__header">
                <div>
                  <div className="opc-task-card__title">{task.title}</div>
                  <div className="opc-task-card__meta">{task.agentId}</div>
                </div>
                <StatusPill status={pill.status} label={pill.label} />
              </div>
              {task.status === 'running' ? (
                <div className="opc-task-progress">
                  <div className="opc-task-progress__bar" style={{ width: `${task.progress}%` }} />
                </div>
              ) : (
                <div className="opc-task-card__meta">{task.priority.toUpperCase()}</div>
              )}
            </button>
          )
        })}
      </div>
    </GlassCard>
  )
}
