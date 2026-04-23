import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { basename, join, resolve } from "node:path";
import type { BridgeEnv } from "../lib/env";
import { assertNoDangerousAgentArgs } from "./commandSafety";

const dangerousArgs = [
  "--yolo",
  "--dangerously-bypass-approvals-and-sandbox",
  "--dangerously-skip-permissions",
  "danger-full-access",
  "bypassPermissions",
];

export type WorkspaceInfo = {
  runDir: string;
  repoDir: string;
  mode: "worktree" | "copy" | "mock";
  promptPath: string;
  stdoutPath: string;
  stderrPath: string;
  jsonlPath: string;
  finalPath: string;
  diffPath: string;
  testLogPath: string;
  metadataPath: string;
};

export type CommandSpec = {
  command: string;
  args: string[];
  stdin?: string;
  diagnostics?: string[];
};

export type CliProbe = {
  command: string;
  version?: string;
  help?: string;
  execHelp?: string;
  ok: boolean;
  diagnostics: string[];
};

export class CodingWorkspaceManager {
  constructor(private readonly env: BridgeEnv) {}

  validateRepoPath(repoPath: string): { ok: boolean; realPath?: string; reason?: string } {
    if (this.env.codingAgentAllowedRoots.length === 0) {
      return { ok: false, reason: "CODING_AGENT_ALLOWED_ROOTS 未配置。" };
    }
    const realRepo = safeRealPath(repoPath);
    if (!realRepo) return { ok: false, reason: "repoPath 不存在或无法解析。" };
    if (hasSecretPathSegment(realRepo)) {
      return { ok: false, reason: "repoPath 指向敏感路径，已阻止。" };
    }
    for (const root of this.env.codingAgentAllowedRoots) {
      const realRoot = safeRealPath(root);
      if (realRoot && containsPath(realRoot, realRepo)) return { ok: true, realPath: realRepo };
    }
    return { ok: false, reason: "repoPath 不在 CODING_AGENT_ALLOWED_ROOTS 内。" };
  }

