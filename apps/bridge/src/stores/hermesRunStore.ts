import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureDir, writeJsonFile } from "./jsonFiles";

export type HermesRunRecord = {
  id: string;
  capsuleId: string;
  mode: "context_pack" | "reflect";
  status: "requested" | "running" | "completed" | "failed";
  source: "real" | "mock" | "mock_fallback";
  inputPath: string;
  rawOutputPath?: string;
  parsedOutputPath?: string;
  candidateIds: string[];
  error?: string;
  createdAt: string;
  completedAt?: string;
};

export class HermesRunStore {
  private readonly runs = new Map<string, HermesRunRecord>();

  constructor(private readonly dir: string) {
    ensureDir(dir);
    for (const file of readdirSync(dir).filter((item) => isRunManifest(item))) {
      try {
        const run = JSON.parse(readFileSync(join(dir, file), "utf8")) as HermesRunRecord;
        if (run.id && run.createdAt) this.runs.set(run.id, run);
      } catch {
        // Ignore corrupt runtime records; they remain on disk for manual inspection.
      }
    }
  }

  list(): HermesRunRecord[] {
    return [...this.runs.values()].sort((a, b) =>
      (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
    );
  }

  get(id: string): HermesRunRecord | undefined {
    return this.runs.get(id);
  }

  start(input: {
    capsuleId: string;
    mode: HermesRunRecord["mode"];
    source: HermesRunRecord["source"];
    payload: unknown;
  }): HermesRunRecord {
    const createdAt = new Date().toISOString();
    const id = `hermes-run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const inputPath = join(this.dir, `${id}.input.json`);
    writeJsonFile(inputPath, input.payload);
    const run: HermesRunRecord = {
      id,
      capsuleId: input.capsuleId,
      mode: input.mode,
      status: "running",
      source: input.source,
      inputPath,
      candidateIds: [],
      createdAt,
    };
    this.save(run);
    return run;
  }

  complete(id: string, output: unknown, candidateIds: string[] = []): HermesRunRecord | undefined {
    const run = this.runs.get(id);
    if (!run) return undefined;
    const rawOutputPath = join(this.dir, `${id}.raw.json`);
    const parsedOutputPath = join(this.dir, `${id}.parsed.json`);
    writeJsonFile(rawOutputPath, output);
    writeJsonFile(parsedOutputPath, output);
    return this.patch(id, {
      status: "completed",
      completedAt: new Date().toISOString(),
      rawOutputPath,
      parsedOutputPath,
      candidateIds,
    });
  }

  fail(id: string, error: string): HermesRunRecord | undefined {
    const run = this.runs.get(id);
    if (!run) return undefined;
    writeFileSync(join(this.dir, `${id}.error.log`), `${error}\n`);
    return this.patch(id, {
      status: "failed",
      error,
      completedAt: new Date().toISOString(),
    });
  }

  private patch(id: string, patch: Partial<HermesRunRecord>): HermesRunRecord | undefined {
    const run = this.runs.get(id);
    if (!run) return undefined;
    const next = { ...run, ...patch };
    this.save(next);
    return next;
  }

  private save(run: HermesRunRecord): void {
    this.runs.set(run.id, run);
    writeJsonFile(join(this.dir, `${run.id}.json`), run);
  }
}

function isRunManifest(file: string): boolean {
  return (
    file.endsWith(".json") &&
    !file.endsWith(".input.json") &&
    !file.endsWith(".raw.json") &&
    !file.endsWith(".parsed.json")
  );
}
