import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { DatabaseZap, Search } from "lucide-react";
import { GlassCard, LiquidButton } from "@opc/ui";
import {
  getHealth,
  getNote,
  getObsidianStatus,
  getReviewNotes,
  getServiceStatus,
  getVaultTree,
  createReviewNote,
  previewReviewNote,
  searchNotes,
  verifyReviewNote,
  writeReviewNote,
} from "../lib/api";

export function KnowledgePage() {
  const queryClient = useQueryClient();
  const [selectedPath, setSelectedPath] = useState("08_Review_Queue/OpenClaw Skill Standards.md");
  const [query, setQuery] = useState("");
  const [showReviewQueue, setShowReviewQueue] = useState(false);
  const { data: health } = useQuery({ queryKey: ["health"], queryFn: getHealth });
  const { data: serviceStatus } = useQuery({
    queryKey: ["service-status"],
    queryFn: () => getServiceStatus(),
  });
  const { data: obsidianStatus } = useQuery({
    queryKey: ["obsidian-status"],
    queryFn: getObsidianStatus,
  });
  const { data: reviewNotes = [] } = useQuery({
    queryKey: ["obsidian-review-notes"],
    queryFn: getReviewNotes,
  });
  const { data: tree = [] } = useQuery({ queryKey: ["vault-tree"], queryFn: getVaultTree });
  const { data: note } = useQuery({
    queryKey: ["note", selectedPath],
    queryFn: () => getNote(selectedPath),
    enabled: Boolean(selectedPath),
  });
  const { data: results = [] } = useQuery({
    queryKey: ["note-search", query],
    queryFn: () => searchNotes(query),
    enabled: query.length > 1,
  });
  const visibleTree = useMemo(
    () => (showReviewQueue ? tree.filter((item) => item.path.includes("08_Review_Queue")) : tree),
    [showReviewQueue, tree],
  );
  const previewMutation = useMutation({
    mutationFn: () =>
      previewReviewNote({
        title: "OPC Review Queue 预览",
        content: "来自 Knowledge Panel 的安全 preview。不会覆盖已有笔记。",
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["obsidian-status"] }),
  });
  const createNoteMutation = useMutation({
    mutationFn: () =>
      createReviewNote({
        title: "OPC Review Queue 审批写入",
        content: "来自 Knowledge Panel 的 Phase 4 审批写入预览。",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["obsidian-review-notes"] });
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
    },
  });
  const writeMutation = useMutation({
    mutationFn: writeReviewNote,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["obsidian-review-notes"] }),
  });
  const verifyMutation = useMutation({
    mutationFn: verifyReviewNote,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["obsidian-review-notes"] }),
  });

  return (
    <section className="opc-page-stack">
      <header className="opc-page-title">
        <span>Obsidian 面板</span>
        <h1>知识库</h1>
      </header>
      {health?.obsidian === "unavailable" ? (
        <GlassCard className="opc-placeholder-panel">
          <DatabaseZap aria-hidden="true" size={26} />
          <strong>Vault 未连接</strong>
          <p>Obsidian 当前不可用，界面已回落到 mock 仓库浏览。</p>
        </GlassCard>
      ) : null}
      {serviceStatus?.obsidian.status === "needs_token" ||
      serviceStatus?.obsidian.mode === "mock" ? (
        <GlassCard className="opc-placeholder-panel">
          <DatabaseZap aria-hidden="true" size={26} />
          <strong>需要配置 Obsidian Local REST API token</strong>
          <p>
            在 Obsidian 启用 Local REST API 插件后，把 API key 写入 .env.local 的
            OBSIDIAN_REST_TOKEN。未配置前仅显示 mock/fallback 知识库。
          </p>
        </GlassCard>
      ) : null}
      <div className="opc-knowledge-layout">
        <GlassCard className="opc-vault-tree">
          <div className="opc-panel-heading">
            <strong>仓库目录</strong>
            <LiquidButton onClick={() => setShowReviewQueue((value) => !value)} variant="ghost">
              审核队列
            </LiquidButton>
            <LiquidButton onClick={() => previewMutation.mutate()} variant="secondary">
              生成 Preview
            </LiquidButton>
            <LiquidButton onClick={() => createNoteMutation.mutate()} variant="secondary">
              创建审批写入
            </LiquidButton>
          </div>
          <p>Review Queue：{JSON.stringify(obsidianStatus ?? {}).slice(0, 180)}</p>
          {reviewNotes.slice(0, 6).map((note) => (
            <div className="opc-context-block" key={note.id}>
              <strong>{note.title}</strong>
              <span>
                {note.status}
                {note.writeResult?.verifiedAt
                  ? ` · 已校验 ${note.writeResult.readbackSha256?.slice(0, 8)}`
                  : ""}
              </span>
              {note.writeResult?.readbackPreview ? (
                <small>Readback：{note.writeResult.readbackPreview.slice(0, 80)}</small>
              ) : null}
              <button onClick={() => setSelectedPath(note.reviewQueuePath)} type="button">
                {note.reviewQueuePath}
              </button>
              <LiquidButton onClick={() => writeMutation.mutate(note.id)} variant="ghost">
                请求/执行写入
              </LiquidButton>
              <LiquidButton onClick={() => verifyMutation.mutate(note.id)} variant="ghost">
                重新校验
              </LiquidButton>
            </div>
          ))}
          {visibleTree.map((item) => (
            <div className="opc-tree-item" key={item.path}>
              <button
                onClick={() => item.type === "file" && setSelectedPath(item.path)}
                type="button"
              >
                {item.name}
              </button>
              {item.children?.map((child) => (
                <button key={child.path} onClick={() => setSelectedPath(child.path)} type="button">
                  {child.name}
                </button>
              ))}
            </div>
          ))}
        </GlassCard>
        <GlassCard className="opc-note-viewer">
          <div className="opc-filter-bar opc-filter-bar--inside">
            <Search size={18} />
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索知识库"
              value={query}
            />
          </div>
          {results.length ? (
            <div className="opc-search-results">
              {results.map((result) => (
                <button
                  key={result.path}
                  onClick={() => setSelectedPath(result.path)}
                  type="button"
                >
                  <strong>{result.title}</strong>
                  <span>{result.excerpt}</span>
                </button>
              ))}
            </div>
          ) : null}
          <article className="opc-markdown">
            <ReactMarkdown>{note?.content ?? "# 选择一篇笔记"}</ReactMarkdown>
          </article>
        </GlassCard>
      </div>
    </section>
  );
}
