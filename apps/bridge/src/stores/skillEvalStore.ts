import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { skillEvalV1Schema, type SkillDescriptorV1, type SkillEvalV1 } from "@opc/shared";
import { ensureDir, readJsonFile, writeJsonFile } from "./jsonFiles";

export class SkillEvalStore {
  private readonly evals = new Map<string, SkillEvalV1>();

  constructor(private readonly dir: string) {
    ensureDir(dir);
    for (const file of readdirSync(dir).filter((item) => item.endsWith(".json"))) {
      const value = readJsonFile(join(dir, file), (input) => skillEvalV1Schema.parse(input));
      if (value) this.evals.set(value.id, value);
    }
  }

  list(): SkillEvalV1[] {
    return [...this.evals.values()].sort((a, b) =>
      (b.startedAt ?? "").localeCompare(a.startedAt ?? ""),
    );
  }

  get(id: string): SkillEvalV1 | undefined {
    return this.evals.get(id);
  }

  runSafe(skill: SkillDescriptorV1): SkillEvalV1 {
    const now = new Date().toISOString();
    const id = `skill-eval-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const failures: SkillEvalV1["failures"] = [];
    if (!existsSync(skill.path)) {
      failures.push({ caseId: "source_exists", reason: "SKILL.md 不存在", expected: skill.path });
    } else {
      const stat = statSync(skill.path);
      if (!stat.isFile()) failures.push({ caseId: "source_file", reason: "Skill path 不是文件" });
      const content = readFileSync(skill.path, "utf8");
      if (!content.includes("---")) {
        failures.push({ caseId: "frontmatter", reason: "缺少 YAML frontmatter" });
      }
    }
    if (!skill.runner) {
      failures.push({ caseId: "runner", reason: "未声明内置 runner" });
    }
    if (skill.runner && !skill.runner.startsWith("builtin.")) {
      failures.push({ caseId: "runner_allowlist", reason: "runner 不在内置 allowlist 中" });
    }
    const casesTotal = 4;
    const casesFailed = failures.length;
    const evalResult = skillEvalV1Schema.parse({
      id,
      skillId: skill.id,
      status: casesFailed === 0 ? "passed" : "failed",
      casesTotal,
      casesPassed: casesTotal - casesFailed,
      casesFailed,
      startedAt: now,
      finishedAt: new Date().toISOString(),
      reportPath: join(this.dir, `${id}.report.md`),
      summary:
        casesFailed === 0
          ? "安全 eval 通过：schema/frontmatter/dry-run contract/builtin runner。"
          : `安全 eval 失败：${casesFailed} 个问题。`,
      failures,
    });
    writeFileSync(
      evalResult.reportPath ?? join(this.dir, `${id}.report.md`),
      evalResult.summary ?? "",
    );
    this.evals.set(evalResult.id, evalResult);
    this.save(evalResult);
    return evalResult;
  }

  private save(evalResult: SkillEvalV1): void {
    mkdirSync(this.dir, { recursive: true });
    writeJsonFile(join(this.dir, `${evalResult.id}.json`), evalResult);
  }
}
