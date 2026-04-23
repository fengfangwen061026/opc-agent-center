import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  ContextPackInput,
  ContextPackResult,
  HermesStatus,
  ReflectionResult,
  SkillCandidate,
  SkillPatch,
  SkillPatchInput,
  SkillProposal,
  TaskCapsule,
} from "@opc/core";
import { parseHermesJson } from "./jsonParser";

export { parseHermesJson } from "./jsonParser";

const execFileAsync = promisify(execFile);

export type HermesAdapterOptions = {
  cliPath?: string;
  realExec?: boolean;
  contextTimeoutMs?: number;
  reflectionTimeoutMs?: number;
  profile?: string;
};

export interface HermesAdapter {
  status(): Promise<HermesStatus>;
  contextPack(input: ContextPackInput): Promise<ContextPackResult>;
  reflectTask(capsule: TaskCapsule): Promise<ReflectionResult>;
  proposeSkill(input: SkillProposal): Promise<SkillCandidate>;
  patchSkill(input: SkillPatchInput): Promise<SkillPatch>;
}

export class MockHermesAdapter implements HermesAdapter {
  async status(): Promise<HermesStatus> {
    return {
      available: true,
      transport: "mock",
      version: "mock-hermes-0.1",
      memoryStatus: "mock 记忆可用",
      pendingReflections: 1,
    };
  }

  async contextPack(input: ContextPackInput): Promise<ContextPackResult> {
    return {
      userPreferences: ["知识写入先进入 Obsidian 审核队列。", "S3/S4 动作必须保留审批门禁。"],
      projectContext: [
        `任务范围：${input.goal ?? input.taskId ?? "OPC 驾驶舱"}`,
        "Skill-first 编排，避免固定 DAG 工作流系统。",
      ],
      relevantHistory: ["此前捕获任务使用 Capsule 摘要发送给 Hermes 反思。"],
      warnings: ["不要把完整日志发送给 Hermes；只发送 TaskCapsule 或用户确认片段。"],
      suggestedSkills: ["approval-risk-gate", "capsule-summarizer", "daily-trend-scout"],
    };
  }

  async reflectTask(capsule: TaskCapsule): Promise<ReflectionResult> {
    return {
      lessons: [`${capsule.title} 应把验证证据与 Capsule 输出放在一起。`],
      memoryCandidates: ["用户希望高风险自动化始终审批优先。"],
      skillPatches: [
        {
          id: `patch-${capsule.taskId}`,
          skillName: capsule.skillsUsed[0] ?? "capsule-summarizer",
          title: "收紧 Capsule 验证契约",
          summary: "要求验证区包含 schema parse 和风险门禁结果。",
          before: "## Verification\n- Summarize results.",
          after:
            "## Verification\n- 确认 schema parse。\n- 确认写入策略。\n- 确认 S3/S4 审批状态。",
          status: "proposed",
          createdAt: new Date().toISOString(),
        },
      ],
      issues: capsule.problems,
    };
  }

  async proposeSkill(input: SkillProposal): Promise<SkillCandidate> {
    return {
      name: input.title.toLowerCase().replaceAll(" ", "-"),
      markdown: `---\nname: ${input.title}\n---\n# ${input.title}\n\n${input.goal}\n`,
      skill: {
        name: input.title.toLowerCase().replaceAll(" ", "-"),
        description: input.goal,
        domain: "other",
        ownerAgent: input.ownerAgent,
        risk: input.risk,
        status: "draft",
        trustState: "experimental",
        path: `skills/draft/${input.title}/SKILL.md`,
        writesTo: [],
        externalActions: [],
        usage: { count: 0 },
        eval: { status: "not_configured" },
      },
    };
  }

  async patchSkill(input: SkillPatchInput): Promise<SkillPatch> {
    return {
      id: `patch-${input.skillName}-${Date.now()}`,
      skillName: input.skillName,
      title: `补丁 ${input.skillName}`,
      summary: input.goal,
      before: input.currentMarkdown,
      after: `${input.currentMarkdown}\n\n## Hermes 补丁\n${input.goal}\n`,
      status: "proposed",
      createdAt: new Date().toISOString(),
    };
  }
}

export class CliHermesAdapter extends MockHermesAdapter {
  constructor(private readonly options: HermesAdapterOptions = {}) {
    super();
  }

  async status(): Promise<HermesStatus> {
    try {
      const { stdout } = await execFileAsync(this.options.cliPath ?? "hermes", ["--version"], {
        timeout: 5000,
      });
      return {
        available: true,
        transport: "cli",
        version: stdout.trim(),
        memoryStatus: "cli available",
        pendingReflections: 0,
      };
    } catch (error) {
      return {
        available: false,
        transport: "cli",
        memoryStatus: error instanceof Error ? error.message : "hermes CLI unavailable",
      };
    }
  }

