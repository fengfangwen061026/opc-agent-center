import { readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

export type BridgeEnv = {
  port: number;
  openclawMode: "mock" | "ws" | "cli";
  openclawGatewayUrl: string;
  openclawToken?: string;
  openclawCliPath?: string;
  openclawAutostartGateway: boolean;
  openclawManagedGateway: boolean;
  openclawGatewayPort: number;
  openclawGatewayAllowUnconfigured: boolean;
  openclawGatewayForce: boolean;
  openclawGatewayVerbose: boolean;
  hermesMode: "mock" | "cli" | "http";
  hermesApiUrl?: string;
  hermesCliPath?: string;
  hermesRealExec: boolean;
  hermesContextTimeoutMs: number;
  hermesReflectionTimeoutMs: number;
  hermesProfile: string;
  obsidianMode: "mock" | "rest";
  obsidianApiUrl: string;
  obsidianToken?: string;
  obsidianWriteMode: "review_queue_only";
  obsidianReviewQueuePath: string;
  obsidianAllowedWritePaths: string[];
  opcSkillRoots: string[];
  codexCliPath?: string;
  claudeCliPath?: string;
  codingAgentRealExec: boolean;
  codingAgentAllowedRoots: string[];
  codingAgentAllowedTestCommands: string[];
  codingAgentWorkspaceRoot: string;
  codingAgentMaxTimeoutMs: number;
  codingAgentMaxOutputBytes: number;
  codingAgentAllowPush: boolean;
  codingAgentAllowDeploy: boolean;
  codingAgentRequireApproval: boolean;
  claudeCodeRealEdit: boolean;
};

export function loadBridgeEnv(cwd = process.cwd()): BridgeEnv {
  const rootDir = new URL("../../../..", import.meta.url).pathname;
  const fileEnv = {
    ...readEnvLocal(rootDir),
    ...readEnvLocal(cwd),
  };
  const env = { ...fileEnv, ...process.env };
  return {
    port: Number(env.BRIDGE_PORT ?? 3001),
    openclawMode: parseMode(env.OPENCLAW_MODE, ["mock", "ws", "cli"], "mock"),
    openclawGatewayUrl: env.OPENCLAW_GATEWAY_URL ?? "ws://127.0.0.1:18789",
    openclawToken: emptyToUndefined(env.OPENCLAW_TOKEN),
    openclawCliPath: optionalPath(env.OPENCLAW_CLI_PATH, rootDir),
    openclawAutostartGateway: parseBoolean(env.OPENCLAW_AUTOSTART_GATEWAY, false),
    openclawManagedGateway: parseBoolean(env.OPENCLAW_MANAGED_GATEWAY, false),
    openclawGatewayPort: Number(env.OPENCLAW_GATEWAY_PORT ?? 18789),
    openclawGatewayAllowUnconfigured: parseBoolean(env.OPENCLAW_GATEWAY_ALLOW_UNCONFIGURED, false),
    openclawGatewayForce: parseBoolean(env.OPENCLAW_GATEWAY_FORCE, false),
    openclawGatewayVerbose: parseBoolean(env.OPENCLAW_GATEWAY_VERBOSE, true),
    hermesMode: parseMode(env.HERMES_MODE, ["mock", "cli", "http"], "mock"),
    hermesApiUrl: emptyToUndefined(env.HERMES_API_URL),
    hermesCliPath: optionalPath(env.HERMES_CLI_PATH, rootDir),
    hermesRealExec: parseBoolean(env.HERMES_REAL_EXEC, false),
    hermesContextTimeoutMs: Number(env.HERMES_CONTEXT_TIMEOUT_MS ?? 60000),
    hermesReflectionTimeoutMs: Number(env.HERMES_REFLECTION_TIMEOUT_MS ?? 90000),
    hermesProfile: env.HERMES_PROFILE ?? "opc-kernel",
    obsidianMode: parseMode(env.OBSIDIAN_MODE, ["mock", "rest"], "mock"),
    obsidianApiUrl: env.OBSIDIAN_REST_URL ?? env.OBSIDIAN_API_URL ?? "https://127.0.0.1:27124",
    obsidianToken: emptyToUndefined(env.OBSIDIAN_REST_TOKEN ?? env.OBSIDIAN_TOKEN),
    obsidianWriteMode: "review_queue_only",
    obsidianReviewQueuePath: env.OBSIDIAN_REVIEW_QUEUE_PATH ?? "08_Review_Queue",
    obsidianAllowedWritePaths: parseSimpleList(
      env.OBSIDIAN_ALLOWED_WRITE_PATHS ?? env.OBSIDIAN_REVIEW_QUEUE_PATH ?? "08_Review_Queue",
    ),
    opcSkillRoots: parsePathList(
      env.OPC_SKILL_ROOTS ??
        "./shared-skills/stable:./shared-skills/experimental:./openclaw/workspace/skills",
      rootDir,
    ),
    codexCliPath: optionalPath(env.CODEX_CLI_PATH, rootDir),
    claudeCliPath: optionalPath(env.CLAUDE_CLI_PATH, rootDir),
    codingAgentRealExec: parseBoolean(env.CODING_AGENT_REAL_EXEC, false),
    codingAgentAllowedRoots: parsePathList(env.CODING_AGENT_ALLOWED_ROOTS ?? "", rootDir),
    codingAgentAllowedTestCommands: parseSimpleList(
      env.CODING_AGENT_ALLOWED_TEST_COMMANDS ??
        env.CODING_AGENT_TEST_COMMAND_ALLOWLIST ??
        "pnpm test,npm test,yarn test,pytest",
    ),
    codingAgentWorkspaceRoot:
      optionalPath(env.CODING_AGENT_WORKSPACE_ROOT ?? env.CODING_AGENT_WORKDIR_ROOT, rootDir) ??
      resolve(rootDir, "data/runtime/coding-workspaces"),
    codingAgentMaxTimeoutMs: Number(
      env.CODING_AGENT_MAX_TIMEOUT_MS ?? env.CODING_AGENT_MAX_RUNTIME_MS ?? 600000,
    ),
    codingAgentMaxOutputBytes: Number(env.CODING_AGENT_MAX_OUTPUT_BYTES ?? 3000000),
    codingAgentAllowPush: parseBoolean(env.CODING_AGENT_ALLOW_PUSH, false),
    codingAgentAllowDeploy: parseBoolean(env.CODING_AGENT_ALLOW_DEPLOY, false),
    codingAgentRequireApproval: parseBoolean(env.CODING_AGENT_REQUIRE_APPROVAL, true),
    claudeCodeRealEdit: parseBoolean(env.CLAUDE_CODE_REAL_EDIT, false),
  };
}

function readEnvLocal(cwd: string): Record<string, string> {
  try {
    const raw = readFileSync(join(cwd, ".env.local"), "utf8");
    return Object.fromEntries(
      raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index), line.slice(index + 1)];
        }),
    );
  } catch {
    return {};
  }
}

function parseMode<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function emptyToUndefined(value: string | undefined): string | undefined {
  return value && value.length > 0 ? value : undefined;
}

function optionalPath(value: string | undefined, rootDir: string): string | undefined {
  const normalized = emptyToUndefined(value);
  if (!normalized) return undefined;
  if (!normalized.includes("/") || isAbsolute(normalized)) return normalized;
  return resolve(rootDir, normalized);
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function parsePathList(value: string, rootDir: string): string[] {
  return value
    .split(":")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => optionalPath(item, rootDir) ?? item);
}

function parseSimpleList(value: string): string[] {
  return value
    .split(/[,:]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
