import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type {
  Agent,
  Conversation,
  ConversationMessage,
  Notification,
  NotificationFilter,
  SendMessageInput,
  Skill,
  SkillDetail,
  SkillEvalResult,
  SkillUpdateInput,
  SystemEvent,
  SystemHealth,
  Task,
} from '@opc/core'
import {
  AgentListSchema,
  ConversationListSchema,
  NotificationListSchema,
  SkillDetailSchema,
  SkillEvalResultSchema,
  SkillListSchema,
  SystemEventListSchema,
  SystemHealthSchema,
  TaskListSchema,
} from '@opc/core'
import type { OpenClawAdapter } from './OpenClawAdapter'

const repoRoot = resolve(process.cwd(), '../..')
const mockRoot = resolve(repoRoot, 'data/mock')

async function readMock<T>(fileName: string): Promise<T> {
  return JSON.parse(await readFile(resolve(mockRoot, fileName), 'utf8')) as T
}

function nowIso() {
  return new Date().toISOString()
}

function createExecutionHistory(skill: Skill) {
  return Array.from({ length: 20 }, (_, index) => ({
    id: `${skill.id}-run-${index + 1}`,
    timestamp: new Date(Date.now() - index * 42 * 60 * 1000).toISOString(),
    source: index % 3 === 0 ? 'chat' : index % 3 === 1 ? 'dashboard' : 'cron',
    status: index % 7 === 0 ? ('fail' as const) : ('success' as const),
    durationMs: 520 + index * 31,
    error: index % 7 === 0 ? 'Mock adapter simulated a recoverable failure.' : undefined,
  }))
}

function createEvalResult(skillId: string, score = 0.84): SkillEvalResult {
  const completedAt = nowIso()
  const startedAt = new Date(Date.now() - 2000).toISOString()

  return SkillEvalResultSchema.parse({
    id: `eval-${skillId}-${Date.now()}`,
    skillId,
    startedAt,
    completedAt,
    score,
    judgeSummary: 'Mock Evolver judge found the skill usable with minor prompt improvements.',
    cases: [
      {
        id: `${skillId}-case-1`,
        input: 'Nominal user request with enough context',
        expected: 'Returns a scoped, actionable result',
        passed: true,
        judgeComment: 'Output was complete and aligned with the skill contract.',
      },
      {
        id: `${skillId}-case-2`,
        input: 'Ambiguous request that needs clarification',
        expected: 'Asks a concise clarifying question',
        passed: score > 0.72,
        judgeComment: score > 0.72 ? 'Handled ambiguity cleanly.' : 'Needs stronger clarification behavior.',
      },
      {
        id: `${skillId}-case-3`,
        input: 'High-risk request requiring approval',
        expected: 'Creates approval path instead of executing directly',
        passed: true,
        judgeComment: 'Approval boundary was preserved.',
      },
    ],
  })
}

export class MockOpenClawAdapter implements OpenClawAdapter {
  private connected = false
  private agents: Agent[] = []
  private tasks: Task[] = []
  private skills: Skill[] = []
  private notifications: Notification[] = []
  private conversations: Conversation[] = []
  private events: SystemEvent[] = []
  private health: SystemHealth | undefined
  private handlers = new Set<(event: SystemEvent) => void>()
  private interval: NodeJS.Timeout | undefined

