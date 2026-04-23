import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { IntegrationStatusV1 } from "@opc/shared";
import type { BridgeEnv } from "../lib/env";
import type { IntegrationConfigStore } from "../stores/integrationConfigStore";
import {
  openClawGatewayArgs,
  redactedConfig,
  runCommand,
  runOpenClawDoctor,
  testHermes,
  testObsidian,
} from "./serviceDiagnostics";
import type { ServiceSupervisor } from "./supervisor";

export type IntegrationServiceRuntime = {
  env: BridgeEnv;
  supervisor: ServiceSupervisor;
  configStore: IntegrationConfigStore;
  openclaw: { status: () => Promise<{ connected: boolean; lastError?: string }> };
  hermes: { status: () => Promise<{ available: boolean; version?: string; transport?: string }> };
  obsidian: { status: () => Promise<{ connected: boolean; lastError?: string }> };
};

export async function listIntegrations(
  runtime: IntegrationServiceRuntime,
): Promise<IntegrationStatusV1[]> {
  const [openclaw, hermes, obsidian, codex, claude] = await Promise.all([
    openClawIntegration(runtime),
    hermesIntegration(runtime),
    obsidianIntegration(runtime),
    codingIntegration(runtime, "codex"),
    codingIntegration(runtime, "claude-code"),
  ]);
  return [openclaw, hermes, obsidian, codex, claude];
}

export async function getIntegration(
  runtime: IntegrationServiceRuntime,
  id: IntegrationStatusV1["id"],
): Promise<IntegrationStatusV1 | undefined> {
  return (await listIntegrations(runtime)).find((item) => item.id === id);
}

export async function checkIntegration(
  runtime: IntegrationServiceRuntime,
  id: IntegrationStatusV1["id"],
): Promise<unknown> {
  if (id === "openclaw") return runOpenClawDoctor(runtime.env);
  if (id === "hermes") return testHermes(runtime.env);
  if (id === "obsidian") return testObsidian(runtime.env);
  return codingCheck(runtime.env, id);
}

export function startIntegration(runtime: IntegrationServiceRuntime, id: string): unknown {
  if (id !== "openclaw") return { ok: false, reason: "该服务不由 Bridge 启动。" };
  if (!runtime.env.openclawManagedGateway) {
    return {
      ok: false,
      reason: "OPENCLAW_MANAGED_GATEWAY=1 后 Bridge 才会托管启动 Gateway。",
      command: `${runtime.env.openclawCliPath ?? "openclaw"} ${openClawGatewayArgs(runtime.env).join(" ")}`,
    };
  }
  return runtime.supervisor.start({
    id: "openclaw-gateway",
    label: "OpenClaw Gateway",
    command: runtime.env.openclawCliPath ?? "openclaw",
    args: openClawGatewayArgs(runtime.env),
  });
}

export function stopIntegration(runtime: IntegrationServiceRuntime, id: string): unknown {
  if (id !== "openclaw") return { ok: false, reason: "该服务不由 Bridge 停止。" };
  return runtime.supervisor.stop("openclaw-gateway");
}

export function integrationLogs(runtime: IntegrationServiceRuntime, id: string): unknown {
  if (id === "openclaw") return runtime.supervisor.logs("openclaw-gateway").slice(-100);
  return [];
}

export function integrationConfig(runtime: IntegrationServiceRuntime, id: string): unknown {
  const envConfig = redactedConfig(runtime.env) as Record<string, unknown>;
  const key = id === "claude-code" ? "codingAgents" : id;
  return {
    env: envConfig[key] ?? {},
    local: runtime.configStore.getRedacted(id),
  };
}

export async function testIntegrationConfig(
  runtime: IntegrationServiceRuntime,
  id: IntegrationStatusV1["id"],
): Promise<unknown> {
  return checkIntegration(runtime, id);
}

