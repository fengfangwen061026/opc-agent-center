import type { Conversation as LegacyConversation, OpcMessage } from "@opc/core";

export type ConversationSource =
  | "web"
  | "openclaw"
  | "telegram"
  | "wechat"
  | "slack"
  | "discord"
  | "unknown";

export interface ConversationRecord {
  id: string;
  title: string;
  source: ConversationSource;
  participants: string[];
  createdAt: string;
  updatedAt: string;
  status: "active" | "archived";
}

export interface ConversationMessageRecord {
  id: string;
  conversationId: string;
  ts: string;
  role: "user" | "assistant" | "agent" | "system" | "tool";
  source: ConversationSource;
  authorLabel: string;
  content: string;
  relatedTaskId?: string;
  relatedCapsuleId?: string;
}

export class ConversationStore {
  private readonly conversations = new Map<string, ConversationRecord>();
  private readonly messages: ConversationMessageRecord[] = [];

  seed(legacyConversations: LegacyConversation[], legacyMessages: OpcMessage[]): void {
    for (const conversation of legacyConversations) {
      this.conversations.set(conversation.id, {
        id: conversation.id,
        title: conversation.title,
        source: channelToSource(conversation.channel),
        participants: conversation.participants.map((participant) => participant.displayName),
        createdAt: conversation.lastMessageAt,
        updatedAt: conversation.lastMessageAt,
        status: conversation.status === "archived" ? "archived" : "active",
      });
    }
    for (const message of legacyMessages) this.appendFromOpcMessage(message);
  }

  list(): ConversationRecord[] {
    return [...this.conversations.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  listMessages(conversationId?: string): ConversationMessageRecord[] {
    return conversationId
      ? this.messages.filter((message) => message.conversationId === conversationId)
      : [...this.messages];
  }

  appendFromOpcMessage(message: OpcMessage, relatedCapsuleId?: string): ConversationMessageRecord {
    const record: ConversationMessageRecord = {
      id: message.id,
      conversationId: message.conversationId,
      ts: message.createdAt,
      role: message.role === "agent" ? "agent" : message.role,
      source: channelToSource(message.channel),
      authorLabel: message.author.displayName,
      content: message.content,
      relatedTaskId: message.taskId,
      relatedCapsuleId,
    };
    this.messages.push(record);
    const existing = this.conversations.get(message.conversationId);
    if (existing) {
      existing.updatedAt = message.createdAt;
    } else {
      this.conversations.set(message.conversationId, {
        id: message.conversationId,
        title: "本地 fallback 会话",
        source: channelToSource(message.channel),
        participants: [message.author.displayName],
        createdAt: message.createdAt,
        updatedAt: message.createdAt,
        status: "active",
      });
    }
    return record;
  }
}

function channelToSource(channel: string): ConversationSource {
  if (channel === "panel") return "web";
  if (["telegram", "wechat", "slack"].includes(channel)) return channel as ConversationSource;
  if (channel === "webchat") return "web";
  return "unknown";
}