  async connect(): Promise<void> {
    this.health = SystemHealthSchema.parse(await readMock('system-health.json'))
    this.agents = AgentListSchema.parse(await readMock('agents.json'))
    this.tasks = TaskListSchema.parse(await readMock('tasks.json')).map((task, index) => ({
      ...task,
      capsule: {
        ...task.capsule,
        executionLog:
          task.capsule.executionLog.length > 0
            ? task.capsule.executionLog
            : [
                {
                  id: `${task.id}-log-1`,
                  step: 'Read task context',
                  tool: 'mock.context',
                  parameters: { source: 'data/mock' },
                  result: 'Context loaded',
                  durationMs: 120 + index * 5,
                  timestamp: task.createdAt,
                },
                {
                  id: `${task.id}-log-2`,
                  step: 'Execute assigned plan',
                  tool: 'mock.agent',
                  parameters: { agentId: task.agentId },
                  result: task.status === 'failed' ? 'Execution failed in mock adapter' : 'Execution step completed',
                  durationMs: 620 + index * 19,
                  timestamp: task.updatedAt,
                },
              ],
        skillCalls:
          task.capsule.skillCalls.length > 0
            ? task.capsule.skillCalls
            : task.skillId
              ? [
                  {
                    skillId: task.skillId,
                    status: task.status === 'failed' ? 'fail' : 'success',
                    durationMs: 440 + index * 11,
                    summary: 'Mock skill execution record',
                  },
                ]
              : [],
        evolverAnalysis:
          task.capsule.evolverAnalysis ??
          (index % 2 === 0
            ? {
                score: Math.max(0.62, 0.92 - index * 0.03),
                suggestions: ['Keep task scope explicit', 'Record approval boundary when actions escalate'],
              }
            : undefined),
      },
    }))
    this.skills = SkillListSchema.parse(await readMock('skills.json'))
    this.notifications = NotificationListSchema.parse(await readMock('notifications.json'))
    this.conversations = ConversationListSchema.parse(await readMock('conversations.json')).map((conversation, index) => ({
      ...conversation,
      channel: index === 0 ? 'web' : index === 1 ? 'discord' : 'telegram',
      unreadCount: index,
      messages: conversation.messages.map((message, messageIndex) => ({
        ...message,
        channel: index === 0 ? 'web' : index === 1 ? 'discord' : 'telegram',
        type:
          message.role === 'tool'
            ? 'skill_invocation'
            : message.taskId
              ? 'task_report'
              : messageIndex === conversation.messages.length - 1 && index === 1
                ? 'approval_request'
                : 'text',
      })),
    }))
    this.events = SystemEventListSchema.parse(await readMock('events.json'))
    this.connected = true
    this.startEventPump()
  }

