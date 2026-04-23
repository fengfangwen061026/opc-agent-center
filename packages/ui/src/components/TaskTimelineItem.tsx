import type { OpcEvent, TaskCapsule } from "@opc/core";
import { ArrowRight, Clock3 } from "lucide-react";
import { cn } from "../utils";
import { StatusPill } from "./StatusPill";

export type TaskTimelineItemProps = {
  event: OpcEvent;
  task?: TaskCapsule;
  onClick?: () => void;
  className?: string;
};

export function TaskTimelineItem({ className, event, onClick, task }: TaskTimelineItemProps) {
  const title =
    typeof event.payload === "object" && event.payload && "title" in event.payload
      ? String(event.payload.title)
      : event.type;

  return (
    <button className={cn("opc-task-timeline-item", className)} onClick={onClick} type="button">
      <span className="opc-task-timeline-item__rail">
        <Clock3 aria-hidden="true" size={16} />
      </span>
      <span className="opc-task-timeline-item__body">
        <span className="opc-task-timeline-item__title">{title}</span>
        <span className="opc-task-timeline-item__meta">
          {task ? <StatusPill status={task.status} /> : null}
          <span>{event.type}</span>
        </span>
      </span>
      <ArrowRight aria-hidden="true" size={16} />
    </button>
  );
}
