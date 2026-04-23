import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Filter, Play, RefreshCw, Search } from "lucide-react";
import { GlassCard, LiquidButton, SkillCard, StatusPill } from "@opc/ui";
import { getSkillRuns, getSkills, rescanSkills, runSkill } from "../lib/api";

export function SkillsPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState("");
  const [risk, setRisk] = useState("");
  const [lifecycle, setLifecycle] = useState("");
  const [trust, setTrust] = useState("");
  const params = useMemo(() => {
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    if (domain) search.set("domain", domain);
    if (risk) search.set("risk", risk);
    if (lifecycle) search.set("lifecycle", lifecycle);
    if (trust) search.set("trust", trust);
    return search;
  }, [domain, lifecycle, query, risk, trust]);
  const { data: skills = [] } = useQuery({
    queryKey: ["skills", params.toString()],
    queryFn: () => getSkills(params),
  });
  const { data: runs = [] } = useQuery({ queryKey: ["skill-runs"], queryFn: getSkillRuns });
  const scanMutation = useMutation({
    mutationFn: rescanSkills,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["skills"] }),
  });
  const runMutation = useMutation({
    mutationFn: (id: string) =>
      runSkill(id, { mode: "dry_run", input: { prompt: "来自 Skill Center 的 dry-run" } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skill-runs"] });
      queryClient.invalidateQueries({ queryKey: ["capsules"] });
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
    },
  });

  return (
    <section className="opc-page-stack">
      <header className="opc-page-title">
        <span>技能注册表</span>
        <h1>技能</h1>
      </header>
      <GlassCard className="opc-action-card">
        <div className="opc-panel-heading">
          <strong>Registry 控制</strong>
          <LiquidButton
            icon={<RefreshCw size={15} />}
            onClick={() => scanMutation.mutate()}
            variant="secondary"
          >
            重新扫描
          </LiquidButton>
        </div>
        <p>
          扫描 OPC_SKILL_ROOTS；未知字段默认 risk=S3、approvalRequired=true、trust=review_required。
        </p>
      </GlassCard>
      <GlassCard className="opc-filter-bar">
        <Search size={18} />
        <input
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索技能"
          value={query}
        />
        <Filter size={18} />
        <select onChange={(event) => setDomain(event.target.value)} value={domain}>
          <option value="">全部领域</option>
          {[
            "core",
            "knowledge",
            "research",
            "coding",
            "ops",
            "publishing",
            "learning",
            "memory",
            "unknown",
          ].map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select onChange={(event) => setRisk(event.target.value)} value={risk}>
          <option value="">全部风险</option>
          {["S0", "S1", "S2", "S3", "S4"].map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select onChange={(event) => setLifecycle(event.target.value)} value={lifecycle}>
          <option value="">全部生命周期</option>
          {["stable", "experimental", "draft", "deprecated"].map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select onChange={(event) => setTrust(event.target.value)} value={trust}>
          <option value="">全部信任态</option>
          {["trusted", "review_required", "untrusted", "blocked"].map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </GlassCard>
      <div className="opc-card-grid">
        {skills.map((skill) => (
          <div className="opc-action-card" key={skill.id}>
            <Link to={`/skills/${encodeURIComponent(skill.id)}`}>
              <SkillCard skill={skill} />
            </Link>
            <div className="opc-action-row">
              <LiquidButton
                disabled={runMutation.isPending}
                icon={<Play size={15} />}
                onClick={() => runMutation.mutate(skill.id)}
                variant="secondary"
              >
                Dry-run
              </LiquidButton>
              <StatusPill
                label={`运行 ${runs.filter((run) => run.skillId === skill.id).length}`}
                status="idle"
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
