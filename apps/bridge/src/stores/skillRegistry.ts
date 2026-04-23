import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { parse } from "yaml";
import { skillDescriptorV1Schema, type SkillDescriptorV1, type SkillDomain } from "@opc/shared";
import type { OpcSkill } from "@opc/core";
import mockSkillsJson from "../../../../data/mock/skills.json";

export type SkillRegistryEntry = {
  descriptor: SkillDescriptorV1;
  markdown: string;
  readme: string;
  files: string[];
};

export type SkillRegistryScanResult = {
  scannedAt: string;
  roots: string[];
  skills: SkillDescriptorV1[];
  warnings: string[];
};

export class SkillRegistry {
  private readonly entries = new Map<string, SkillRegistryEntry>();
  private lastScan: SkillRegistryScanResult | undefined;

  constructor(
    private readonly roots: string[],
    private readonly cachePath: string,
  ) {}

  scan(): SkillRegistryScanResult {
    this.entries.clear();
    const warnings: string[] = [];
    for (const root of this.roots) {
      if (!existsSync(root)) {
        warnings.push(`Skill root 不存在：${root}`);
        continue;
      }
      for (const skillDir of findSkillDirs(root)) {
        try {
          const entry = readSkillDir(skillDir, root);
          this.entries.set(entry.descriptor.id, entry);
        } catch (error) {
          warnings.push(
            `${skillDir} 解析失败：${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }
    for (const entry of mockEntries()) {
      if (!this.entries.has(entry.descriptor.id)) this.entries.set(entry.descriptor.id, entry);
    }
    this.lastScan = {
      scannedAt: new Date().toISOString(),
      roots: this.roots,
      skills: this.list(),
      warnings,
    };
    this.persistCache();
    return this.lastScan;
  }

  list(): SkillDescriptorV1[] {
    return [...this.entries.values()]
      .map((entry) => entry.descriptor)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  get(id: string): SkillRegistryEntry | undefined {
    return (
      this.entries.get(id) ??
      [...this.entries.values()].find((entry) => entry.descriptor.name === id)
    );
  }

  readme(id: string): string | undefined {
    return this.get(id)?.readme;
  }

  source(id: string): string | undefined {
    return this.get(id)?.markdown;
  }

  status(): SkillRegistryScanResult {
    return this.lastScan ?? this.scan();
  }

  updateUsage(skillId: string, succeeded: boolean): void {
    const entry = this.get(skillId);
    if (!entry) return;
    entry.descriptor.usage = {
      totalRuns: entry.descriptor.usage.totalRuns + 1,
      successRuns: entry.descriptor.usage.successRuns + (succeeded ? 1 : 0),
      lastRunAt: new Date().toISOString(),
    };
    this.persistCache();
  }

  private persistCache(): void {
    mkdirSync(join(this.cachePath, ".."), { recursive: true });
    writeFileSync(this.cachePath, `${JSON.stringify(this.statusNoScan(), null, 2)}\n`);
  }

  private statusNoScan(): SkillRegistryScanResult {
    return (
      this.lastScan ?? {
        scannedAt: new Date().toISOString(),
        roots: this.roots,
        skills: this.list(),
        warnings: [],
      }
    );
  }
}

function findSkillDirs(root: string): string[] {
  const output: string[] = [];
  const visit = (dir: string) => {
    if (existsSync(join(dir, "SKILL.md"))) {
      output.push(dir);
      return;
    }
    for (const child of readdirSync(dir)) {
      const childPath = join(dir, child);
      if (statSync(childPath).isDirectory()) visit(childPath);
    }
  };
  visit(root);
  return output;
}

function readSkillDir(skillDir: string, root: string): SkillRegistryEntry {
  const skillPath = join(skillDir, "SKILL.md");
  const markdown = readFileSync(skillPath, "utf8");
  const frontmatter = parseFrontmatter(markdown);
  const opc = nestedRecord(frontmatter, ["metadata", "opc"]);
  const id = stringValue(frontmatter.name) ?? basename(skillDir);
  const descriptor = skillDescriptorV1Schema.parse({
    id,
    name: stringValue(frontmatter.name) ?? id,
    description: stringValue(frontmatter.description) ?? "",
    version: stringValue(frontmatter.version) ?? "0.0.0",
    path: skillPath,
    source: sourceFor(root),
    lifecycle: enumValue(opc.lifecycle, ["draft", "experimental", "stable", "deprecated"], "draft"),
    trust: enumValue(
      opc.trust,
      ["trusted", "review_required", "untrusted", "blocked"],
      "review_required",
    ),
    domain: enumValue(
      opc.domain,
      [
        "core",
        "knowledge",
        "research",
        "coding",
        "ops",
        "publishing",
        "learning",
        "memory",
        "unknown",
      ],
      "unknown",
    ),
    ownerAgent: stringValue(opc.owner_agent ?? opc.ownerAgent),
    risk: enumValue(opc.risk, ["S0", "S1", "S2", "S3", "S4"], "S3"),
    approvalRequired: booleanValue(opc.approval_required ?? opc.approvalRequired, true),
    reads: stringArray(opc.reads),
    writes: stringArray(opc.writes),
    requires: {
      bins: stringArray(nestedRecord(opc, ["requires"]).bins),
      env: stringArray(nestedRecord(opc, ["requires"]).env),
      services: stringArray(nestedRecord(opc, ["requires"]).services),
    },
    capabilities: stringArray(opc.capabilities),
    runner: stringValue(opc.runner),
    evalStatus: enumValue(
      opc.eval_status ?? opc.evalStatus,
      ["none", "passing", "failing", "unknown"],
      "none",
    ),
    frontmatter,
    updatedAt: statSync(skillPath).mtime.toISOString(),
  });
  return {
    descriptor,
    markdown,
    readme: existsSync(join(skillDir, "README.md"))
      ? readFileSync(join(skillDir, "README.md"), "utf8")
      : markdown,
    files: readdirSync(skillDir).map((file) => relative(skillDir, join(skillDir, file))),
  };
}

function parseFrontmatter(markdown: string): Record<string, unknown> {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const parsed = parse(match[1]) as unknown;
  return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
}

function mockEntries(): SkillRegistryEntry[] {
  const now = new Date().toISOString();
  return (mockSkillsJson as OpcSkill[]).map((skill) => {
    const domain = mapLegacyDomain(skill.domain);
    const descriptor = skillDescriptorV1Schema.parse({
      id: skill.name,
      name: skill.name,
      description: skill.description,
      version: skill.version ?? "0.0.0",
      path: skill.path,
      source: "mock",
      lifecycle:
        skill.status === "draft"
          ? "draft"
          : skill.status === "deprecated"
            ? "deprecated"
            : "stable",
      trust:
        skill.trustState === "quarantined"
          ? "blocked"
          : skill.trustState === "experimental"
            ? "review_required"
            : "trusted",
      domain,
      ownerAgent: skill.ownerAgent,
      risk: skill.risk,
      approvalRequired: ["S3", "S4"].includes(skill.risk),
      writes: skill.writesTo,
      capabilities: skill.externalActions,
      evalStatus: skill.eval.status === "not_configured" ? "none" : skill.eval.status,
      usage: {
        totalRuns: skill.usage.count,
        successRuns: Math.round(skill.usage.count * (skill.usage.successRate ?? 0)),
        lastRunAt: skill.usage.lastUsedAt,
      },
      frontmatter: { legacy: skill },
      updatedAt: now,
    });
    return {
      descriptor,
      markdown: `# ${skill.name}\n\n${skill.description}\n`,
      readme: `# ${skill.name}\n\n${skill.description}\n`,
      files: ["SKILL.md"],
    };
  });
}

function mapLegacyDomain(domain: OpcSkill["domain"]): SkillDomain {
  const map: Record<OpcSkill["domain"], SkillDomain> = {
    dev: "coding",
    governance: "core",
    knowledge: "knowledge",
    learning: "learning",
    ops: "ops",
    other: "unknown",
    publishing: "publishing",
    research: "research",
  };
  return map[domain];
}

function sourceFor(root: string): SkillDescriptorV1["source"] {
  if (root.includes("shared-skills")) return "shared";
  if (root.includes("openclaw")) return "workspace";
  return "personal";
}

function nestedRecord(input: Record<string, unknown>, path: string[]): Record<string, unknown> {
  let current: unknown = input;
  for (const part of path) {
    if (!current || typeof current !== "object") return {};
    current = (current as Record<string, unknown>)[part];
  }
  return current && typeof current === "object" ? (current as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}
