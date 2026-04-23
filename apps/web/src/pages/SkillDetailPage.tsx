import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { useParams } from "react-router-dom";
import { Check, GitCompare, Play, Save, X } from "lucide-react";
import { GlassCard, LiquidButton, StatusPill } from "@opc/ui";
import {
  actSkillPatch,
  createSkillPromotion,
  getSkillDetail,
  getSkillEvals,
  getSkillPromotions,
  runSkill,
  runSkillEval,
  saveSkillMarkdown,
} from "../lib/api";

const tabs = ["说明", "元数据", "流程", "权限", "评测", "使用", "演化", "文件"] as const;

export function SkillDetailPage() {
  const { name = "" } = useParams();
  const decodedName = decodeURIComponent(name);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<(typeof tabs)[number]>("说明");
  const { data: detail } = useQuery({
    queryKey: ["skill", decodedName],
    queryFn: () => getSkillDetail(decodedName),
  });
  const [markdownDraft, setMarkdownDraft] = useState<string | null>(null);
  const { data: evals = [] } = useQuery({ queryKey: ["skill-evals"], queryFn: getSkillEvals });
  const { data: promotions = [] } = useQuery({
    queryKey: ["skill-promotions"],
    queryFn: getSkillPromotions,
  });
  const canEdit = detail
    ? detail.skill.lifecycle === "draft" || detail.skill.trust === "review_required"
    : false;
  const procedure = useMemo(
    () =>
      (detail?.markdown.match(/^\d+\.\s.+$/gm) ?? []).map((line) => line.replace(/^\d+\.\s/, "")),
    [detail],
  );
  const saveMutation = useMutation({
    mutationFn: () => saveSkillMarkdown(decodedName, markdownDraft ?? detail?.markdown ?? ""),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["skill", decodedName] }),
  });
  const patchMutation = useMutation({
    mutationFn: ({ patchId, action }: { patchId: string; action: "approve" | "reject" }) =>
      actSkillPatch(decodedName, patchId, action),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["skill", decodedName] }),
  });
  const runMutation = useMutation({
    mutationFn: (mode: "dry_run" | "preview" | "execute") =>
      runSkill(detail?.skill.id ?? decodedName, {
        mode,
        input: { prompt: `从 Skill Detail 运行 ${detail?.skill.name ?? decodedName}` },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["skill", decodedName] }),
  });
  const evalMutation = useMutation({
    mutationFn: () => runSkillEval(detail?.skill.id ?? decodedName),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["skill-evals"] }),
  });
  const promotionMutation = useMutation({
    mutationFn: (to: "experimental" | "stable") =>
      createSkillPromotion(detail?.skill.id ?? decodedName, to),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skill-promotions"] });
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
    },
  });

  if (!detail) return null;
  const markdown = markdownDraft ?? detail.markdown;

  return (
    <section className="opc-page-stack">
      <header className="opc-page-title">
        <span>技能详情</span>
        <h1>{detail.skill.name}</h1>
      </header>
      <GlassCard className="opc-action-card">
        <div className="opc-panel-heading">
          <strong>受控运行</strong>
          <StatusPill label={detail.skill.risk} status="waiting_approval" />
        </div>
        <div className="opc-action-row">
          <LiquidButton icon={<Play size={15} />} onClick={() => runMutation.mutate("dry_run")}>
            Dry-run
          </LiquidButton>
          <LiquidButton onClick={() => runMutation.mutate("preview")} variant="secondary">
            Preview
          </LiquidButton>
          <LiquidButton onClick={() => runMutation.mutate("execute")} variant="ghost">
            Execute
          </LiquidButton>
        </div>
        <p>S3/S4 或 approvalRequired=true 会进入审批门禁，不会直接执行。</p>
        <p>
          runner={detail.skill.runner ?? "builtin.echo fallback"} · approvalRequired=
          {String(detail.skill.approvalRequired)} · trust={detail.skill.trust}
        </p>
      </GlassCard>
      <GlassCard className="opc-detail-shell">
        <div className="opc-tab-list">
          {tabs.map((item) => (
            <button
              className={tab === item ? "is-active" : undefined}
              key={item}
              onClick={() => setTab(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
        {tab === "说明" ? (
          <div className="opc-markdown-grid">
            <div className="opc-markdown">
              <ReactMarkdown>{markdown}</ReactMarkdown>
            </div>
            <div className="opc-editor">
              <textarea
                disabled={!canEdit}
                onChange={(event) => setMarkdownDraft(event.target.value)}
                value={markdown}
              />
              <LiquidButton
                disabled={!canEdit}
                icon={<Save size={16} />}
                onClick={() => saveMutation.mutate()}
              >
                保存草稿
              </LiquidButton>
              {!canEdit ? <p>稳定技能不能直接编辑，后续流程需要先克隆为草稿。</p> : null}
            </div>
          </div>
        ) : null}
        {tab === "元数据" ? <pre>{JSON.stringify(detail.skill, null, 2)}</pre> : null}
        {tab === "流程" ? (
          <ol className="opc-procedure-list">
            {procedure.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        ) : null}
        {tab === "权限" ? (
          <div className="opc-detail-grid">
            <div>
              <dt>风险</dt>
              <dd>{detail.skill.risk}</dd>
            </div>
            <div>
              <dt>写入目标</dt>
              <dd>{detail.skill.writes.join(", ") || "无"}</dd>
            </div>
            <div>
              <dt>能力</dt>
              <dd>{detail.skill.capabilities.join(", ") || "无"}</dd>
            </div>
          </div>
        ) : null}
        {tab === "评测" ? (
          <div className="opc-context-block">
            <StatusPill
              status={detail.skill.evalStatus === "passing" ? "completed" : "planned"}
              label={detail.skill.evalStatus}
            />
            <LiquidButton onClick={() => evalMutation.mutate()} variant="secondary">
              运行安全评测
            </LiquidButton>
            <ul>
              {evals
                .filter((item) => item.skillId === detail.skill.id)
                .map((item) => (
                  <li key={item.id}>
                    {item.id} · {item.status} · {item.casesPassed}/{item.casesTotal}
                  </li>
                ))}
            </ul>
          </div>
        ) : null}
        {tab === "使用" ? (
          <div className="opc-detail-section">
            <pre>{JSON.stringify(detail.skill.usage, null, 2)}</pre>
            <strong>近期运行</strong>
            <ul>
              {(detail.runs ?? []).map((run) => (
                <li key={run.id}>
                  {run.id} · {run.mode} · {run.status} · {run.approvalId ?? "无审批"}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {tab === "演化" ? (
          <div className="opc-patch-list">
            <GlassCard className="opc-action-card">
              <div className="opc-panel-heading">
                <strong>Promotion</strong>
                <StatusPill label="需审批" status="waiting_approval" />
              </div>
              <p>experimental → stable 需要 eval passed + approval；stable 覆盖前自动备份。</p>
              <div className="opc-action-row">
                <LiquidButton
                  onClick={() => promotionMutation.mutate("experimental")}
                  variant="secondary"
                >
                  请求 experimental
                </LiquidButton>
                <LiquidButton onClick={() => promotionMutation.mutate("stable")} variant="ghost">
                  请求 stable
                </LiquidButton>
              </div>
              <ul>
                {promotions
                  .filter((item) => item.skillId === detail.skill.id)
                  .map((item) => (
                    <li key={item.id}>
                      {item.from} → {item.to} · {item.status}
                    </li>
                  ))}
              </ul>
            </GlassCard>
            {detail.patches.map((patch) => (
              <article className="opc-patch-card" key={patch.id}>
                <div className="opc-panel-heading">
                  <strong>{patch.title}</strong>
                  <StatusPill
                    status={patch.status === "experimental" ? "evolving" : "planning"}
                    label={patch.status}
                  />
                </div>
                <p>{patch.summary}</p>
                <div className="opc-diff-view">
                  <pre>- {patch.before}</pre>
                  <pre>+ {patch.after}</pre>
                </div>
                <div className="opc-action-row">
                  <LiquidButton
                    icon={<Check size={15} />}
                    onClick={() => patchMutation.mutate({ patchId: patch.id, action: "approve" })}
                    variant="secondary"
                  >
                    批准
                  </LiquidButton>
                  <LiquidButton
                    icon={<X size={15} />}
                    onClick={() => patchMutation.mutate({ patchId: patch.id, action: "reject" })}
                    variant="ghost"
                  >
                    拒绝
                  </LiquidButton>
                  <GitCompare size={17} />
                </div>
              </article>
            ))}
          </div>
        ) : null}
        {tab === "文件" ? (
          <ul className="opc-file-list">
            {detail.files.map((file) => (
              <li key={file}>{file}</li>
            ))}
          </ul>
        ) : null}
      </GlassCard>
    </section>
  );
}
