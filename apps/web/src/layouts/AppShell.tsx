import { useMemo } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  Bell,
  BookOpen,
  Brain,
  Cpu,
  LayoutDashboard,
  MessageSquare,
  Search,
  Settings,
  Shell,
  Sparkles,
  Zap,
} from 'lucide-react'
import { ConnectionBadge, GlassCard, LiquidButton, StatusPill } from '@opc/ui'
import type { StatusPillStatus } from '@opc/ui'
import { OfflineBanner } from '@/components/OfflineBanner'
import { useEventStore } from '@/stores/eventStore'
import { useEvolverStore } from '@/stores/evolverStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { useObsidianStore } from '@/stores/obsidianStore'
import { useSystemHealthStore } from '@/stores/systemHealthStore'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/chat', label: 'Chat', icon: MessageSquare },
  { to: '/agents', label: 'Agents', icon: Cpu },
  { to: '/memory', label: 'Memory', icon: Brain },
  { to: '/skills', label: 'Skills', icon: Zap },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/knowledge', label: 'Knowledge', icon: BookOpen },
  { to: '/settings', label: 'Settings', icon: Settings },
]

function mapConnectionStatus(status: 'connected' | 'disconnected' | 'running' | 'idle' | 'error') {
  return status
}

function mapEvolverStatus(status: 'idle' | 'running' | 'error' | 'disabled') {
  return status === 'disabled' ? 'disconnected' : status
}

export function AppShell() {
  const { health } = useSystemHealthStore()
  const { status: evolverStatus } = useEvolverStore()
  const { notifications, approvalCount } = useNotificationStore()
  const { reviewQueue } = useObsidianStore()
  const { events } = useEventStore()

  const pendingApprovalNotifications = notifications.filter((item) => item.actionRequired).slice(0, 3)
  const recentEvents = events.slice(-5).reverse()

  const connectionBadges = useMemo<Array<{ label: string; status: StatusPillStatus; detail?: string }>>(
    () => [
      { label: 'Gateway', status: mapConnectionStatus(health.gateway.status), detail: health.gateway.message },
      {
        label: `LanceDB ${health.lancedb.totalEntries}`,
        status: health.lancedb.connected ? 'connected' : 'disconnected',
        detail: health.lancedb.embeddingModel
          ? `${health.lancedb.embeddingModel} ready`
          : 'Mock keyword recall active',
      },
      { label: 'Ollama', status: mapConnectionStatus(health.ollama.status), detail: health.ollama.message },
      {
        label: `Obsidian ${health.obsidian.fileCount}`,
        status: health.obsidian.connected ? 'connected' : 'disconnected',
        detail: health.obsidian.vaultName ?? 'Mock vault cache',
      },
      {
        label: 'Evolver',
        status: mapEvolverStatus(evolverStatus?.status ?? health.evolver.status),
        detail: `${evolverStatus?.pendingPatches ?? health.evolver.pendingPatches} pending patches`,
      },
    ],
    [
      evolverStatus?.pendingPatches,
      evolverStatus?.status,
      health.evolver.pendingPatches,
      health.evolver.status,
      health.gateway.message,
      health.gateway.status,
      health.lancedb.connected,
      health.lancedb.embeddingModel,
      health.lancedb.totalEntries,
      health.obsidian.connected,
      health.obsidian.fileCount,
      health.obsidian.vaultName,
      health.ollama.message,
      health.ollama.status,
    ],
  )

  return (
    <div className="opc-app-shell">
      <div className="opc-app-bg" />
      <header className="opc-topbar" data-testid="topbar">
        <div className="opc-topbar__brand">
          <div className="opc-brand-mark">
            <Shell />
          </div>
          <div className="opc-brand-copy">
            <span className="opc-brand-title">OPC</span>
            <span className="opc-brand-subtitle">Agent Center</span>
          </div>
        </div>

        <GlassCard className="opc-topbar__search" variant="strong" padding="sm">
          <Search aria-hidden="true" />
          <input type="search" placeholder="Search agents, tasks, memories" aria-label="Global search" />
        </GlassCard>

        <div className="opc-topbar__status">
          {connectionBadges.map((badge) => (
            <ConnectionBadge
              key={badge.label}
              label={badge.label}
              status={badge.status}
              detail={badge.detail}
            />
          ))}
        </div>
      </header>

      <div className="opc-shell-body">
        <nav className="opc-leftnav" aria-label="Primary" data-testid="left-nav">
          {navItems.map((item) => {
            const Icon = item.icon

            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => `opc-nav-link ${isActive ? 'is-active' : ''}`}
                data-tooltip={item.label}
              >
                <Icon aria-hidden="true" />
                {item.label === 'Memory' && health.lancedb.totalEntries > 0 ? (
                  <span className="opc-nav-badge opc-nav-badge--muted">{health.lancedb.totalEntries}</span>
                ) : null}
                {item.label === 'Notifications' && approvalCount > 0 ? (
                  <span className="opc-nav-badge">{approvalCount}</span>
                ) : null}
                {item.label === 'Knowledge' && reviewQueue.length > 0 ? (
                  <span className="opc-nav-badge">{reviewQueue.length}</span>
                ) : null}
              </NavLink>
            )
          })}
        </nav>

        <main className="opc-main-workspace">
          <OfflineBanner />
          <Outlet />
        </main>

        <aside className="opc-right-rail">
          <GlassCard className="opc-rail-panel" variant="strong">
            <div className="opc-rail-panel__header">
              <div>
                <p className="opc-eyebrow">Review Queue</p>
                <h2 className="opc-section-title">Pending Approvals</h2>
              </div>
            </div>
            <div className="opc-rail-list">
              {pendingApprovalNotifications.map((item) => (
                <div key={item.id} className="opc-rail-list__item">
                  <div className="opc-rail-list__title">{item.title}</div>
                  <div className="opc-rail-list__copy">{item.message}</div>
                </div>
              ))}
              {notifications.filter((item) => item.actionRequired).length > 3 ? (
                <LiquidButton variant="ghost">查看全部</LiquidButton>
              ) : null}
            </div>
          </GlassCard>

          <GlassCard className="opc-rail-panel">
            <div className="opc-rail-panel__header">
              <div>
                <p className="opc-eyebrow">Evolution</p>
                <h2 className="opc-section-title">Evolver Status</h2>
              </div>
              <Sparkles className="opc-rail-icon" />
            </div>
            <div className="opc-rail-status">
              <StatusPill status={mapEvolverStatus(evolverStatus?.status ?? health.evolver.status)} />
              <p className="opc-rail-copy">
                {evolverStatus?.pendingPatches ?? health.evolver.pendingPatches} pending · next{' '}
                {new Date(evolverStatus?.nextRun ?? health.evolver.nextRun ?? '').toLocaleString()}
              </p>
            </div>
          </GlassCard>

          <GlassCard className="opc-rail-panel">
            <div className="opc-rail-panel__header">
              <div>
                <p className="opc-eyebrow">Realtime</p>
                <h2 className="opc-section-title">Recent Events</h2>
              </div>
            </div>
            <div className="opc-event-feed">
              {recentEvents.map((event) => (
                <div key={event.id} className="opc-event-item">
                  <div className="opc-event-item__title">{event.title}</div>
                  <div className="opc-event-item__copy">{event.message}</div>
                </div>
              ))}
            </div>
          </GlassCard>
        </aside>
      </div>

      <nav className="opc-mobile-tabbar" aria-label="Mobile navigation">
        {navItems.map((item) => {
          const Icon = item.icon

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `opc-mobile-tab ${isActive ? 'is-active' : ''}`}
            >
              <Icon aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}
