import { mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import type { CodingRunV1 } from "@opc/shared";
import type { BridgeEnv } from "../lib/env";
import { validateCommand } from "./commandSafety";
import { validateWorkspacePath } from "./pathSafety";

export type TestCommandResult = {
  id: string;
  command: string;
  status: "passed" | "failed" | "blocked";
  exitCode?: number;
  startedAt: string;
  completedAt: string;
  stdoutPath: string;
  stderrPath: string;
  resultPath: string;
  reason?: string;
};

export async function runCodingTestCommand(
  env: BridgeEnv,
  run: CodingRunV1,
  command: string,
): Promise<TestCommandResult> {
  const startedAt = new Date().toISOString();
  const id = `test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const runDir = run.workspacePath;
  const resultDir = join(runDir, "test-results");
  mkdirSync(resultDir, { recursive: true });
  const stdoutPath = join(resultDir, `${id}-stdout.log`);
  const stderrPath = join(resultDir, `${id}-stderr.log`);
  const resultPath = join(resultDir, `${id}.json`);
  const workspace = validateWorkspacePath(
    run.worktreePath ?? run.workspacePath,
    env.codingAgentWorkspaceRoot,
  );
  const commandCheck = validateCommand(command, env.codingAgentAllowedTestCommands);
  if (!workspace.ok || !workspace.path || !commandCheck.ok || !commandCheck.tokens) {
    const result = {
      id,
      command,
      status: "blocked" as const,
      startedAt,
      completedAt: new Date().toISOString(),
      stdoutPath,
      stderrPath,
      resultPath,
      reason: workspace.reason ?? commandCheck.reason ?? "测试命令被策略阻止。",
    };
    writeFileSync(stdoutPath, "");
    writeFileSync(stderrPath, result.reason ?? "");
    writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
    return result;
  }
  const [cmd, ...args] = commandCheck.tokens;
  return await new Promise((resolve) => {
    const child = spawn(cmd ?? "", args, {
      cwd: workspace.path,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const trimOutput = (value: string) => value.slice(0, env.codingAgentMaxOutputBytes);
    const timer = setTimeout(() => {
      stderr += `\nTest command timed out after ${env.codingAgentMaxTimeoutMs}ms`;
      child.kill("SIGTERM");
    }, env.codingAgentMaxTimeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout = trimOutput(stdout + String(chunk));
    });
    child.stderr.on("data", (chunk) => {
      stderr = trimOutput(stderr + String(chunk));
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      const result = finish("failed", 1, error.message);
      resolve(result);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const result = finish(code === 0 ? "passed" : "failed", code ?? 1);
      resolve(result);
    });

    function finish(
      status: Exclude<TestCommandResult["status"], "blocked">,
      exitCode: number,
      reason?: string,
    ): TestCommandResult {
      writeFileSync(stdoutPath, stdout);
      writeFileSync(stderrPath, reason ? `${stderr}\n${reason}` : stderr);
      const result = {
        id,
        command,
        status,
        exitCode,
        startedAt,
        completedAt: new Date().toISOString(),
        stdoutPath,
        stderrPath,
        resultPath,
        reason,
      };
      writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
      return result;
    }
  });
}