  validateWorkspaceRoot(): { ok: boolean; realPath?: string; reason?: string } {
    try {
      mkdirSync(this.env.codingAgentWorkspaceRoot, { recursive: true });
      const realRoot = realpathSync(this.env.codingAgentWorkspaceRoot);
      if (realRoot === "/" || realRoot.length < 8) {
        return { ok: false, reason: "CODING_AGENT_WORKSPACE_ROOT 不能指向根目录或过短路径。" };
      }
      return { ok: true, realPath: realRoot };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : "workspace root 无法解析。",
      };
    }
  }

  createRunWorkspace(runId: string, repoPath: string, prompt: string): WorkspaceInfo {
    const root = this.validateWorkspaceRoot();
    if (!root.ok || !root.realPath) throw new Error(root.reason ?? "workspace root invalid");
    const repoValidation = this.validateRepoPath(repoPath);
    if (!repoValidation.ok || !repoValidation.realPath) {
      throw new Error(repoValidation.reason ?? "repoPath invalid");
    }
    const runDir = join(root.realPath, runId);
    const repoDir = join(runDir, "repo");
    mkdirSync(runDir, { recursive: true });
    if (!containsPath(root.realPath, realpathSync(runDir))) {
      throw new Error("workspace path escaped CODING_AGENT_WORKSPACE_ROOT");
    }
    let mode: WorkspaceInfo["mode"] = "copy";
    rmSync(repoDir, { recursive: true, force: true });
    if (isGitRepo(repoValidation.realPath)) {
      try {
        execFileSync(
          "git",
          ["-C", repoValidation.realPath, "worktree", "add", "--detach", repoDir, "HEAD"],
          { timeout: 30000, stdio: "ignore" },
        );
        mode = "worktree";
      } catch {
        copyRepo(repoValidation.realPath, repoDir);
      }
    } else {
      copyRepo(repoValidation.realPath, repoDir);
    }
    const info = artifactPaths(runDir, repoDir, mode);
    writeFileSync(info.promptPath, prompt);
    writeFileSync(
      info.metadataPath,
      `${JSON.stringify({ runId, repoPath: repoValidation.realPath, workspaceMode: mode }, null, 2)}\n`,
    );
    return info;
  }

  createMockWorkspace(runId: string, repoPath: string, prompt: string): WorkspaceInfo {
    const root = this.validateWorkspaceRoot();
    if (!root.ok || !root.realPath) throw new Error(root.reason ?? "workspace root invalid");
    const runDir = join(root.realPath, runId);
    const repoDir = join(runDir, "repo");
    mkdirSync(repoDir, { recursive: true });
    const info = artifactPaths(runDir, repoDir, "mock");
    writeFileSync(info.promptPath, prompt);
    writeFileSync(join(repoDir, "opc-controlled-run.md"), "# OPC controlled coding run\n");
    writeFileSync(
      info.metadataPath,
      `${JSON.stringify({ runId, repoPath: resolve(repoPath), workspaceMode: "mock" }, null, 2)}\n`,
    );
    return info;
  }

  buildCodexCommand(workspaceRepo: string, runDir: string): CommandSpec {
    const spec = {
      command: this.env.codexCliPath ?? "codex",
      args: [
        "exec",
        "--cd",
        workspaceRepo,
        "--json",
        "--sandbox",
        "workspace-write",
        "--ask-for-approval",
        "never",
        "--output-last-message",
        join(runDir, "final.md"),
        "-",
      ],
      stdin: readText(join(runDir, "prompt.md")),
    };
    assertNoDangerousArgs(spec.args);
    return spec;
  }

  buildCodexCommandForReal(workspaceRepo: string, runDir: string): CommandSpec {
    const probe = probeCli(this.env.codexCliPath ?? "codex", ["exec", "--help"]);
    if (!probe.ok || !probe.execHelp) {
      throw new Error("Codex CLI 不支持可探测的 exec --help，真实执行已阻止。");
    }
    const args = ["exec"];
    if (probe.execHelp.includes("--cd")) args.push("--cd", workspaceRepo);
    else throw new Error("Codex CLI exec 缺少 --cd，无法保证隔离 workspace。");
    if (probe.execHelp.includes("--json")) args.push("--json");
    if (probe.execHelp.includes("--sandbox")) args.push("--sandbox", "workspace-write");
    if (probe.execHelp.includes("--ask-for-approval")) args.push("--ask-for-approval", "never");
    if (probe.execHelp.includes("--output-last-message")) {
      args.push("--output-last-message", join(runDir, "final.md"));
    }
    args.push("-");
    assertNoDangerousAgentArgs(args);
    assertNoDangerousArgs(args);
    return {
      command: probe.command,
      args,
      stdin: readText(join(runDir, "prompt.md")),
      diagnostics: probe.diagnostics,
    };
  }

  buildClaudeCommand(workspaceRepo: string, prompt: string): CommandSpec {
    const permissionMode = this.env.claudeCodeRealEdit ? "acceptEdits" : "plan";
    const spec = {
      command: this.env.claudeCliPath ?? "claude",
      args: ["--permission-mode", permissionMode, "-p", prompt],
      stdin: undefined,
    };
    assertNoDangerousArgs(spec.args);
    if (
      permissionMode === "acceptEdits" &&
      !containsPath(this.env.codingAgentWorkspaceRoot, workspaceRepo)
    ) {
      throw new Error("Claude edit mode must run inside CODING_AGENT_WORKSPACE_ROOT");
    }
    return spec;
  }

  buildClaudeCommandForReal(workspaceRepo: string, prompt: string): CommandSpec {
    const probe = probeCli(this.env.claudeCliPath ?? "claude");
    if (!probe.ok || !probe.help) throw new Error("Claude CLI 不可探测，真实执行已阻止。");
    const permissionMode = this.env.claudeCodeRealEdit ? "acceptEdits" : "plan";
    if (!probe.help.includes("--permission-mode")) {
      throw new Error("Claude CLI 缺少 --permission-mode，无法保证安全执行。");
    }
    if (permissionMode === "acceptEdits" && !this.env.claudeCodeRealEdit) {
      throw new Error("CLAUDE_CODE_REAL_EDIT=0，Claude 编辑模式已阻止。");
    }
    if (
      permissionMode === "acceptEdits" &&
      !containsPath(this.env.codingAgentWorkspaceRoot, workspaceRepo)
    ) {
      throw new Error("Claude edit mode must run inside CODING_AGENT_WORKSPACE_ROOT");
    }
    const args = ["--permission-mode", permissionMode, "-p", prompt];
    assertNoDangerousAgentArgs(args);
    assertNoDangerousArgs(args);
    return { command: probe.command, args, diagnostics: probe.diagnostics };
  }

  async runCommandWithTimeout(spec: CommandSpec, info: WorkspaceInfo): Promise<number> {
    return await new Promise((resolve) => {
      const child = spawn(spec.command, spec.args, {
        cwd: info.repoDir,
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        stderr += `\nCommand timed out after ${this.env.codingAgentMaxTimeoutMs}ms`;
        child.kill("SIGTERM");
      }, this.env.codingAgentMaxTimeoutMs);
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        writeFileSync(info.stdoutPath, stdout);
        writeFileSync(info.stderrPath, stderr || error.message);
        if (spec.args.includes("--json")) writeFileSync(info.jsonlPath, stdout);
        resolve(1);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        writeFileSync(info.stdoutPath, stdout);
        writeFileSync(info.stderrPath, stderr);
        if (spec.args.includes("--json")) writeFileSync(info.jsonlPath, stdout);
        resolve(code ?? 1);
      });
      if (spec.stdin) child.stdin.end(spec.stdin);
      else child.stdin.end();
    });
  }

  collectDiff(info: WorkspaceInfo): { diff: string; changedFiles: string[] } {
    try {
      const diff = execFileSync("git", ["-C", info.repoDir, "diff", "--", "."], {
        encoding: "utf8",
        timeout: 30000,
      });
      const nameOnly = execFileSync("git", ["-C", info.repoDir, "diff", "--name-only", "--", "."], {
        encoding: "utf8",
        timeout: 30000,
      });
      writeFileSync(info.diffPath, diff);
      return { diff, changedFiles: nameOnly.split(/\r?\n/).filter(Boolean) };
    } catch {
      const diff =
        "diff --git a/opc-controlled-run.md b/opc-controlled-run.md\n" +
        "--- /dev/null\n" +
        "+++ b/opc-controlled-run.md\n" +
        "@@\n" +
        "+# OPC controlled coding run\n";
      writeFileSync(info.diffPath, diff);
      return { diff, changedFiles: ["opc-controlled-run.md"] };
    }
  }

  isAllowedTestCommand(command: string | undefined): boolean {
    if (!command) return false;
    return this.env.codingAgentAllowedTestCommands.includes(command.trim());
  }
}