async function openClawIntegration(
  runtime: IntegrationServiceRuntime,
): Promise<IntegrationStatusV1> {
  const [status, version] = await Promise.all([
    runtime.openclaw.status(),
    commandVersion(runtime.env.openclawCliPath ?? "openclaw"),
  ]);
  const connected = status.connected;
  const cliAvailable = Boolean(version);
  return {
    id: "openclaw",
    label: "OpenClaw Gateway",
    status: connected ? "connected" : cliAvailable ? "configured" : "not_configured",
    mode: runtime.env.openclawMode,
    version: version ?? undefined,
    lastCheckedAt: new Date().toISOString(),
    capabilities: [
      { id: "cli", label: "OpenClaw CLI", status: cliAvailable ? "available" : "missing" },
      {
        id: "gateway",
        label: "Gateway daemon",
        status: connected ? "available" : "missing",
        reason: connected ? undefined : (status.lastError ?? "Gateway 未连接。"),
      },
      {
        id: "managed-start",
        label: "Bridge 托管启动",
        status: runtime.env.openclawManagedGateway ? "available" : "disabled",
        reason: runtime.env.openclawManagedGateway ? undefined : "需要 OPENCLAW_MANAGED_GATEWAY=1",
      },
    ],
    requiredActions: connected
      ? []
      : [
          {
            id: "start-gateway",
            label: "启动或配对 OpenClaw Gateway",
            severity: cliAvailable ? "warning" : "error",
            command: `${runtime.env.openclawCliPath ?? "openclaw"} ${openClawGatewayArgs(runtime.env).join(" ")}`,
          },
        ],
    redactedConfig: {
      mode: runtime.env.openclawMode,
      gatewayUrl: runtime.env.openclawGatewayUrl,
      tokenConfigured: Boolean(runtime.env.openclawToken),
      managedGateway: runtime.env.openclawManagedGateway,
    },
  };
}

async function hermesIntegration(runtime: IntegrationServiceRuntime): Promise<IntegrationStatusV1> {
  const [status, version] = await Promise.all([
    runtime.hermes.status(),
    commandVersion(runtime.env.hermesCliPath ?? "hermes"),
  ]);
  const cliAvailable = Boolean(version);
  return {
    id: "hermes",
    label: "Hermes Agent",
    status: status.available ? "connected" : cliAvailable ? "configured" : "not_configured",
    mode: runtime.env.hermesRealExec ? "real" : runtime.env.hermesMode,
    version: status.version ?? version ?? undefined,
    lastCheckedAt: new Date().toISOString(),
    capabilities: [
      { id: "cli", label: "Hermes CLI", status: cliAvailable ? "available" : "missing" },
      {
        id: "structured-json",
        label: "严格 JSON 输出",
        status: runtime.env.hermesRealExec && cliAvailable ? "unknown" : "disabled",
        reason: runtime.env.hermesRealExec ? undefined : "HERMES_REAL_EXEC=0",
      },
    ],
    requiredActions: status.available
      ? []
      : [
          {
            id: "configure-hermes",
            label: "配置 Hermes provider/profile",
            severity: cliAvailable ? "warning" : "error",
            command: "pnpm services:hermes-profile",
          },
        ],
    redactedConfig: {
      mode: runtime.env.hermesMode,
      realExec: runtime.env.hermesRealExec,
      profile: runtime.env.hermesProfile,
      cliPath: runtime.env.hermesCliPath ?? null,
    },
  };
}

async function obsidianIntegration(
  runtime: IntegrationServiceRuntime,
): Promise<IntegrationStatusV1> {
  const status = await runtime.obsidian.status();
  const tokenConfigured = Boolean(runtime.env.obsidianToken);
  return {
    id: "obsidian",
    label: "Obsidian Local REST",
    status:
      runtime.env.obsidianMode === "mock"
        ? "not_configured"
        : status.connected
          ? "connected"
          : tokenConfigured
            ? "configured"
            : "not_configured",
    mode: runtime.env.obsidianMode,
    lastCheckedAt: new Date().toISOString(),
    capabilities: [
      {
        id: "rest",
        label: "Local REST API",
        status: status.connected ? "available" : "missing",
        reason: status.connected ? undefined : (status.lastError ?? "未连接。"),
      },
      {
        id: "review-queue-only",
        label: "Review Queue 只创建写入",
        status: "available",
      },
    ],
    requiredActions: status.connected
      ? []
      : [
          {
            id: "configure-token",
            label: "配置 OBSIDIAN_REST_TOKEN 与 Review Queue",
            severity: tokenConfigured ? "warning" : "error",
          },
        ],
    redactedConfig: {
      mode: runtime.env.obsidianMode,
      endpoint: runtime.env.obsidianApiUrl,
      tokenConfigured,
      reviewQueuePath: runtime.env.obsidianReviewQueuePath,
      allowedWritePaths: runtime.env.obsidianAllowedWritePaths.join(", "),
    },
  };
}

