import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CodingRunV1 } from "@opc/shared";
import { Check, GitBranch, X } from "lucide-react";
import { AgentAvatar, GlassCard, LiquidButton, StatusPill } from "@opc/ui";
import {
  actCodingRun,
  cleanupCodingRunWorkspace,
  getAgents,
  getCodingRunArtifact,
  getCodingRunArtifacts,
  getCodingRuns,
  runCodingRunTests,
} from "../lib/api";
import { getAgentAvatarKind } from "./command/graphModel";

export function AgentsPage() {
  const queryClient = useQueryClient();
  const [selectedRun, setSelectedRun] = useState<CodingRunV1 | null>(null);
  const [artifact, setArtifact] = useState("");
  const [artifactMap, setArtifactMap] = useState<Record<string, string>>({});
  const [testCommand, setTestCommand] = useState("pnpm test");
  const { data: agents = [] } = useQuery({ queryKey: ["agents"], queryFn: getAgents });
  const { data: codingRuns = [] } = useQuery({ queryKey: ["coding-runs"], queryFn: getCodingRuns });
  const actionMutation = useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string;
      action: "approve" | "reject" | "request_changes";
    }) => actCodingRun(id, action),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["coding-runs"] }),
  });
  const testMutation = useMutation({
    mutationFn: ({ id, command }: { id: string; command: string }) =>
      runCodingRunTests(id, command),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["coding-runs"] });
      setArtifact(JSON.stringify(result.result, null, 2));
    },
  });
  const cleanupMutation = useMutation({
    mutationFn: (id: string) => cleanupCodingRunWorkspace(id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["coding-runs"] });
      setArtifact(JSON.stringify(result, null, 2));
    },
  });

  return (
    <section className="opc-page-stack">
      <PageTitle eyebrow="智能体中心" title="智能体" />
      <div className="opc-card-grid">
        {agents.map((agent) => (
          <GlassCard className="opc-agent-list-card" key={agent.id} interactive>
            <div className="opc-agent-list-card__top">
              <AgentAvatar
                kind={getAgentAvatarKind(agent)}
                name={agent.name}
                status={agent.status}
              />
              <div>
                <strong>{agent.name}</strong>
                <p>{agent.role}</p>
              </div>
            </div>
            <div className="opc-agent-list-card__meta">
              <StatusPill status={agent.status} />
              <span>{agent.type}</span>
              <span>{agent.riskCeiling}</span>
            </div>
          </GlassCard>
        ))}
      </div>
      <PageTitle eyebrow="编程智能体运行" title="Codex / Claude Code" />
      <div className="opc-card-grid">
        {codingRuns.map((run) => (
          <GlassCard className="opc-coding-run-card" key={run.id} interactive>
            <div className="opc-panel-heading">
              <strong>{run.provider}</strong>
              <StatusPill
                label={run.status}
                status={
                  run.status === "succeeded" || run.status === "completed"
                    ? "completed"
                    : run.status === "queued" || run.status === "cancelled"
                      ? "idle"
                      : run.status
                }
              />
            </div>
            <p>{run.prompt.slice(0, 140)}</p>
            <div className="opc-agent-list-card__meta">
              <GitBranch size={15} />
              <span>{run.branchName ?? "无分支"}</span>
              <span>{run.changedFiles.length} 个文件</span>
            </div>
            <LiquidButton
              onClick={async () => {
                setSelectedRun(run);
                const artifacts = await getCodingRunArtifacts(run.id);
                setArtifactMap(artifacts);
                setArtifact(artifacts.diff ?? (await getCodingRunArtifact(run.id, "diff")));
              }}
              variant="secondary"
            >
              查看日志 / Diff
            </LiquidButton>
          </GlassCard>
        ))}
      </div>
      {selectedRun ? (
        <aside className="opc-detail-drawer" aria-label="编程运行详情">
          <GlassCard className="opc-detail-drawer__card">
            <div className="opc-detail-drawer__header">
              <strong>{selectedRun.id}</strong>
              <LiquidButton onClick={() => setSelectedRun(null)} variant="ghost">
                关闭
              </LiquidButton>
            </div>
            <dl className="opc-detail-grid">
              <div>
                <dt>仓库</dt>
                <dd>{selectedRun.repoPath}</dd>
              </div>
              <div>
                <dt>分支</dt>
                <dd>{selectedRun.branchName ?? "无"}</dd>
              </div>
              <div>
                <dt>Worktree</dt>
                <dd>{selectedRun.worktreePath ?? selectedRun.workspacePath}</dd>
              </div>
              <div>
                <dt>审批</dt>
                <dd>{selectedRun.approvalId ?? "无"}</dd>
              </div>
            </dl>
            <div className="opc-detail-section">
              <strong>变更文件</strong>
              <ul>
                {selectedRun.changedFiles.map((file) => (
                  <li key={file}>{file}</li>
                ))}
              </ul>
            </div>
            <div className="opc-detail-section">
              <strong>测试</strong>
              <p>
                {selectedRun.testCommand ?? "未配置测试命令"} · {selectedRun.testStatus}
              </p>
            </div>
            <div className="opc-detail-section">
              <strong>Diff / 日志</strong>
              <div className="opc-action-row">
                {(["diff", "stdout", "stderr"] as const).map((kind) => (
                  <LiquidButton
                    key={kind}
                    onClick={async () =>
                      setArtifact(
                        artifactMap[kind] ?? (await getCodingRunArtifact(selectedRun.id, kind)),
                      )
                    }
                    variant="ghost"
                  >
                    {kind}
                  </LiquidButton>
                ))}
                {(["jsonl", "final", "test"] as const).map((kind) => (
                  <LiquidButton
                    key={kind}
                    onClick={() => setArtifact(artifactMap[kind] ?? "暂无 artifact")}
                    variant="ghost"
                  >
                    {kind}
                  </LiquidButton>
                ))}
              </div>
              <pre>{artifact || "暂无 artifact"}</pre>
            </div>
            <div className="opc-detail-section">
              <strong>Capsule / Summary</strong>
              <p>{selectedRun.capsuleId ?? "无 Capsule"}</p>
              <p>{selectedRun.finalSummary ?? "暂无最终摘要"}</p>
            </div>
            <div className="opc-action-row">
              <input
                aria-label="测试命令"
                onChange={(event) => setTestCommand(event.target.value)}
                value={testCommand}
              />
              <LiquidButton
                onClick={() => testMutation.mutate({ id: selectedRun.id, command: testCommand })}
                variant="secondary"
              >
                运行安全测试
              </LiquidButton>
              <LiquidButton onClick={() => cleanupMutation.mutate(selectedRun.id)} variant="ghost">
                清理 Workspace
              </LiquidButton>
              <LiquidButton
                icon={<Check size={15} />}
                onClick={() => actionMutation.mutate({ id: selectedRun.id, action: "approve" })}
                variant="secondary"
              >
                批准
              </LiquidButton>
              <LiquidButton
                icon={<X size={15} />}
                onClick={() => actionMutation.mutate({ id: selectedRun.id, action: "reject" })}
                variant="ghost"
              >
                拒绝
              </LiquidButton>
            </div>
          </GlassCard>
        </aside>
      ) : null}
    </section>
  );
}

function PageTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <header className="opc-page-title">
      <span>{eyebrow}</span>
      <h1>{title}</h1>
    </header>
  );
}
