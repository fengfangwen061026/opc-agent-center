import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Hash, MessageSquareText, Send } from "lucide-react";
import { GlassCard, LiquidButton, StatusPill } from "@opc/ui";
import { VirtualList } from "../components/virtual/VirtualList";
import {
  actNotification,
  getAgents,
  getCapsules,
  getConversations,
  getMessages,
  getSkills,
  getTasks,
  sendChatMessage,
} from "../lib/api";
import { useChatStore } from "../stores/chatStore";

export function ChatPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [lastDispatch, setLastDispatch] = useState<unknown>(null);
  const selectedConversationId = useChatStore((state) => state.selectedConversationId);
  const setSelectedConversationId = useChatStore((state) => state.setSelectedConversationId);
  const { data } = useQuery({ queryKey: ["conversations"], queryFn: getConversations });
  const { data: agents = [] } = useQuery({ queryKey: ["agents"], queryFn: getAgents });
  const { data: skills = [] } = useQuery({ queryKey: ["skills"], queryFn: () => getSkills() });
  const { data: tasks = [] } = useQuery({ queryKey: ["tasks"], queryFn: getTasks });
  const { data: capsules = [] } = useQuery({ queryKey: ["capsules"], queryFn: getCapsules });
  const conversations = data?.conversations ?? [];
  const activeConversationId = selectedConversationId ?? conversations[0]?.id ?? "";
  const activeConversation = conversations.find(
    (conversation) => conversation.id === activeConversationId,
  );
  const { data: messages = [] } = useQuery({
    queryKey: ["messages", activeConversationId],
    queryFn: () => getMessages(activeConversationId),
    enabled: Boolean(activeConversationId),
  });
  const activeTask = useMemo(
    () => tasks.find((task) => messages.some((message) => message.taskId === task.taskId)),
    [messages, tasks],
  );
  const sendMutation = useMutation({
    mutationFn: sendChatMessage,
    onSuccess: (result) => {
      setLastDispatch(result.dispatch ?? null);
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["messages", activeConversationId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["capsules"] });
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
      queryClient.invalidateQueries({ queryKey: ["skill-runs"] });
      queryClient.invalidateQueries({ queryKey: ["coding-runs"] });
      queryClient.invalidateQueries({ queryKey: ["agent-runs"] });
    },
  });
  const approveMutation = useMutation({
    mutationFn: (id: string) => actNotification(id, "approve"),
  });
  const suggestions = useMemo(() => {
    if (draft.includes("@")) return agents.map((agent) => `@${agent.name}`);
    if (draft.includes("/skill")) return skills.map((skill) => `/skill ${skill.name}`);
    return [];
  }, [agents, draft, skills]);
  const activeCapsule = capsules.find((capsule) => capsule.conversationId === activeConversationId);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || !activeConversationId) return;
    if (trimmed.startsWith("/approve ")) {
      approveMutation.mutate(trimmed.replace("/approve ", "").trim());
      setDraft("");
      return;
    }
    sendMutation.mutate({
      conversationId: activeConversationId,
      content: trimmed,
      channel: "panel",
    });
  }

  return (
    <section className="opc-page-stack">
      <header className="opc-page-title">
        <span>会话中枢</span>
        <h1>对话</h1>
      </header>
      <div className="opc-chat-layout">
        <GlassCard className="opc-chat-list">
          <div className="opc-panel-heading">
            <strong>会话列表</strong>
          </div>
          {conversations.map((conversation) => (
            <button
              className="opc-conversation-row"
              key={conversation.id}
              onClick={() => setSelectedConversationId(conversation.id)}
              type="button"
            >
              <MessageSquareText aria-hidden="true" size={18} />
              <div>
                <strong>{conversation.title}</strong>
                <p>
                  {conversation.channel} · {conversation.status}
                </p>
              </div>
            </button>
          ))}
        </GlassCard>

        <GlassCard className="opc-chat-stream">
          <div className="opc-panel-heading">
            <strong>{activeConversation?.title ?? "暂无会话"}</strong>
            {activeConversation ? (
              <StatusPill
                status={activeConversation.status === "agent_running" ? "running" : "idle"}
              />
            ) : null}
          </div>
          <VirtualList
            estimateSize={96}
            items={messages}
            renderItem={(message) => (
              <article
                className="opc-message-row"
                key={message.id}
                data-direction={message.direction}
              >
                <span className="opc-channel-badge">
                  <Hash size={13} />
                  {message.channel}
                </span>
                <strong>{message.author.displayName}</strong>
                <p>{message.content}</p>
              </article>
            )}
          />
          <form className="opc-chat-input" onSubmit={onSubmit}>
            <input
              list="chat-suggestions"
              onChange={(event) => setDraft(event.target.value)}
              placeholder="@智能体、/skill、/approve <通知ID>，或直接输入消息"
              value={draft}
            />
            <datalist id="chat-suggestions">
              {suggestions.map((suggestion) => (
                <option key={suggestion} value={suggestion} />
              ))}
            </datalist>
            <LiquidButton icon={<Send size={16} />} type="submit">
              发送
            </LiquidButton>
          </form>
        </GlassCard>

        <GlassCard className="opc-chat-context">
          <div className="opc-panel-heading">
            <strong>任务上下文</strong>
          </div>
          <p>OpenClaw 未连接时，Bridge 会创建本地 fallback 消息和 Capsule 草稿。</p>
          {activeTask ? (
            <div className="opc-context-block">
              <StatusPill status={activeTask.status} />
              <strong>{activeTask.title}</strong>
              <p>{activeTask.goal}</p>
            </div>
          ) : (
            <p>当前会话未关联任务。</p>
          )}
          {activeCapsule ? (
            <div className="opc-context-block">
              <strong>关联 Capsule</strong>
              <span>{activeCapsule.id}</span>
              <p>{activeCapsule.goal}</p>
            </div>
          ) : null}
          {lastDispatch ? (
            <div className="opc-context-block">
              <strong>Conductor Dispatch</strong>
              <pre>{JSON.stringify(lastDispatch, null, 2).slice(0, 1400)}</pre>
            </div>
          ) : null}
        </GlassCard>
      </div>
    </section>
  );
}
