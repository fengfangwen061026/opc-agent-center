import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CodingAgentRun, CodingRunAction } from "@opc/core";

const execFileAsync = promisify(execFile);

export interface CodingAgentAdapter {
  listRuns(): Promise<CodingAgentRun[]>;
  getRun(id: string): Promise<CodingAgentRun | undefined>;
  act(input: CodingRunAction): Promise<CodingAgentRun | undefined>;
}

export type CodingAgentAdapterConfig = {
  codexCliPath?: string;
  claudeCliPath?: string;
};

const mockRuns: CodingAgentRun[] = [
  {
    id: "run-codex-dashboard",
    provider: "codex",
    status: "completed",
    taskId: "task-codex-feature",
    repoPath: "/home/ffw/opc-agent-center",
    worktreePath: "/home/ffw/opc-agent-center",
    branch: "feature/opc-dashboard",
    startedAt: "2026-04-22T14:08:00.000Z",
    endedAt: "2026-04-22T14:16:00.000Z",
    filesChanged: ["apps/web/src/pages/CommandCenterPage.tsx", "packages/core/src/index.ts"],
    tests: [
      { name: "pnpm typecheck", status: "passed", durationMs: 4200 },
      { name: "pnpm lint", status: "passed", durationMs: 3100 },
      { name: "pnpm test", status: "passed", durationMs: 1800 },
    ],
    diffSummary: "新增驾驶舱脚手架、mock schema 校验和 React Flow 星座图。",
    approvalNotificationId: "notif-codex-review",
  },
  {
    id: "run-claude-review",
    provider: "claude-code",
    status: "queued",
    taskId: "task-codex-feature",
    repoPath: "/home/ffw/opc-agent-center",
    branch: "review/opc-dashboard",
    startedAt: "2026-04-22T14:18:00.000Z",
    filesChanged: [],
    tests: [{ name: "审阅待执行", status: "not_run" }],
    diffSummary: "已排队进入备选审阅路径。",
  },
];

export class MockCodingAgentAdapter implements CodingAgentAdapter {
  private runs = [...mockRuns];

  async listRuns(): Promise<CodingAgentRun[]> {
    return this.runs;
  }

  async getRun(id: string): Promise<CodingAgentRun | undefined> {
    return this.runs.find((run) => run.id === id);
  }

  async act(input: CodingRunAction): Promise<CodingAgentRun | undefined> {
    const run = this.runs.find((candidate) => candidate.id === input.runId);
    if (!run) return undefined;
    if (input.action === "request_changes") run.status = "blocked";
    return run;
  }
}

export class FeatureFlagCodingAgentAdapter extends MockCodingAgentAdapter {
  readonly realExecutionEnabled = process.env.CODING_AGENT_REAL === "true";

  constructor(private readonly config: CodingAgentAdapterConfig = {}) {
    super();
  }

  async listRuns(): Promise<CodingAgentRun[]> {
    const runs = await super.listRuns();
    const [codexAvailable, claudeAvailable] = await Promise.all([
      commandExists(this.config.codexCliPath ?? "codex"),
      commandExists(this.config.claudeCliPath ?? "claude"),
    ]);
    return runs.map((run) => {
      if (run.provider === "codex" && !codexAvailable) {
        return {
          ...run,
          status: "failed",
          diffSummary: `${run.diffSummary} TODO: codex CLI 未安装。`,
        };
      }
      if (run.provider === "claude-code" && !claudeAvailable) {
        return {
          ...run,
          status: "failed",
          diffSummary: `${run.diffSummary} TODO: Claude Code CLI 未安装。`,
        };
      }
      return run;
    });
  }
}

export function createCodingAgentAdapter(
  config: CodingAgentAdapterConfig = {},
): CodingAgentAdapter {
  return new FeatureFlagCodingAgentAdapter(config);
}

async function commandExists(command: string): Promise<boolean> {
  try {
    await execFileAsync(command, ["--version"], { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}
