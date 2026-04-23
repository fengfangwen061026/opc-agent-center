import { join } from "node:path";
import { agentRunV1Schema, type AgentRunV1 } from "@opc/shared";
import { readJsonFiles, writeJsonFile } from "./jsonFiles";

export class AgentRunStore {
  private readonly runs = new Map<string, AgentRunV1>();

  constructor(private readonly dir: string) {
    for (const run of readJsonFiles(dir, (input) => agentRunV1Schema.parse(input))) {
      this.runs.set(run.id, run);
    }
  }

  list(): AgentRunV1[] {
    return [...this.runs.values()].sort((a, b) =>
      (b.startedAt ?? "").localeCompare(a.startedAt ?? ""),
    );
  }

  get(id: string): AgentRunV1 | undefined {
    return this.runs.get(id);
  }

  create(
    input: Omit<AgentRunV1, "id" | "status" | "startedAt" | "assignedSkills" | "children"> & {
      id?: string;
      status?: AgentRunV1["status"];
      startedAt?: string;
      assignedSkills?: string[];
      children?: string[];
    },
  ): AgentRunV1 {
    const run = agentRunV1Schema.parse({
      ...input,
      id: input.id ?? `agent-run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      status: input.status ?? "queued",
      startedAt: input.startedAt ?? new Date().toISOString(),
      assignedSkills: input.assignedSkills ?? [],
      children: input.children ?? [],
    });
    this.runs.set(run.id, run);
    this.save(run);
    return run;
  }

  patch(id: string, patch: Partial<AgentRunV1>): AgentRunV1 | undefined {
    const existing = this.runs.get(id);
    if (!existing) return undefined;
    const next = agentRunV1Schema.parse({ ...existing, ...patch });
    this.runs.set(id, next);
    this.save(next);
    return next;
  }

  private save(run: AgentRunV1): void {
    writeJsonFile(join(this.dir, `${run.id}.json`), run);
  }
}
