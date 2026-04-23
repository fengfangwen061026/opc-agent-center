import { CircleCheck, CircleDotDashed, CircleOff } from "lucide-react";
import { cn } from "../utils";

export type ConnectionState =
  | "connected"
  | "reconnecting"
  | "offline"
  | "available"
  | "unavailable";

export type ConnectionBadgeProps = {
  label: string;
  state: ConnectionState;
  className?: string;
};

export function ConnectionBadge({ className, label, state }: ConnectionBadgeProps) {
  const normalized =
    state === "available" ? "connected" : state === "unavailable" ? "offline" : state;
  const Icon =
    normalized === "connected"
      ? CircleCheck
      : normalized === "reconnecting"
        ? CircleDotDashed
        : CircleOff;

  return (
    <span className={cn("opc-connection-badge", className)} data-state={normalized}>
      <Icon aria-hidden="true" size={15} strokeWidth={2.4} />
      <span>{label}</span>
    </span>
  );
}
