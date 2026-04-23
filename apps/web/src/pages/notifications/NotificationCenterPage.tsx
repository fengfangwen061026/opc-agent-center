import type { CSSProperties } from 'react'
import { useMemo, useState } from 'react'
import type { Notification, NotificationType, Task } from '@opc/core'
import { Archive, Check, ExternalLink, Filter, X } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { GlassCard, LiquidButton, StatusPill } from '@opc/ui'
import { TaskCapsuleDrawer } from '@/components/capsule/TaskCapsuleDrawer'
import { useNotificationStore } from '@/stores/notificationStore'
import { useTaskStore } from '@/stores/taskStore'

const notificationTypes: NotificationType[] = [
  'approval_required',
  'skill_patch_pending',
  'skill_auto_patched',
  'memory_maintenance_report',
  'knowledge_capture',
  'task_report',
  'evolver_error',
]

type StatusFilter = 'all' | 'pending' | 'done' | 'dismissed'
type PriorityFilter = 'all' | 'high' | 'medium' | 'low'

function leftAccent(type: Notification['type']) {
  switch (type) {
    case 'approval_required':
      return 'var(--opc-danger)'
    case 'skill_patch_pending':
      return 'var(--opc-peach)'
    case 'skill_auto_patched':
      return 'var(--opc-sky)'
    case 'memory_maintenance_report':
      return 'var(--opc-mint)'
    case 'knowledge_capture':
      return 'var(--opc-success)'
    case 'task_report':
      return 'var(--opc-lavender)'
    default:
      return 'var(--opc-warning)'
  }
}

function notificationPriority(notification: Notification): Notification['priority'] {
  if (notification.priority) return notification.priority
  if (notification.severity === 'error') return 'high'
  if (notification.severity === 'warning') return 'medium'
  return 'low'
}

function DiffPreview({ notification }: { notification: Notification }) {
  const before = String(notification.payload.before ?? notification.payload.patchBefore ?? 'Previous prompt wording')
  const after = String(notification.payload.after ?? notification.payload.patchAfter ?? notification.payload.patchSummary ?? 'Updated prompt wording')

  return (
    <details className="opc-diff-preview">
      <summary>Diff 预览</summary>
      <div className="opc-diff-line is-remove">- {before}</div>
      <div className="opc-diff-line is-add">+ {after}</div>
    </details>
  )
}

function NotificationCard({
  notification,
  checked,
  onChecked,
  onAction,
  onTask,
}: {
  notification: Notification
  checked: boolean
  onChecked: (checked: boolean) => void
  onAction: (action: string) => void
  onTask: (taskId: string) => void
}) {
  const priority = notificationPriority(notification)

  return (
    <GlassCard
      className="opc-notification-card"
      style={{ '--opc-card-accent': leftAccent(notification.type) } as CSSProperties}
      variant="strong"
    >
      <div className="opc-notification-card__accent" />
      <div className="opc-notification-card__body">
        <div className="opc-notification-card__top">
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => onChecked(event.target.checked)}
            aria-label={`Select ${notification.title}`}
          />
          <div>
            <h2>{notification.title}</h2>
            <p>{notification.message}</p>
          </div>
          <StatusPill status={priority === 'high' ? 'error' : priority === 'medium' ? 'running' : 'idle'} label={priority} />
        </div>

        {notification.type === 'approval_required' ? (
          <div className="opc-special-block">
            <strong>{String(notification.payload.action ?? 'Approval action')}</strong>
            <span>Agent: {notification.agentId ?? 'unknown'} · Risk: {String(notification.payload.riskLevel ?? 'S3')}</span>
          </div>
        ) : null}

        {notification.type === 'skill_patch_pending' ? (
          <div className="opc-special-block">
            <span>
              {String(notification.payload.skillName ?? notification.skillId)} · v{String(notification.payload.version ?? 'current')}
            </span>
            <span>
              Eval {String(notification.payload.scoreBefore ?? '--')} → {String(notification.payload.scoreAfter ?? '--')}
            </span>
            <DiffPreview notification={notification} />
          </div>
        ) : null}

        {notification.type === 'skill_auto_patched' ? (
          <div className="opc-special-block">
            <span>只读记录：{String(notification.payload.changedFields ?? 'description, tags')}</span>
          </div>
        ) : null}

        {notification.type === 'memory_maintenance_report' ? (
          <div className="opc-special-block">
            <span>
              合并 {String(notification.payload.merged ?? 0)} 条 · 清理 {String(notification.payload.archived ?? 0)} 条 ·
              本周新增 {String(notification.payload.created ?? 12)} 条
            </span>
          </div>
        ) : null}

        {notification.type === 'knowledge_capture' ? (
          <div className="opc-special-block">
            <strong>{String(notification.payload.noteTitle ?? notification.title)}</strong>
            <span>{String(notification.payload.sourceUrl ?? 'local capture')}</span>
            <span>{String(notification.payload.summary ?? notification.message)}</span>
          </div>
        ) : null}

        {notification.type === 'evolver_error' ? (
          <details className="opc-special-block">
            <summary>{String(notification.payload.summary ?? notification.message)}</summary>
            <p>{String(notification.payload.lastError ?? notification.payload.error ?? notification.message)}</p>
          </details>
        ) : null}

        <div className="opc-notification-actions">
          {notification.type === 'skill_patch_pending' && notification.skillId ? (
            <LiquidButton variant="ghost" icon={<ExternalLink />}>
              <Link to={`/skills/${encodeURIComponent(notification.skillId)}?tab=evolution`}>查看完整 diff</Link>
            </LiquidButton>
          ) : null}
          {notification.type === 'memory_maintenance_report' ? (
            <LiquidButton variant="ghost">
              <Link to="/memory">查看 Memory 面板</Link>
            </LiquidButton>
          ) : null}
          {notification.type === 'knowledge_capture' ? (
            <LiquidButton variant="ghost">
              <Link to="/knowledge?view=review-queue">打开 Review Queue</Link>
            </LiquidButton>
          ) : null}
          {notification.type === 'task_report' && notification.taskId ? (
            <LiquidButton variant="ghost" onClick={() => onTask(notification.taskId!)}>
              查看 Capsule
            </LiquidButton>
          ) : null}
          {notification.actionRequired ? (
            <>
              <LiquidButton icon={<Check />} onClick={() => onAction('approve')}>
                批准
              </LiquidButton>
              <LiquidButton variant="danger" icon={<X />} onClick={() => onAction('reject')}>
                拒绝
              </LiquidButton>
              <LiquidButton variant="ghost" onClick={() => onAction('explain')}>
                要求说明
              </LiquidButton>
            </>
          ) : (
            <LiquidButton variant="ghost" onClick={() => onAction('read')}>
              查看详情
            </LiquidButton>
          )}
        </div>
      </div>
    </GlassCard>
  )
}

