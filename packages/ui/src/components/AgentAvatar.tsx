import type { OpcAgentStatus } from "@opc/core";
import {
  Bot,
  BrainCircuit,
  Code2,
  Compass,
  Crown,
  GraduationCap,
  PenTool,
  Sparkles,
} from "lucide-react";
import { cn } from "../utils";

type AgentAvatarKind =
  | "conductor"
  | "hermes"
  | "knowledge"
  | "research"
  | "dev"
  | "publishing"
  | "learning"
  | "coding"
  | "skill"
  | "store"
  | "approval";

const iconMap = {
  conductor: Crown,
  hermes: BrainCircuit,
  knowledge: Sparkles,
  research: Compass,
  dev: Code2,
  publishing: PenTool,
  learning: GraduationCap,
  coding: Code2,
  skill: Sparkles,
  store: Bot,
  approval: Crown,
} satisfies Record<AgentAvatarKind, typeof Bot>;

export type AgentAvatarProps = {
  name: string;
  status: OpcAgentStatus | "enabled" | "connected" | "waiting";
  kind?: AgentAvatarKind;
  className?: string;
};

export function AgentAvatar({ className, kind = "conductor", name, status }: AgentAvatarProps) {
  const Icon = iconMap[kind];

  return (
    <span className={cn("opc-agent-avatar", className)} data-status={status}>
      <span className="opc-agent-avatar__orb">
        <Icon aria-hidden="true" size={18} strokeWidth={2.2} />
      </span>
      <span className="opc-agent-avatar__status" aria-label={`${name} status ${status}`} />
    </span>
  );
}