export function probeCli(command: string, extraHelpArgs?: string[]): CliProbe {
  const diagnostics: string[] = [];
  try {
    const version = execFileSync(command, ["--version"], { encoding: "utf8", timeout: 5000 })
      .trim()
      .split(/\r?\n/)[0];
    const help = execFileSync(command, ["--help"], { encoding: "utf8", timeout: 5000 });
    let execHelp: string | undefined;
    if (extraHelpArgs) {
      try {
        execHelp = execFileSync(command, extraHelpArgs, { encoding: "utf8", timeout: 5000 });
      } catch (error) {
        diagnostics.push(error instanceof Error ? error.message : String(error));
      }
    }
    return { command, version, help, execHelp, ok: true, diagnostics };
  } catch (error) {
    return {
      command,
      ok: false,
      diagnostics: [error instanceof Error ? error.message : String(error)],
    };
  }
}

export function assertNoDangerousArgs(args: string[]): void {
  const joined = args.join(" ");
  for (const dangerous of dangerousArgs) {
    if (joined.includes(dangerous))
      throw new Error(`Dangerous coding agent flag blocked: ${dangerous}`);
  }
}

export function safeRealPath(path: string): string | undefined {
  try {
    return realpathSync(path);
  } catch {
    return existsSync(path) ? resolve(path) : undefined;
  }
}

export function containsPath(root: string, candidate: string): boolean {
  const realRoot = safeRealPath(root) ?? resolve(root);
  const realCandidate = safeRealPath(candidate) ?? resolve(candidate);
  return realCandidate === realRoot || realCandidate.startsWith(`${realRoot}/`);
}

function artifactPaths(
  runDir: string,
  repoDir: string,
  mode: WorkspaceInfo["mode"],
): WorkspaceInfo {
  return {
    runDir,
    repoDir,
    mode,
    promptPath: join(runDir, "prompt.md"),
    stdoutPath: join(runDir, "stdout.log"),
    stderrPath: join(runDir, "stderr.log"),
    jsonlPath: join(runDir, "codex.jsonl"),
    finalPath: join(runDir, "final.md"),
    diffPath: join(runDir, "diff.patch"),
    testLogPath: join(runDir, "test.log"),
    metadataPath: join(runDir, "metadata.json"),
  };
}

function isGitRepo(path: string): boolean {
  try {
    execFileSync("git", ["-C", path, "rev-parse", "--is-inside-work-tree"], {
      timeout: 5000,
      stdio: "ignore",
    });
    return true;
  } catch {
    return existsSync(join(path, ".git"));
  }
}

function copyRepo(source: string, target: string): void {
  cpSync(source, target, {
    recursive: true,
    filter: (path) => !shouldSkipCopy(path),
  });
}

function shouldSkipCopy(path: string): boolean {
  const name = basename(path);
  if (["node_modules", ".git", "dist", "build", ".next", ".turbo"].includes(name)) return true;
  if (name === ".env" || name.startsWith(".env.")) return true;
  return hasSecretPathSegment(path);
}

function hasSecretPathSegment(path: string): boolean {
  return path
    .split("/")
    .some((segment) => /secret|token|password|private_key|ssh_key|credentials/i.test(segment));
}

function readText(path: string): string {
  try {
    return statSync(path).isFile() ? readFileSync(path, "utf8") : "";
  } catch {
    return "";
  }
}