async function codingIntegration(
  runtime: IntegrationServiceRuntime,
  id: "codex" | "claude-code",
): Promise<IntegrationStatusV1> {
  const command =
    id === "codex"
      ? (runtime.env.codexCliPath ?? "codex")
      : (runtime.env.claudeCliPath ?? "claude");
  const version = await commandVersion(command);
  const cliAvailable = Boolean(version);
  const rootsConfigured = runtime.env.codingAgentAllowedRoots.length > 0;
  const workspaceUsable = canCreateProbe(runtime.env.codingAgentWorkspaceRoot);
  return {
    id,
    label: id === "codex" ? "Codex" : "Claude Code",
    status: cliAvailable && rootsConfigured && workspaceUsable ? "configured" : "not_configured",
    mode: runtime.env.codingAgentRealExec ? "real" : "mock",
    version: version ?? undefined,
    lastCheckedAt: new Date().toISOString(),
    capabilities: [
      { id: "cli", label: "CLI", status: cliAvailable ? "available" : "missing" },
      {
        id: "real-exec",
        label: "真实执行",
        status: runtime.env.codingAgentRealExec ? "available" : "disabled",
        reason: runtime.env.codingAgentRealExec ? undefined : "CODING_AGENT_REAL_EXEC=0",
      },
      {
        id: "allowed-roots",
        label: "Allowed roots",
        status: rootsConfigured ? "available" : "missing",
      },
      {
        id: "workspace-root",
        label: "隔离 workspace root",
        status: workspaceUsable ? "available" : "blocked",
      },
      {
        id: "dangerous-flags",
        label: "危险参数拦截",
        status: "available",
      },
    ],
    requiredActions:
      cliAvailable && rootsConfigured && workspaceUsable
        ? []
        : [
            {
              id: "configure-coding-agent",
              label: "配置 CLI、CODING_AGENT_ALLOWED_ROOTS 与 CODING_AGENT_WORKSPACE_ROOT",
              severity: "warning",
            },
          ],
    redactedConfig: {
      realExec: runtime.env.codingAgentRealExec,
      allowedRoots: runtime.env.codingAgentAllowedRoots.join(", "),
      workspaceRoot: runtime.env.codingAgentWorkspaceRoot,
      maxTimeoutMs: runtime.env.codingAgentMaxTimeoutMs,
      claudeEdit: runtime.env.claudeCodeRealEdit,
    },
  };
}

async function commandVersion(command: string): Promise<string | null> {
  if (!command.includes("/")) {
    const exists = await runCommand("which", [command], 1200);
    if (!exists.ok) return null;
  }
  const result = await runCommand(command, ["--version"], 2500);
  return result.ok ? result.stdout.trim().split(/\r?\n/)[0] : null;
}

async function codingCheck(env: BridgeEnv, id: "codex" | "claude-code"): Promise<unknown> {
  const command = id === "codex" ? (env.codexCliPath ?? "codex") : (env.claudeCliPath ?? "claude");
  const version = await commandVersion(command);
  return {
    cliPath: command,
    version,
    realExec: env.codingAgentRealExec,
    allowedRootsConfigured: env.codingAgentAllowedRoots.length > 0,
    workspaceRoot: env.codingAgentWorkspaceRoot,
    workspaceProbe: canCreateProbe(env.codingAgentWorkspaceRoot),
    dangerousFlagsBlocked: true,
  };
}

function canCreateProbe(root: string): boolean {
  try {
    mkdirSync(root, { recursive: true });
    const file = join(root, ".opc-probe");
    writeFileSync(file, "ok\n");
    return existsSync(file);
  } catch {
    return false;
  }
}
