import { create } from 'zustand'
import type { Notification, NotificationFilter, SystemEvent } from '@opc/core'
import { fetchBridge } from '@/lib/bridgeClient'
import notificationData from '../../../../data/mock/notifications.json'

interface NotificationStore {
  notifications: Notification[]
  unreadCount: number
  approvalCount: number
  pendingCount: number
  markRead: (id: string) => void
  fetchNotifications: (filter?: NotificationFilter) => Promise<void>
  actionNotification: (id: string, action: string) => Promise<void>
  upsertNotification: (notification: Notification) => void
  bulkArchive: (ids: string[]) => void
  resolveSkillPatch: (skillName: string, action: 'approve' | 'reject') => void
  handleEvent: (event: SystemEvent) => void
}

function deriveCounts(notifications: Notification[]) {
  return {
    unreadCount: notifications.filter((item) => !item.read).length,
    approvalCount: notifications.filter((item) => item.actionRequired).length,
    pendingCount: notifications.filter(
      (item) => item.type === 'approval_required' || item.type === 'skill_patch_pending',
    ).length,
  }
}

const notifications = notificationData as unknown as Notification[]

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications,
  ...deriveCounts(notifications),
  markRead: (id) =>
    set((state) => {
      const next = state.notifications.map((item) =>
        item.id === id
          ? {
              ...item,
              read: true,
              status: item.status === 'unread' ? 'read' : item.status,
            }
          : item,
      )

      return {
        notifications: next,
        ...deriveCounts(next),
      }
    }),
  fetchNotifications: async (filter) => {
    try {
      const params = new URLSearchParams()
      if (filter?.status) params.set('status', filter.status)
      if (filter?.type) params.set('type', filter.type)
      const suffix = params.toString() ? `?${params.toString()}` : ''
      const next = await fetchBridge<Notification[]>(`/api/notifications${suffix}`)
      set({ notifications: next, ...deriveCounts(next) })
    } catch {
      set({ notifications, ...deriveCounts(notifications) })
    }
  },
  actionNotification: async (id, action) => {
    set((state) => {
      const next = state.notifications.map((item) =>
        item.id === id
          ? {
              ...item,
              read: true,
              actionRequired: false,
              status: (action === 'approve'
                ? 'done'
                : action === 'archive' || action === 'reject'
                  ? 'dismissed'
                  : 'read') as Notification['status'],
            }
          : item,
      )
      return { notifications: next, ...deriveCounts(next) }
    })

    try {
      await fetchBridge(`/api/notifications/${id}/action`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      })
    } catch {
      // Optimistic local state is kept as mock fallback.
    }
  },
  upsertNotification: (notification) =>
    set((state) => {
      const exists = state.notifications.some((item) => item.id === notification.id)
      const next = exists
        ? state.notifications.map((item) => (item.id === notification.id ? notification : item))
        : [notification, ...state.notifications]

      return { notifications: next, ...deriveCounts(next) }
    }),
  bulkArchive: (ids) =>
    set((state) => {
      const selected = new Set(ids)
      const next = state.notifications.map((item) =>
        selected.has(item.id) ? { ...item, read: true, actionRequired: false, status: 'dismissed' as const } : item,
      )
      return { notifications: next, ...deriveCounts(next) }
    }),
  resolveSkillPatch: (skillName, action) =>
    set((state) => {
      const slug = skillName.toLowerCase().replaceAll(' ', '-')
      const next = state.notifications.map((item) =>
        item.type === 'skill_patch_pending' &&
        (item.skillId === skillName ||
          item.skillId === slug ||
          item.skillId === `skill-${slug}` ||
          item.payload.skillName === skillName)
          ? {
              ...item,
              read: true,
              actionRequired: false,
              status: action === 'approve' ? ('done' as const) : ('dismissed' as const),
            }
          : item,
      )
      return { notifications: next, ...deriveCounts(next) }
    }),
  handleEvent: (event) => {
    if (event.type !== 'skill.patch.submitted') {
      return
    }

    const patch = event.metadata.evolverEvent as
      | { type: 'skill.patch.submitted'; skillName: string; patch: { id: string; summary: string; reason: string; scoreBefore?: number; scoreAfter?: number; diff?: { before: string; after: string } } }
      | undefined

    if (!patch) {
      return
    }

    useNotificationStore.getState().upsertNotification({
      id: `notification-${patch.patch.id}`,
      type: 'skill_patch_pending',
      title: `Patch pending: ${patch.skillName}`,
      message: patch.patch.summary,
      severity: 'warning',
      status: 'unread',
      priority: 'high',
      read: false,
      actionRequired: true,
      createdAt: new Date().toISOString(),
      skillId: patch.skillName,
      payload: {
        skillName: patch.skillName,
        patchId: patch.patch.id,
        reason: patch.patch.reason,
        scoreBefore: patch.patch.scoreBefore,
        scoreAfter: patch.patch.scoreAfter,
        before: patch.patch.diff?.before,
        after: patch.patch.diff?.after,
      },
      actions: [
        { id: 'approve', label: '批准', variant: 'primary' },
        { id: 'reject', label: '拒绝', variant: 'danger' },
      ],
    })
  },
}))