  override async contextPack(input: ContextPackInput): Promise<ContextPackResult> {
    if (!this.options.realExec) return super.contextPack(input);
    try {
      const { stdout } = await execFileAsync(
        this.options.cliPath ?? "hermes",
        ["chat", "-q", contextPackPrompt(input)],
        { timeout: this.options.contextTimeoutMs ?? 60000 },
      );
      const parsed = parseHermesJson<{
        userPreferences?: string[];
        projectContext?: string[];
        relevantMemories?: string[];
        constraints?: string[];
        suggestedSkills?: string[];
      }>(stdout);
      if (!parsed.ok) return super.contextPack(input);
      return {
        userPreferences: parsed.value.userPreferences ?? [],
        projectContext: parsed.value.projectContext ?? [],
        relevantHistory: parsed.value.relevantMemories ?? [],
        warnings: parsed.value.constraints ?? [],
        suggestedSkills: parsed.value.suggestedSkills ?? [],
      };
    } catch {
      return super.contextPack(input);
    }
  }

  override async reflectTask(capsule: TaskCapsule): Promise<ReflectionResult> {
    if (!this.options.realExec) return super.reflectTask(capsule);
    try {
      const { stdout } = await execFileAsync(
        this.options.cliPath ?? "hermes",
        ["chat", "-q", reflectionPrompt(capsule)],
        { timeout: this.options.reflectionTimeoutMs ?? 90000 },
      );
      const parsed = parseHermesJson<{
        memoryCandidates?: Array<{ text: string; reason?: string }>;
        skillPatchCandidates?: Array<{
          skillName: string;
          patchSummary: string;
          rationale: string;
          proposedDiff?: string;
        }>;
        newSkillCandidates?: Array<{ name: string; description: string; rationale: string }>;
        riskNotes?: string[];
      }>(stdout);
      if (!parsed.ok) return super.reflectTask(capsule);
      return {
        lessons: parsed.value.riskNotes ?? [],
        memoryCandidates: (parsed.value.memoryCandidates ?? []).map((candidate) => candidate.text),
        skillPatches: (parsed.value.skillPatchCandidates ?? []).map((candidate, index) => ({
          id: `hermes-real-${capsule.taskId}-${index}`,
          skillName: candidate.skillName,
          title: candidate.patchSummary,
          summary: candidate.rationale,
          before: "",
          after: candidate.proposedDiff ?? candidate.patchSummary,
          status: "proposed",
          createdAt: new Date().toISOString(),
        })),
        issues: (parsed.value.newSkillCandidates ?? []).map(
          (candidate) => `${candidate.name}: ${candidate.description}`,
        ),
      };
    } catch {
      return super.reflectTask(capsule);
    }
  }
}

export class HttpHermesAdapter extends MockHermesAdapter {
  constructor(private readonly baseUrl: string) {
    super();
  }

  async status(): Promise<HermesStatus> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(5000) });
      return {
        available: response.ok,
        transport: "http",
        memoryStatus: response.ok ? "http available" : "http unavailable",
      };
    } catch (error) {
      return {
        available: false,
        transport: "http",
        memoryStatus: error instanceof Error ? error.message : "hermes HTTP unavailable",
      };
    }
  }
}

export async function createHermesAdapter(
  mode: "mock" | "cli" | "http",
  baseUrl?: string,
  options: HermesAdapterOptions = {},
): Promise<HermesAdapter> {
  if (mode === "cli") {
    const adapter = new CliHermesAdapter(options);
    const status = await adapter.status();
    return status.available ? adapter : new MockHermesAdapter();
  }
  if (mode === "http" && baseUrl) {
    const adapter = new HttpHermesAdapter(baseUrl);
    const status = await adapter.status();
    return status.available ? adapter : new MockHermesAdapter();
  }
  return new MockHermesAdapter();
}

function contextPackPrompt(input: ContextPackInput): string {
  return `Return only JSON for OPC context_pack with keys userPreferences, projectContext, relevantMemories, constraints, suggestedSkills. Input: ${JSON.stringify(input)}`;
}

function reflectionPrompt(capsule: TaskCapsule): string {
  return `Return only JSON for OPC reflect_task with keys memoryCandidates, skillPatchCandidates, newSkillCandidates, riskNotes. Capsule: ${JSON.stringify(capsule)}`;
}
