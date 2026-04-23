import { useQuery } from "@tanstack/react-query";
import { GlassCard } from "@opc/ui";
import { getUnmatchedMessages } from "../lib/api";

export function UnmatchedChatPage() {
  const { data: messages = [] } = useQuery({
    queryKey: ["chat", "unmatched"],
    queryFn: getUnmatchedMessages,
  });

  return (
    <section className="opc-page-stack">
      <header className="opc-page-title">
        <span>会话中枢</span>
        <h1>未匹配收件箱</h1>
      </header>
      <GlassCard className="opc-list-panel">
        {messages.length ? (
          messages.map((message) => (
            <article className="opc-message-row" key={message.id}>
              <strong>{message.author.displayName}</strong>
              <p>{message.content}</p>
            </article>
          ))
        ) : (
          <p>mock 模式下暂无未匹配会话。</p>
        )}
      </GlassCard>
    </section>
  );
}
