import { join } from "node:path";
import { skillRunV1Schema, type SkillRunV1 } from "@opc/shared";
import { readJsonFiles, writeJsonFile } from "./jsonFiles";

export class SkillRunStore {
  private readonly runs = new Map<string, SkillRunV1>();

  constructor(private readonly dir: string) {
    for (const run of readJsonFiles(dir, (input) => skillRunV1Schema.parse(input))) {
      this.runs.set(run.id, run);
    }
  }

  list(): SkillRunV1[] {
    return [...this.runs.values()].sort((a, b) =>
      (b.startedAt ?? "").localeCompare(a.startedAt ?? ""),
    );
  }

  get(id: string): SkillRunV1 | undefined {
    return this.runs.get(id);
  }

  create(
    input: Omit<SkillRunV1, "id" | "status" | "events"> & {
      id?: string;
      status?: SkillRunV1["status"];
      events?: string[];
    },
  ): SkillRunV1 {
    const now = new Date().toISOString();
    const run = skillRunV1Schema.parse({
      ...input,
      id: input.id ?? `skill-run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      status: input.status ?? "queued",
      events: input.events ?? [],
      startedAt: input.startedAt ?? now,
    });
    this.runs.set(run.id, run);
    this.save(run);
    return run;
  }

  patch(id: string, patch: Partial<SkillRunV1>): SkillRunV1 | undefined {
    const existing = this.runs.get(id);
    if (!existing) return undefined;
    const next = skillRunV1Schema.parse({ ...existing, ...patch });
    this.runs.set(id, next);
    this.save(next);
    return next;
  }

  cancel(id: string): SkillRunV1 | undefined {
    return this.patch(id, { status: "cancelled", completedAt: new Date().toISOString() });
  }

  private save(run: SkillRunV1): void {
    writeJsonFile(join(this.dir, `${run.id}.json`), run);
  }
}
