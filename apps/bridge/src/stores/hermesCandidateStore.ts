import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  hermesCandidateV1Schema,
  type HermesCandidateV1,
  type HermesReflectionOutput,
} from "@opc/shared";
import type { ReflectionResult } from "@opc/core";
import { readJsonFiles, writeJsonFile } from "./jsonFiles";

export class HermesCandidateStore {
  private readonly candidates = new Map<string, HermesCandidateV1>();

  constructor(private readonly dir: string) {
    for (const candidate of readJsonFiles(dir, (input) => hermesCandidateV1Schema.parse(input))) {
      this.candidates.set(candidate.id, candidate);
    }
  }

  list(): HermesCandidateV1[] {
    return [...this.candidates.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  get(id: string): HermesCandidateV1 | undefined {
    return this.candidates.get(id);
  }

  createManyFromReflection(
    capsuleId: string,
    result: ReflectionResult | HermesReflectionOutput,
  ): HermesCandidateV1[] {
    const now = new Date().toISOString();
    const candidates: HermesCandidateV1[] = [];
    const memoryCandidates =
      "memoryCandidates" in result
        ? result.memoryCandidates.map((item) =>
            typeof item === "string"
              ? { title: "Hermes 记忆候选", rationale: "任务反思提取", content: item }
              : item,
          )
        : [];
    for (const item of memoryCandidates) {
      candidates.push(
        hermesCandidateV1Schema.parse({
          id: `hermes-memory-${Date.now()}-${candidates.length}`,
          kind: "memory_update",
          status: "waiting_review",
          sourceCapsuleId: capsuleId,
          title: item.title ?? "Hermes 记忆候选",
          rationale: item.rationale ?? "任务反思提取",
          content: item.content ?? String(item),
          risk: "S1",
          createdAt: now,
          updatedAt: now,
        }),
      );
    }
    const skillPatches =
      "skillPatches" in result
        ? result.skillPatches.map((patch) => ({
            title: patch.title,
            rationale: patch.summary,
            content: patch.after,
            targetPath: `skill:${patch.skillName}`,
            patch: patch.after,
          }))
        : "skillPatchCandidates" in result
          ? result.skillPatchCandidates.map((patch) => ({
              title: `Skill patch: ${patch.skillId}`,
              rationale: patch.rationale,
              content: patch.patch,
              targetPath: `skill:${patch.skillId}`,
              patch: patch.patch,
            }))
          : [];
    for (const patch of skillPatches) {
      candidates.push(
        hermesCandidateV1Schema.parse({
          id: `hermes-skill-${Date.now()}-${candidates.length}`,
          kind: "skill_patch",
          status: "waiting_review",
          sourceCapsuleId: capsuleId,
          title: patch.title,
          rationale: patch.rationale,
          content: patch.content,
          targetPath: patch.targetPath,
          patch: patch.patch,
          risk: "S2",
          createdAt: now,
          updatedAt: now,
        }),
      );
    }
    for (const candidate of candidates) this.saveCandidate(candidate);
    return candidates;
  }

  transition(
    id: string,
    status: Extract<HermesCandidateV1["status"], "approved" | "rejected" | "archived">,
  ): HermesCandidateV1 | undefined {
    const candidate = this.candidates.get(id);
    if (!candidate) return undefined;
    candidate.status = status;
    candidate.updatedAt = new Date().toISOString();
    this.saveCandidate(candidate);
    if (status === "approved") {
      const approvedDir = join(this.dir, "..", "approved-candidates");
      mkdirSync(approvedDir, { recursive: true });
      writeJsonFile(join(approvedDir, `${candidate.id}.json`), candidate);
    }
    return candidate;
  }

  apply(
    id: string,
    input: { experimentalRoot: string; memoryRoot: string },
  ): { candidate: HermesCandidateV1; path: string } | undefined {
    const candidate = this.candidates.get(id);
    if (!candidate) return undefined;
    if (candidate.status === "applied") {
      return { candidate, path: candidate.targetPath ?? "" };
    }
    let appliedPath: string;
    if (candidate.kind === "memory_update" || candidate.kind === "memory_candidate") {
      mkdirSync(join(input.memoryRoot, "memory-drafts"), { recursive: true });
      mkdirSync(input.memoryRoot, { recursive: true });
      appliedPath = join(input.memoryRoot, "memory-drafts", `${candidate.id}.md`);
      writeFileSync(
        appliedPath,
        `# ${candidate.title}\n\n${candidate.content}\n\n## Rationale\n\n${candidate.rationale}\n`,
      );
      appendFileSync(
        join(input.memoryRoot, "approved-memory-candidates.jsonl"),
        `${JSON.stringify({ ...candidate, appliedPath, appliedAt: new Date().toISOString() })}\n`,
      );
    } else if (candidate.kind === "new_skill" || candidate.kind === "new_skill_candidate") {
      const skillId = slugify(candidate.title.replace(/^new skill:/i, ""));
      appliedPath = join(input.experimentalRoot, skillId);
      mkdirSync(join(appliedPath, "evals"), { recursive: true });
      writeFileSync(join(appliedPath, "SKILL.md"), candidate.content);
      writeFileSync(
        join(appliedPath, "README.md"),
        `# ${candidate.title}\n\n${candidate.rationale}\n`,
      );
      writeFileSync(join(appliedPath, "evals", "cases.json"), "[]\n");
    } else if (candidate.kind === "eval_candidate") {
      const skillId = skillIdFromTarget(candidate) ?? slugify(candidate.title);
      appliedPath = join(input.experimentalRoot, skillId, "evals", "cases.json");
      mkdirSync(join(appliedPath, ".."), { recursive: true });
      writeFileSync(appliedPath, candidate.content);
    } else {
      const skillId = skillIdFromTarget(candidate) ?? slugify(candidate.title);
      appliedPath = join(input.experimentalRoot, `${skillId}-patch-${candidate.id}`);
      mkdirSync(appliedPath, { recursive: true });
      writeFileSync(join(appliedPath, "SKILL.md"), candidate.patch ?? candidate.content);
      writeFileSync(
        join(appliedPath, "PATCH_NOTES.md"),
        `# ${candidate.title}\n\n${candidate.rationale}\n\nSource capsule: ${candidate.sourceCapsuleId}\n`,
      );
    }
    candidate.status = "applied";
    candidate.targetPath = appliedPath;
    candidate.updatedAt = new Date().toISOString();
    this.saveCandidate(candidate);
    return { candidate, path: appliedPath };
  }

  private saveCandidate(candidate: HermesCandidateV1): void {
    this.candidates.set(candidate.id, candidate);
    writeJsonFile(join(this.dir, `${candidate.id}.json`), candidate);
  }
}

function skillIdFromTarget(candidate: HermesCandidateV1): string | undefined {
  return candidate.targetPath?.startsWith("skill:") ? candidate.targetPath.slice(6) : undefined;
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "hermes-candidate"
  );
}
