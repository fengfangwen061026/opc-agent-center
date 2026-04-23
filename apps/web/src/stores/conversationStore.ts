import { create } from 'zustand'
import type { Conversation, ConversationMessage, SendMessageInput, SystemEvent } from '@opc/core'
import { fetchBridge } from '@/lib/bridgeClient'
import conversationData from '../../../../data/mock/conversations.json'

interface ConversationStore {
  conversations: Conversation[]
  activeConversationId: string | null
  messages: Record<string, ConversationMessage[]>
  unreadCount: Record<string, number>
  fetchConversations: () => Promise<void>
  setActiveConversation: (id: string) => void
  sendMessage: (input: SendMessageInput) => Promise<void>
  handleEvent: (event: SystemEvent) => void
}

function normalize(conversations: Conversation[]) {
  return {
    conversations,
    messages: Object.fromEntries(conversations.map((conversation) => [conversation.id, conversation.messages])),
    unreadCount: Object.fromEntries(conversations.map((conversation) => [conversation.id, conversation.unreadCount])),
  }
}

const initial = normalize(conversationData as Conversation[])

export const useConversationStore = create<ConversationStore>((set, get) => ({
  ...initial,
  activeConversationId: initial.conversations[0]?.id ?? null,
  fetchConversations: async () => {
    try {
      const conversations = await fetchBridge<Conversation[]>('/api/conversations')
      set({ ...normalize(conversations), activeConversationId: get().activeConversationId ?? conversations[0]?.id ?? null })
    } catch {
      set(initial)
    }
  },
  setActiveConversation: (id) =>
    set((state) => ({
      activeConversationId: id,
      unreadCount: {
        ...state.unreadCount,
        [id]: 0,
      },
    })),
  sendMessage: async (input) => {
    const conversationId = input.conversationId ?? get().activeConversationId ?? initial.conversations[0]?.id
    if (!conversationId) return

    const message: ConversationMessage = {
      id: `local-${Date.now()}`,
      role: 'user',
      author: 'User',
      content: input.content,
      type: 'text',
      channel: input.channel ?? 'web',
      timestamp: new Date().toISOString(),
      agentId: input.agentId,
      metadata: {},
    }

    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]: [...(state.messages[conversationId] ?? []), message],
      },
      conversations: state.conversations.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, updatedAt: message.timestamp, messages: [...conversation.messages, message] }
          : conversation,
      ),
    }))

    try {
      await fetchBridge('/api/chat/send', {
        method: 'POST',
        body: JSON.stringify({ ...input, conversationId }),
      })
    } catch {
      window.setTimeout(() => {
        const reply: ConversationMessage = {
          id: `local-reply-${Date.now()}`,
          role: 'agent',
          author: input.agentId ?? 'Conductor',
          content: `Bridge offline mock reply: ${input.content}`,
          type: 'text',
          channel: input.channel ?? 'web',
          timestamp: new Date().toISOString(),
          agentId: input.agentId ?? 'agent-conductor',
          metadata: {},
        }
        get().handleEvent({
          id: `event-${reply.id}`,
          type: 'chat.message',
          title: 'Local mock reply',
          message: reply.content,
          level: 'info',
          source: 'chat',
          timestamp: reply.timestamp,
          agentId: reply.agentId,
          metadata: { conversationId, message: reply },
        })
      }, 1500)
    }
  },
  handleEvent: (event) => {
    if (event.type !== 'chat.message') return

    const conversationId = event.metadata.conversationId
    const message = event.metadata.message

    if (typeof conversationId !== 'string' || !message || typeof message !== 'object') {
      return
    }

    const typedMessage = message as ConversationMessage

    set((state) => {
      const existing = state.messages[conversationId] ?? []
      if (existing.some((item) => item.id === typedMessage.id)) {
        return state
      }

      const isActive = state.activeConversationId === conversationId
      return {
        messages: {
          ...state.messages,
          [conversationId]: [...existing, typedMessage],
        },
        unreadCount: {
          ...state.unreadCount,
          [conversationId]: isActive ? 0 : (state.unreadCount[conversationId] ?? 0) + 1,
        },
        conversations: state.conversations.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                updatedAt: typedMessage.timestamp,
                unreadCount: isActive ? 0 : conversation.unreadCount + 1,
                messages: [...conversation.messages, typedMessage],
              }
            : conversation,
        ),
      }
    })
  },
}))
