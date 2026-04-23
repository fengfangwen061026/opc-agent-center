import type { SkillDescriptorV1 } from "@opc/shared";
import { cn } from "../utils";
import { GlassCard } from "./GlassCard";
import { StatusPill } from "./StatusPill";

export type SkillCardProps = {
  skill: SkillDescriptorV1;
  className?: string;
};

export function SkillCard({ className, skill }: SkillCardProps) {
  return (
    <GlassCard className={cn("opc-skill-card", className)} interactive>
      <div className="opc-skill-card__header">
        <strong>{skill.name}</strong>
        <span className="opc-risk-badge">{skill.risk}</span>
      </div>
      <p>{skill.description}</p>
      <div className="opc-skill-card__meta">
        <StatusPill
          status={skill.lifecycle === "stable" ? "completed" : "planning"}
          label={skill.lifecycle}
        />
        <span>生命周期：{skill.lifecycle}</span>
        <span>领域：{skill.domain}</span>
        <span>信任：{skill.trust}</span>
      </div>
    </GlassCard>
  );
}