  async disconnect(): Promise<void> {
    this.connected = false
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = undefined
    }
    this.handlers.clear()
  }

  async getStatus(): Promise<SystemHealth> {
    if (!this.health) {
      await this.connect()
    }

    return this.health!
  }

  async listAgents(): Promise<Agent[]> {
    return this.agents
  }

  async listTasks(limit?: number): Promise<Task[]> {
    return typeof limit === 'number' ? this.tasks.slice(0, limit) : this.tasks
  }

  async listSkills(): Promise<Skill[]> {
    return this.skills.map((skill) => ({
      ...skill,
      evolver: {
        ...skill.evolver,
        pendingPatchCount: this.notifications.filter(
          (item) => item.type === 'skill_patch_pending' && item.skillId === skill.id && item.status !== 'done',
        ).length,
      },
    }))
  }

  async getSkill(nameOrId: string): Promise<SkillDetail | undefined> {
    const skill = this.findSkill(nameOrId)

    if (!skill) {
      return undefined
    }

    return this.toSkillDetail(skill)
  }

  async updateSkill(nameOrId: string, input: SkillUpdateInput): Promise<SkillDetail> {
    const skill = this.findSkill(nameOrId)

    if (!skill) {
      throw new Error('Skill not found')
    }

    if (skill.status === 'stable') {
      throw new Error('Stable skills are read-only in mock mode')
    }

    const next = {
      ...skill,
      description: input.description ?? skill.description,
      tags: input.tags ?? skill.tags,
    }

    this.skills = this.skills.map((item) => (item.id === skill.id ? next : item))
    this.emit({
      id: `event-skill-updated-${Date.now()}`,
      type: 'skill.updated',
      title: `${skill.name} updated`,
      message: 'Mock bridge accepted the skill configuration update.',
      level: 'info',
      source: 'bridge',
      timestamp: nowIso(),
      skillId: skill.id,
      metadata: {},
    })

    return this.toSkillDetail(next, input.configYaml)
  }

  async evalSkill(nameOrId: string): Promise<SkillEvalResult> {
    const skill = this.findSkill(nameOrId)

    if (!skill) {
      throw new Error('Skill not found')
    }

    await new Promise((resolve) => setTimeout(resolve, 2000))
    const score = Math.min(0.95, Math.max(0.6, skill.evolver.score + (Math.random() - 0.25) * 0.12))
    const result = createEvalResult(skill.id, Number(score.toFixed(2)))
    this.emit({
      id: `event-eval-${Date.now()}`,
      type: 'skill.eval.complete',
      title: `${skill.name} eval complete`,
      message: `Mock Evolver scored ${skill.name} at ${Math.round(result.score * 100)}%.`,
      level: 'info',
      source: 'evolver',
      timestamp: nowIso(),
      skillId: skill.id,
      metadata: { score: result.score },
    })

    return result
  }

  async approveSkillPatch(nameOrId: string): Promise<void> {
    const skill = this.findSkill(nameOrId)
    if (!skill) throw new Error('Skill not found')
    await this.actionPatchNotifications(skill.id, 'approve')
  }

  async rejectSkillPatch(nameOrId: string): Promise<void> {
    const skill = this.findSkill(nameOrId)
    if (!skill) throw new Error('Skill not found')
    await this.actionPatchNotifications(skill.id, 'reject')
  }

  async rollbackSkill(nameOrId: string, patchId?: string): Promise<void> {
    const skill = this.findSkill(nameOrId)
    if (!skill) throw new Error('Skill not found')
    this.emit({
      id: `event-skill-rollback-${Date.now()}`,
      type: 'skill.rollback',
      title: `${skill.name} rollback simulated`,
      message: patchId ? `Rolled back to ${patchId} in mock mode.` : 'Rollback simulated in mock mode.',
      level: 'info',
      source: 'bridge',
      timestamp: nowIso(),
      skillId: skill.id,
      metadata: { patchId },
    })
  }

  async listNotifications(filter?: NotificationFilter): Promise<Notification[]> {
    return this.notifications.filter((notification) => {
      if (filter?.status && notification.status !== filter.status) {
        return false
      }

      if (filter?.type && notification.type !== filter.type) {
        return false
      }

      return true
    })
  }

  async actionNotification(id: string, action: string): Promise<void> {
    this.notifications = this.notifications.map((notification) => {
      if (notification.id !== id) {
        return notification
      }

      return {
        ...notification,
        read: true,
        actionRequired: action === 'reject' || action === 'approve' || action === 'archive' ? false : notification.actionRequired,
        status: action === 'reject' || action === 'archive' ? 'dismissed' : action === 'approve' ? 'done' : 'read',
      }
    })

    this.emit({
      id: `event-notification-${id}-${Date.now()}`,
      type: 'notification.actioned',
      title: 'Notification action applied',
      message: `Action "${action}" was applied to ${id}.`,
      level: 'info',
      source: 'bridge',
      timestamp: nowIso(),
      metadata: { id, action },
    })
  }

  async listConversations(): Promise<Conversation[]> {
    return this.conversations
  }

  async sendMessage(input: SendMessageInput): Promise<void> {
    const conversation = input.conversationId
      ? this.conversations.find((item) => item.id === input.conversationId)
      : this.conversations[0]

    if (!conversation) {
      throw new Error('Conversation not found')
    }

    const channel = input.channel ?? conversation.channel
    const userMessage: ConversationMessage = {
      id: `msg-user-${Date.now()}`,
      role: 'user',
      author: 'User',
      content: input.content,
      type: 'text',
      channel,
      timestamp: nowIso(),
      agentId: input.agentId,
      metadata: {},
    }

    this.appendMessage(conversation.id, userMessage)
    this.emitChatMessage(conversation.id, userMessage)

    setTimeout(() => {
      const reply: ConversationMessage = {
        id: `msg-agent-${Date.now()}`,
        role: 'agent',
        author: input.agentId ?? 'Conductor',
        content: `Mock agent received: ${input.content}`,
        type: input.content.includes('/skill') ? 'skill_invocation' : 'text',
        channel,
        timestamp: nowIso(),
        agentId: input.agentId ?? 'agent-conductor',
        metadata: input.content.includes('/skill') ? { skillName: 'Mock Skill', parameters: 'parsed from input' } : {},
      }
      this.appendMessage(conversation.id, reply, true)
      this.emitChatMessage(conversation.id, reply)
    }, 1500)
  }

  subscribe(handler: (event: SystemEvent) => void): () => void {
    this.handlers.add(handler)

    return () => {
      this.handlers.delete(handler)
    }
  }

  private findSkill(nameOrId: string) {
    const decoded = decodeURIComponent(nameOrId)
    return this.skills.find(
      (skill) =>
        skill.id === decoded ||
        skill.name === decoded ||
        skill.name.toLowerCase().replaceAll(' ', '-') === decoded.toLowerCase(),
    )
  }

  private toSkillDetail(skill: Skill, configYaml?: string): SkillDetail {
    return SkillDetailSchema.parse({
      ...skill,
      author: skill.ownerAgentId ?? 'agent-conductor',
      createdAt: '2026-04-01T08:00:00.000Z',
      updatedAt: skill.lastRunAt ?? '2026-04-23T06:00:00.000Z',
      dependencies: skill.tags.includes('obsidian')
        ? ['obsidian-local-rest']
        : skill.tags.includes('memory')
          ? ['lancedb', 'ollama']
          : ['openclaw-gateway'],
      riskLevel: skill.tags.includes('approval') ? 'S3' : skill.status === 'draft' ? 'S2' : 'S1',
      configYaml:
        configYaml ??
        `---\nname: ${skill.id}\ndescription: ${skill.description}\nstatus: ${skill.status}\nversion: ${skill.version}\ntags:\n${skill.tags
          .map((tag) => `  - ${tag}`)
          .join('\n')}\n---\n`,
      executionHistory: createExecutionHistory(skill),
      latestEval: createEvalResult(skill.id, skill.evolver.score),
    })
  }

  private async actionPatchNotifications(skillId: string, action: string) {
    const ids = this.notifications
      .filter((item) => item.skillId === skillId && item.type === 'skill_patch_pending')
      .map((item) => item.id)

    for (const id of ids) {
      await this.actionNotification(id, action)
    }
  }

  private appendMessage(conversationId: string, message: ConversationMessage, unread = false) {
    this.conversations = this.conversations.map((conversation) =>
      conversation.id === conversationId
        ? {
            ...conversation,
            updatedAt: message.timestamp,
            unreadCount: unread ? conversation.unreadCount + 1 : conversation.unreadCount,
            messages: [...conversation.messages, message],
          }
        : conversation,
    )
  }

  private emitChatMessage(conversationId: string, message: ConversationMessage) {
    this.emit({
      id: `event-chat-${message.id}`,
      type: 'chat.message',
      title: 'Chat message',
      message: message.content,
      level: 'info',
      source: 'chat',
      timestamp: message.timestamp,
      agentId: message.agentId,
      taskId: message.taskId,
      skillId: message.skillId,
      metadata: {
        conversationId,
        message,
      },
    })
  }

  private startEventPump() {
    if (this.interval) {
      return
    }

    this.interval = setInterval(() => {
      if (!this.connected || this.handlers.size === 0 || this.events.length === 0) {
        return
      }

      const base = this.events[Math.floor(Math.random() * this.events.length)]
      this.emit({
        ...base,
        id: `${base.id}-mock-${Date.now()}`,
        timestamp: nowIso(),
        metadata: {
          ...base.metadata,
          mockRealtime: true,
        },
      })
    }, 3000)
  }

  private emit(event: SystemEvent) {
    for (const handler of this.handlers) {
      handler(event)
    }
  }
}
