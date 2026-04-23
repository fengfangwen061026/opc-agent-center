import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { OpcEvent } from "@opc/shared";

export type EventHandler = (event: OpcEvent) => void;

export class EventBus {
  private readonly handlers = new Set<EventHandler>();
  private readonly events: OpcEvent[] = [];

  constructor(
    private readonly filePath: string,
    private readonly maxEvents = 2000,
  ) {
    this.load();
  }

  publish(event: OpcEvent): void {
    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events.splice(0, this.events.length - this.maxEvents);
    }
    this.persist(event);
    for (const handler of this.handlers) handler(event);
  }

  recent(limit = 100): OpcEvent[] {
    return this.events.slice(-Math.max(0, limit));
  }

  subscribe(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private load(): void {
    try {
      const raw = readFileSync(this.filePath, "utf8");
      const events = raw
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line) as OpcEvent)
        .slice(-this.maxEvents);
      this.events.push(...events);
    } catch {
      // Missing or malformed event logs must not block Bridge startup.
    }
  }

  private persist(event: OpcEvent): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      appendFileSync(this.filePath, `${JSON.stringify(event)}\n`);
    } catch {
      // Event persistence is best-effort; runtime flow should continue.
    }
  }
}
