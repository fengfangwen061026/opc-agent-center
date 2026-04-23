import { useMemo, useState } from 'react'
import type { Conversation, ConversationMessage } from '@opc/core'
import { AtSign, Check, MessageCircle, Send, ShieldCheck, Slash, X } from 'lucide-react'
import { GlassCard, LiquidButton, StatusPill } from '@opc/ui'
import { useAgentStore } from '@/stores/agentStore'
import { useConversationStore } from '@/stores/conversationStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { useSkillStore } from '@/stores/skillStore'
import { useSystemHealthStore } from '@/stores/systemHealthStore'
import { useTaskStore } from '@/stores/taskStore'

interface ChatPageProps {
  unmatched?: boolean
}

function channelIcon(channel: Conversation['channel']) {
  switch (channel) {
    case 'telegram':
      return 'TG'
    case 'whatsapp':
      return 'WA'
    case 'discord':
      return 'DC'
    case 'feishu':
      return 'FS'
    case 'weixin':
      return 'WX'
    default:
      return 'OP'
  }
}

function summarize(message?: ConversationMessage) {
  if (!message) return 'No messages'
  return message.content.length > 72 ? `${message.content.slice(0, 72)}...` : message.content
}

function MessageBubble({ message }: { message: ConversationMessage }) {
  const isUser = message.role === 'user'

  return (
    <div className={`opc-chat-message ${isUser ? 'is-user' : 'is-agent'}`}>
      <div className="opc-chat-message__meta">
        <span>{message.author}</span>
        <span>{message.channel}</span>
      </div>
      <div className="opc-chat-bubble">
        <p>{message.content}</p>
        {message.type === 'skill_invocation' ? (
          <details className="opc-chat-message__details">
            <summary>Skill invocation</summary>
            <pre>{JSON.stringify(message.metadata, null, 2)}</pre>
          </details>
        ) : null}
        {message.type === 'task_report' ? (
          <div className="opc-chat-inline-card">
            <StatusPill status="running" label="Task report" />
            <span>{message.taskId ?? 'Task linked'}</span>
          </div>
        ) : null}
        {message.type === 'approval_request' ? (
          <div className="opc-chat-actions">
            <LiquidButton variant="primary" icon={<Check />}>
              批准
            </LiquidButton>
            <LiquidButton variant="danger" icon={<X />}>
              拒绝
            </LiquidButton>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function ChatPage({ unmatched = false }: ChatPageProps) {
  const {
    conversations,
    activeConversationId,
    setActiveConversation,
    messages,
    unreadCount,
    sendMessage,
  } = useConversationStore()
  const { agents } = useAgentStore()
  const { skills } = useSkillStore()
  const { tasks } = useTaskStore()
  const { actionNotification } = useNotificationStore()
  const { health, bridgeOnline } = useSystemHealthStore()
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState('')
  const [agentPickerOpen, setAgentPickerOpen] = useState(false)
  const [skillPickerOpen, setSkillPickerOpen] = useState(false)

  const filteredConversations = conversations.filter((conversation) =>
    conversation.title.toLowerCase().includes(search.toLowerCase()),
  )

  const activeConversation = unmatched
    ? undefined
    : (conversations.find((conversation) => conversation.id === activeConversationId) ??
      conversations[0])
  const activeMessages = useMemo(
    () => (unmatched ? [] : (messages[activeConversation?.id ?? ''] ?? [])),
    [activeConversation?.id, messages, unmatched],
  )

  const linkedTasks = useMemo(() => {
    const taskIds = new Set(activeMessages.map((message) => message.taskId).filter(Boolean))
    return tasks.filter((task) => taskIds.has(task.id) || task.status === 'running').slice(0, 4)
  }, [activeMessages, tasks])

  const gatewayOffline =
    !bridgeOnline || health.gateway.status === 'disconnected' || health.gateway.status === 'error'

  const submit = async () => {
    if (gatewayOffline) return
    const content = draft.trim()
    if (!content) return

    const approveMatch = content.match(/^\/approve\s+(\S+)/)
    if (approveMatch) {
      await actionNotification(approveMatch[1], 'approve')
      setDraft('')
      return
    }

    await sendMessage({
      conversationId: activeConversation?.id,
      content,
      channel: activeConversation?.channel ?? 'web',
    })
    setDraft('')
    setAgentPickerOpen(false)
    setSkillPickerOpen(false)
  }

  return (
    <div className="opc-page opc-chat-page">
      <GlassCard className="opc-chat-list" variant="strong">
        <div className="opc-chat-list__header">
          <div>
            <p className="opc-eyebrow">Chat Center</p>
            <h1 className="opc-section-title">Conversations</h1>
          </div>
        </div>
        <input
          className="opc-field"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search conversations"
          type="search"
        />
        <button
          className="opc-conversation-row is-pinned"
          onClick={() => setActiveConversation('unmatched')}
        >
          <span className="opc-channel-mark">UM</span>
          <span>
            <strong>Unmatched</strong>
            <small>Messages without a route</small>
          </span>
        </button>
        <div className="opc-conversation-list" data-testid="conversation-list">
          {filteredConversations.map((conversation) => {
            const lastMessage = conversation.messages.at(-1)
            const isActive = conversation.id === activeConversation?.id

            return (
              <button
                type="button"
                key={conversation.id}
                className={`opc-conversation-row ${isActive ? 'is-active' : ''}`}
                onClick={() => setActiveConversation(conversation.id)}
              >
                <span className="opc-channel-mark">{channelIcon(conversation.channel)}</span>
                <span className="opc-conversation-row__copy">
                  <strong>{conversation.title}</strong>
                  <small>{summarize(lastMessage)}</small>
                </span>
                {(unreadCount[conversation.id] ?? conversation.unreadCount) > 0 ? (
                  <span className="opc-unread-badge">
                    {unreadCount[conversation.id] ?? conversation.unreadCount}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </GlassCard>

      <GlassCard className="opc-chat-stream" variant="strong">
        <div className="opc-chat-stream__header">
          <div>
            <p className="opc-eyebrow">{activeConversation?.channel ?? 'Unmatched'}</p>
            <h1 className="opc-page-title">
              {unmatched ? 'Unmatched Messages' : activeConversation?.title}
            </h1>
          </div>
          <StatusPill status="connected" label="Bridge sync" />
        </div>
        <div className="opc-chat-messages">
          {activeMessages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {unmatched ? <p className="opc-empty-copy">No unmatched messages in mock mode.</p> : null}
        </div>
        <div className="opc-chat-composer">
          {gatewayOffline ? (
            <GlassCard className="opc-chat-offline" variant="soft" padding="sm">
              Gateway 离线，输入已暂停；Bridge 会继续尝试重连。
            </GlassCard>
          ) : null}
          <GlassCard className="opc-chat-composer__box" padding="sm">
            <textarea
              value={draft}
              disabled={gatewayOffline}
              onChange={(event) => {
                const value = event.target.value
                setDraft(value)
                setAgentPickerOpen(value.includes('@'))
                setSkillPickerOpen(value.includes('/skill'))
              }}
              placeholder="Message OPC, type @agent, /skill, or /approve <notification-id>"
              rows={3}
            />
            <div className="opc-chat-composer__actions">
              <LiquidButton
                variant="ghost"
                icon={<AtSign />}
                onClick={() => setAgentPickerOpen((value) => !value)}
              />
              <LiquidButton
                variant="ghost"
                icon={<Slash />}
                onClick={() => setSkillPickerOpen((value) => !value)}
              />
              <LiquidButton icon={<Send />} onClick={submit} disabled={gatewayOffline}>
                Send
              </LiquidButton>
            </div>
          </GlassCard>
          {agentPickerOpen ? (
            <GlassCard className="opc-picker-popover">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => setDraft((value) => `${value} ${agent.name}`)}
                >
                  <MessageCircle />
                  {agent.displayName}
                </button>
              ))}
            </GlassCard>
          ) : null}
          {skillPickerOpen ? (
            <GlassCard className="opc-picker-popover is-skill">
              {skills.map((skill) => (
                <button
                  key={skill.id}
                  type="button"
                  onClick={() => setDraft((value) => `${value} ${skill.id}`)}
                >
                  <ShieldCheck />
                  {skill.name}
                </button>
              ))}
            </GlassCard>
          ) : null}
        </div>
      </GlassCard>

      <GlassCard className="opc-chat-context" variant="strong">
        <p className="opc-eyebrow">Task Context</p>
        <h2 className="opc-section-title">Active Work</h2>
        <div className="opc-context-list">
          {linkedTasks.map((task) => (
            <div key={task.id} className="opc-context-task">
              <div>
                <strong>{task.title}</strong>
                <small>{task.agentId}</small>
              </div>
              <StatusPill
                status={
                  task.status === 'running'
                    ? 'running'
                    : task.status === 'completed'
                      ? 'connected'
                      : task.status === 'failed'
                        ? 'error'
                        : task.status === 'blocked'
                          ? 'disconnected'
                          : 'idle'
                }
                label={task.status}
              />
              <div className="opc-task-progress">
                <div className="opc-task-progress__bar" style={{ width: `${task.progress}%` }} />
              </div>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  )
}
