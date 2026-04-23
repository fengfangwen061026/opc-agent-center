import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { codingRunV1Schema, type CodingRunV1 } from "@opc/shared";
import type { BridgeEnv } from "../lib/env";
import { sanitizeLog } from "../lib/sanitizeLog";
import { CodingWorkspaceManager, safeRealPath } from "../services/codingWorkspaceManager";
import { validateWorkspacePath } from "../services/pathSafety";
import { runCodingTestCommand } from "../services/testCommandRunner";
import { ensureDir, readJsonFile, writeJsonFile } from "./jsonFiles";

export type CreateCodingRunInput = {
  provider: "codex" | "claude_code";
  prompt: string;
  repoPath?: string;
  model?: string;
  testCommand?: string;
  approvalId?: string;
  capsuleId?: string;
};

export class CodingRunStore {
  private readonly runs = new Map<string, CodingRunV1>();

  constructor(
    private readonly dir: string,
    private readonly env: BridgeEnv,
  ) {
    ensureDir(dir);
    for (const child of readdirSync(dir)) {
      const runPath = join(dir, child, "run.json");
      if (!statSync(join(dir, child)).isDirectory() || !existsSync(runPath)) continue;
      const run = readJsonFile(runPath, (input) => codingRunV1Schema.parse(input));
      if (run) this.runs.set(run.id, run);
    }
  }

  list(): CodingRunV1[] {
    return [...this.runs.values()].sort((a, b) =>
      (b.startedAt ?? "").localeCompare(a.startedAt ?? ""),
    );
  }

  get(id: string): CodingRunV1 | undefined {
    return this.runs.get(id);
  }