export function NotificationCenterPage() {
  const [searchParams] = useSearchParams()
  const { notifications, actionNotification, bulkArchive } = useNotificationStore()
  const { tasks } = useTaskStore()
  const [status, setStatus] = useState<StatusFilter>('all')
  const [priority, setPriority] = useState<PriorityFilter>('all')
  const initialType = searchParams.get('type') as NotificationType | null
  const [types, setTypes] = useState<NotificationType[]>(initialType && notificationTypes.includes(initialType) ? [initialType] : [])
  const [range, setRange] = useState<'today' | 'week' | 'all'>('all')
  const [selected, setSelected] = useState<string[]>([])
  const [selectedTask, setSelectedTask] = useState<Task | undefined>()
  const [now] = useState(() => Date.now())

  const filtered = useMemo(() => {
    return notifications.filter((notification) => {
      if (status === 'pending' && !notification.actionRequired) return false
      if (status === 'done' && notification.status !== 'done') return false
      if (status === 'dismissed' && notification.status !== 'dismissed') return false
      if (types.length > 0 && !types.includes(notification.type)) return false
      if (priority !== 'all' && notificationPriority(notification) !== priority) return false
      const created = new Date(notification.createdAt).getTime()
      if (range === 'today' && now - created > 24 * 60 * 60 * 1000) return false
      if (range === 'week' && now - created > 7 * 24 * 60 * 60 * 1000) return false
      return true
    })
  }, [notifications, now, priority, range, status, types])

  const toggleType = (type: NotificationType) => {
    setTypes((current) => (current.includes(type) ? current.filter((item) => item !== type) : [...current, type]))
  }

  const allSelected = filtered.length > 0 && filtered.every((item) => selected.includes(item.id))

  return (
    <div className="opc-page opc-notifications-page">
      <GlassCard className="opc-filter-rail" variant="strong">
        <p className="opc-eyebrow">Filters</p>
        <h1 className="opc-section-title">Notification Center</h1>
        <label>
          状态
          <select className="opc-field" value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}>
            <option value="all">全部</option>
            <option value="pending">待处理</option>
            <option value="done">已完成</option>
            <option value="dismissed">已忽略</option>
          </select>
        </label>
        <label>
          优先级
          <select className="opc-field" value={priority} onChange={(event) => setPriority(event.target.value as PriorityFilter)}>
            <option value="all">全部</option>
            <option value="high">high</option>
            <option value="medium">medium</option>
            <option value="low">low</option>
          </select>
        </label>
        <label>
          时间
          <select className="opc-field" value={range} onChange={(event) => setRange(event.target.value as 'today' | 'week' | 'all')}>
            <option value="today">今天</option>
            <option value="week">本周</option>
            <option value="all">全部</option>
          </select>
        </label>
        <div className="opc-type-filter">
          {notificationTypes.map((type) => (
            <label key={type}>
              <input type="checkbox" checked={types.includes(type)} onChange={() => toggleType(type)} />
              {type}
            </label>
          ))}
        </div>
      </GlassCard>

      <section className="opc-notification-main">
        <GlassCard className="opc-notification-toolbar" variant="strong">
          <label>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(event) =>
                setSelected(event.target.checked ? filtered.map((notification) => notification.id) : [])
              }
            />
            全选
          </label>
          <LiquidButton
            variant="ghost"
            icon={<Archive />}
            onClick={() => {
              bulkArchive(selected)
              setSelected([])
            }}
          >
            批量归档
          </LiquidButton>
          <span className="opc-toolbar-count">
            <Filter /> {filtered.length}
          </span>
        </GlassCard>

        <div className="opc-notification-list" data-testid="notification-list">
          {filtered.map((notification) => (
            <NotificationCard
              key={notification.id}
              notification={notification}
              checked={selected.includes(notification.id)}
              onChecked={(checked) =>
                setSelected((current) =>
                  checked ? [...current, notification.id] : current.filter((id) => id !== notification.id),
                )
              }
              onAction={(action) => void actionNotification(notification.id, action)}
              onTask={(taskId) => setSelectedTask(tasks.find((task) => task.id === taskId))}
            />
          ))}
        </div>
      </section>

      <TaskCapsuleDrawer task={selectedTask} onClose={() => setSelectedTask(undefined)} />
    </div>
  )
}