  create(input: CreateCodingRunInput): CodingRunV1 {
    const id = `coding-run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const repoPath = resolve(input.repoPath ?? process.cwd());
    const workspacePath = join(this.env.codingAgentWorkspaceRoot, id);
    const run = codingRunV1Schema.parse({
      id,
      provider: input.provider,
      status: "waiting_approval",
      repoPath,
      workspacePath,
      branchName: `opc/${id}`,
      prompt: controlledPrompt(input.prompt),
      model: input.model,
      timeoutMs: this.env.codingAgentMaxTimeoutMs,
      changedFiles: [],
      testCommand: input.testCommand,
      testStatus: "not_run",
      approvalId: input.approvalId,
      capsuleId: input.capsuleId,
      startedAt: new Date().toISOString(),
    });
    this.runs.set(run.id, run);
    this.writeArtifacts(run, {
      stdout: "等待审批，尚未执行 coding worker。\n",
      stderr: "",
      diff: "diff --git a/README.md b/README.md\n# 等待审批后生成 mock diff\n",
    });
    this.save(run);
    return run;
  }

  attachApproval(id: string, approvalId: string): CodingRunV1 | undefined {
    return this.patch(id, { approvalId });
  }

  completeMock(id: string): CodingRunV1 | undefined {
    const run = this.runs.get(id);
    if (!run) return undefined;
    const now = new Date().toISOString();
    const manager = new CodingWorkspaceManager(this.env);
    const workspace = manager.createMockWorkspace(run.id, run.repoPath, run.prompt);
    const stdout = [
      "OPC controlled coding worker fallback",
      `provider=${run.provider}`,
      "真实执行默认关闭：CODING_AGENT_REAL_EXEC=0",
      `workspace=${workspace.repoDir}`,
      "已生成审查用 mock diff，不 push、不 merge、不 deploy。",
    ].join("\n");
    const diff =
      "diff --git a/opc-controlled-run.md b/opc-controlled-run.md\n" +
      "new file mode 100644\n" +
      "--- /dev/null\n" +
      "+++ b/opc-controlled-run.md\n" +
      "@@\n" +
      "+# OPC controlled coding run\n" +
      "+这是默认关闭真实执行时生成的审查占位 diff。\n";
    writeFileSync(workspace.stdoutPath, stdout);
    writeFileSync(workspace.stderrPath, "");
    writeFileSync(workspace.jsonlPath, JSON.stringify({ type: "fallback", ok: true }) + "\n");
    writeFileSync(workspace.finalPath, "Mock/fallback coding run completed.\n");
    writeFileSync(workspace.diffPath, diff);
    writeFileSync(workspace.testLogPath, "真实测试未运行：CODING_AGENT_REAL_EXEC=0\n");
    return this.patch(id, {
      status: "succeeded",
      completedAt: now,
      stdoutPath: workspace.stdoutPath,
      stderrPath: workspace.stderrPath,
      diffPath: workspace.diffPath,
      jsonlPath: workspace.jsonlPath,
      finalPath: workspace.finalPath,
      testLogPath: workspace.testLogPath,
      workspacePath: workspace.runDir,
      worktreePath: workspace.repoDir,
      workspaceMode: workspace.mode,
      changedFiles: ["opc-controlled-run.md"],
      testStatus: run.testCommand ? "skipped" : "not_run",
      finalSummary: "真实执行默认关闭，已生成可审查 mock diff。",
    });
  }

  async markApprovedOrRun(id: string): Promise<CodingRunV1 | undefined> {
    const run = this.runs.get(id);
    if (!run) return undefined;
    if (!this.env.codingAgentRealExec) return this.completeMock(id);
    const manager = new CodingWorkspaceManager(this.env);
    const repoValidation = manager.validateRepoPath(run.repoPath);
    const rootValidation = manager.validateWorkspaceRoot();
    if (!repoValidation.ok || !rootValidation.ok) {
      return this.patch(id, {
        status: "blocked",
        error: repoValidation.reason ?? rootValidation.reason,
        completedAt: new Date().toISOString(),
      });
    }
    this.patch(id, { status: "preparing_workspace" });
    let workspace;
    try {
      workspace = manager.createRunWorkspace(run.id, run.repoPath, run.prompt);
    } catch (error) {
      return this.patch(id, {
        status: "blocked",
        error: error instanceof Error ? error.message : String(error),
        completedAt: new Date().toISOString(),
      });
    }
    this.patch(id, {
      status: "running",
      workspacePath: workspace.runDir,
      worktreePath: workspace.repoDir,
      workspaceMode: workspace.mode,
      stdoutPath: workspace.stdoutPath,
      stderrPath: workspace.stderrPath,
      jsonlPath: workspace.jsonlPath,
      finalPath: workspace.finalPath,
      diffPath: workspace.diffPath,
      testLogPath: workspace.testLogPath,
    });
    let command;
    try {
      command =
        run.provider === "codex"
          ? manager.buildCodexCommandForReal(workspace.repoDir, workspace.runDir)
          : manager.buildClaudeCommandForReal(workspace.repoDir, run.prompt);
    } catch (error) {
      writeFileSync(
        workspace.stderrPath,
        `真实 coding agent 执行被安全探测阻止：${
          error instanceof Error ? error.message : String(error)
        }\n`,
      );
      return this.patch(id, {
        status: "blocked",
        error: error instanceof Error ? error.message : String(error),
        completedAt: new Date().toISOString(),
      });
    }
    const exitCode = await manager.runCommandWithTimeout(command, workspace);
    this.patch(id, { status: "collecting_artifacts" });
    const { changedFiles } = manager.collectDiff(workspace);
    writeJsonFile(join(workspace.runDir, "changed-files.json"), changedFiles);
    const finalSummary = readTextFile(workspace.finalPath) || readTextFile(workspace.stdoutPath);
    let testStatus: CodingRunV1["testStatus"] = "not_run";
    if (run.testCommand && manager.isAllowedTestCommand(run.testCommand)) {
      this.patch(id, { status: "testing_optional" });
      const testResult = await runCodingTestCommand(
        this.env,
        this.runs.get(id) ?? run,
        run.testCommand,
      );
      writeFileSync(workspace.testLogPath, `${JSON.stringify(testResult, null, 2)}\n`);
      testStatus = testResult.status === "passed" ? "passed" : "failed";
    } else if (run.testCommand) {
      writeFileSync(
        workspace.testLogPath,
        `测试命令未在 allowlist 中，已跳过：${run.testCommand}\n`,
      );
      testStatus = "skipped";
    }
    return this.patch(id, {
      status: exitCode === 0 ? "completed" : "failed",
      changedFiles,
      testStatus,
      finalSummary: finalSummary.slice(0, 2000),
      error: exitCode === 0 ? undefined : `coding agent exited with code ${exitCode}`,
      completedAt: new Date().toISOString(),
    });
  }

  reject(id: string): CodingRunV1 | undefined {
    return this.patch(id, { status: "cancelled", completedAt: new Date().toISOString() });
  }

  requestChanges(id: string): CodingRunV1 | undefined {
    return this.patch(id, { status: "blocked", completedAt: new Date().toISOString() });
  }

  readArtifact(
    id: string,
    kind: "stdout" | "stderr" | "diff" | "jsonl" | "final" | "test",
  ): string {
    const run = this.runs.get(id);
    const path =
      kind === "diff"
        ? (run?.diffPath ?? join(this.dir, id, "diff.patch"))
        : kind === "jsonl"
          ? (run?.jsonlPath ?? join(this.dir, id, "codex.jsonl"))
          : kind === "final"
            ? (run?.finalPath ?? join(this.dir, id, "final.md"))
            : kind === "test"
              ? (run?.testLogPath ?? join(this.dir, id, "test.log"))
              : kind === "stdout"
                ? (run?.stdoutPath ?? join(this.dir, id, "stdout.log"))
                : (run?.stderrPath ?? join(this.dir, id, "stderr.log"));
    return readTextFile(path);
  }

  artifacts(id: string): Record<string, string> | undefined {
    if (!this.runs.has(id)) return undefined;
    return {
      stdout: this.readArtifact(id, "stdout"),
      stderr: this.readArtifact(id, "stderr"),
      jsonl: this.readArtifact(id, "jsonl"),
      final: this.readArtifact(id, "final"),
      diff: this.readArtifact(id, "diff"),
      test: this.readArtifact(id, "test"),
    };
  }

  changedFiles(id: string): string[] | undefined {
    const run = this.runs.get(id);
    return run?.changedFiles;
  }

  workspaceInfo(id: string):
    | {
        workspacePath: string;
        worktreePath?: string;
        workspaceMode?: CodingRunV1["workspaceMode"];
        cleanupAllowed: boolean;
      }
    | undefined {
    const run = this.runs.get(id);
    if (!run) return undefined;
    return {
      workspacePath: run.workspacePath,
      worktreePath: run.worktreePath,
      workspaceMode: run.workspaceMode,
      cleanupAllowed: Boolean(
        validateWorkspacePath(run.workspacePath, this.env.codingAgentWorkspaceRoot).ok,
      ),
    };
  }

  cleanup(id: string): { removed: boolean; path?: string; reason?: string } {
    const run = this.runs.get(id);
    if (!run) return { removed: false, reason: "CodingRun not found" };
    const workspace = validateWorkspacePath(run.workspacePath, this.env.codingAgentWorkspaceRoot);
    if (!workspace.ok || !workspace.path) {
      return { removed: false, reason: workspace.reason ?? "workspace path 不合法" };
    }
    rmSync(workspace.path, { recursive: true, force: true });
    return { removed: true, path: workspace.path };
  }

  patch(id: string, patch: Partial<CodingRunV1>): CodingRunV1 | undefined {
    const existing = this.runs.get(id);
    if (!existing) return undefined;
    const next = codingRunV1Schema.parse({ ...existing, ...patch });
    this.runs.set(id, next);
    this.save(next);
    return next;
  }

  private save(run: CodingRunV1): void {
    writeJsonFile(join(this.dir, run.id, "run.json"), sanitizeLog(run));
  }

  private writeArtifacts(
    run: CodingRunV1,
    artifacts: { stdout: string; stderr: string; diff: string },
  ): { stdoutPath: string; stderrPath: string; diffPath: string } {
    const runDir = join(this.dir, run.id);
    mkdirSync(runDir, { recursive: true });
    const stdoutPath = join(runDir, "stdout.log");
    const stderrPath = join(runDir, "stderr.log");
    const diffPath = join(runDir, "diff.patch");
    writeFileSync(stdoutPath, artifacts.stdout);
    writeFileSync(stderrPath, artifacts.stderr);
    writeFileSync(diffPath, artifacts.diff);
    writeJsonFile(join(runDir, "changed-files.json"), run.changedFiles);
    return { stdoutPath, stderrPath, diffPath };
  }
}

export function validateAllowedRoot(
  repoPath: string,
  allowedRoots: string[],
): { ok: boolean; reason?: string } {
  if (allowedRoots.length === 0)
    return { ok: false, reason: "CODING_AGENT_ALLOWED_ROOTS 未配置。" };
  const resolvedRepo = safeRealPath(repoPath);
  if (!resolvedRepo) return { ok: false, reason: "repoPath 不存在或无法解析。" };
  for (const root of allowedRoots) {
    const resolvedRoot = safeRealPath(root);
    if (
      resolvedRoot &&
      (resolvedRepo === resolvedRoot || resolvedRepo.startsWith(`${resolvedRoot}/`))
    ) {
      return { ok: true };
    }
  }
  return { ok: false, reason: "repoPath 不在 CODING_AGENT_ALLOWED_ROOTS 内。" };
}

function controlledPrompt(task: string): string {
  return [
    "你是被 OPC SkillOS 调用的 coding worker。",
    "你只能在当前工作区完成任务。",
    "不要读取工作区之外的文件。",
    "不要提交、push、部署或删除用户数据。",
    "完成后说明：1. 修改了什么 2. 涉及哪些文件 3. 如何验证 4. 风险和后续建议",
    "",
    "用户任务：",
    task,
  ].join("\n");
}

function readTextFile(path: string): string {
  try {
    return existsSync(path) ? readFileSync(path, "utf8") : "";
  } catch {
    return "";
  }
}
