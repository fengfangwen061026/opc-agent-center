import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { HermesStatus, ObsidianStatus, OpenClawStatus, SystemHealth } from "@opc/core";
import type { BridgeEnv } from "../lib/env";
import type { ManagedProcessState, ServiceSupervisor } from "./supervisor";

const execFileAsync = promisify(execFile);

export type DiagnosticCode =
  | "ok"
  | "daemon_not_running"
  | "config_missing"
  | "port_not_listening"
  | "pairing_required"
  | "token_mismatch"
  | "cli_missing"
  | "command_timeout"
  | "needs_token"
  | "connection_refused"
  | "unauthorized"
  | "plugin_not_enabled"
  | "unknown";

export type DiagnosticItem = {
  code: DiagnosticCode;
  severity: "info" | "warning" | "danger";
  title: string;
  message: string;
  action?: string;
};

export type ServiceStatusResponse = {
  bridge: "running";
  openclaw: {
    mode: "mock" | "cli" | "ws";
    status: "connected" | "offline" | "starting" | "error";
    gatewayUrl?: string;
    cliPath?: string;
    version?: string;
    process?: ManagedProcessState;
    diagnostics: DiagnosticItem[];
  };
  hermes: {
    mode: "mock" | "cli" | "http";
    status: "connected" | "offline" | "needs_provider" | "error";
    cliPath?: string;
    version?: string;
    diagnostics: DiagnosticItem[];
  };
  obsidian: {
    mode: "mock" | "rest";
    status: "connected" | "offline" | "needs_token" | "error";
    endpoint?: string;
    diagnostics: DiagnosticItem[];
  };
  codingAgents: {
    codex: "idle" | "unavailable" | "running" | "error";
    claudeCode: "idle" | "unavailable" | "running" | "error";
  };
};

export type CommandProbeResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  error?: string;
};

export async function buildServiceStatus(input: {
  env: BridgeEnv;
  health: SystemHealth;
  openclawStatus: OpenClawStatus;
  hermesStatus: HermesStatus;
  obsidianStatus: ObsidianStatus;
  supervisor: ServiceSupervisor;
  deep?: boolean;
}): Promise<ServiceStatusResponse> {
  const [openclawVersion, hermesVersion] = await Promise.all([
    getCommandVersion(input.env.openclawCliPath ?? "openclaw"),
    getCommandVersion(input.env.hermesCliPath ?? "hermes"),
  ]);
  return {
    bridge: "running",
    openclaw: {
      mode: input.env.openclawMode,
      status: input.openclawStatus.connected
        ? "connected"
        : input.supervisor.status("openclaw-gateway").status === "running"
          ? "starting"
          : "offline",
      gatewayUrl: input.env.openclawGatewayUrl,
      cliPath: input.env.openclawCliPath,
      version: openclawVersion ?? undefined,
      process: input.deep ? input.supervisor.status("openclaw-gateway") : undefined,
      diagnostics: diagnoseOpenClaw(input.openclawStatus, openclawVersion),
    },
    hermes: {
      mode: input.env.hermesMode,
      status: input.hermesStatus.available ? "connected" : "needs_provider",
      cliPath: input.env.hermesCliPath,
      version: input.hermesStatus.version ?? hermesVersion ?? undefined,
      diagnostics: diagnoseHermes(input.hermesStatus),
    },
    obsidian: {
      mode: input.env.obsidianMode,
      status: input.obsidianStatus.connected
        ? "connected"
        : input.env.obsidianMode === "rest" && !input.env.obsidianToken
          ? "needs_token"
          : "offline",
      endpoint: input.env.obsidianApiUrl,
      diagnostics: diagnoseObsidian(input.env, input.obsidianStatus),
    },
    codingAgents: {
      codex: input.health.codingAgents.codex === "active" ? "running" : "idle",
      claudeCode: input.health.codingAgents.claudeCode === "active" ? "running" : "idle",
    },
  };
}

export function openClawGatewayArgs(env: BridgeEnv): string[] {
  const args = ["gateway", "--port", String(env.openclawGatewayPort)];
  if (env.openclawGatewayAllowUnconfigured) args.push("--allow-unconfigured");
  if (env.openclawGatewayForce) args.push("--force");
  if (env.openclawGatewayVerbose) args.push("--verbose");
  return args;
}

export async function runOpenClawDoctor(env: BridgeEnv): Promise<{
  diagnostics: DiagnosticItem[];
  status: CommandProbeResult;
  doctor: CommandProbeResult;
  channels: CommandProbeResult;
}> {
  const command = env.openclawCliPath ?? "openclaw";
  const [status, doctor, channels] = await Promise.all([
    runCommand(command, ["status", "--json"], 5000),
    runCommand(command, ["doctor"], 15000),
    runCommand(command, ["channels", "status", "--probe"], 10000),
  ]);
  const diagnostics = [
    ...diagnoseCommand("OpenClaw status", status),
    ...diagnoseCommand("OpenClaw doctor", doctor),
    ...diagnoseCommand("OpenClaw channels", channels),
  ];
  if (
    /ECONNREFUSED|refused|not listening/i.test(status.stdout + status.stderr + (status.error ?? ""))
  ) {
    diagnostics.push({
      code: "port_not_listening",
      severity: "warning",
      title: "Gateway 端口未监听",
      message: `OpenClaw Gateway 未在 ${env.openclawGatewayUrl} 提供服务。`,
      action: "在设置页启动 Gateway，或手动运行 OpenClaw gateway 命令。",
    });
  }
  return { diagnostics, status, doctor, channels };
}

export async function testObsidian(env: BridgeEnv): Promise<{
  status: "connected" | "needs_token" | "connection_refused" | "unauthorized" | "error";
  diagnostics: DiagnosticItem[];
}> {
  if (env.obsidianMode === "rest" && !env.obsidianToken) {
    return {
      status: "needs_token",
      diagnostics: [
        {
          code: "needs_token",
          severity: "warning",
          title: "Obsidian token 未配置",
          message: "请在 .env.local 配置 OBSIDIAN_REST_TOKEN。",
        },
      ],
    };
  }
  try {
    const response = await fetch(`${env.obsidianApiUrl}/`, {
      headers: env.obsidianToken ? { Authorization: `Bearer ${env.obsidianToken}` } : {},
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 401 || response.status === 403) {
      return {
        status: "unauthorized",
        diagnostics: [
          {
            code: "unauthorized",
            severity: "danger",
            title: "Obsidian token 无效",
            message: "Local REST API 返回未授权，请重新复制插件 API key。",
          },
        ],
      };
    }
    return {
      status: response.ok ? "connected" : "error",
      diagnostics: [
        {
          code: response.ok ? "ok" : "plugin_not_enabled",
          severity: response.ok ? "info" : "warning",
          title: response.ok ? "Obsidian REST 可用" : "Obsidian 插件可能未启用",
          message: response.ok ? "Bridge 已完成只读连接测试。" : `HTTP ${response.status}`,
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    return {
      status: /ECONNREFUSED|fetch failed/i.test(message) ? "connection_refused" : "error",
      diagnostics: [
        {
          code: /ECONNREFUSED|fetch failed/i.test(message) ? "connection_refused" : "unknown",
          severity: "warning",
          title: "Obsidian REST 不可达",
          message,
        },
      ],
    };
  }
}

export async function testHermes(env: BridgeEnv): Promise<{
  status: "connected" | "needs_provider" | "error";
  diagnostics: DiagnosticItem[];
  version?: string;
}> {
  const version = await getCommandVersion(env.hermesCliPath ?? "hermes");
  if (!version) {
    return {
      status: "error",
      diagnostics: [
        {
          code: "cli_missing",
          severity: "danger",
          title: "Hermes CLI 不可用",
          message: "请先运行 pnpm services:install。",
        },
      ],
    };
  }
  const status = await runCommand(env.hermesCliPath ?? "hermes", ["status"], 10000);
  const needsProvider = /not configured|not logged in|missing/i.test(status.stdout + status.stderr);
  return {
    status: needsProvider ? "needs_provider" : "connected",
    version,
    diagnostics: diagnoseCommand("Hermes status", status),
  };
}

export function redactedConfig(env: BridgeEnv) {
  return {
    openclaw: {
      mode: env.openclawMode,
      gatewayUrl: env.openclawGatewayUrl,
      cliPath: env.openclawCliPath,
      hasToken: Boolean(env.openclawToken),
      token: env.openclawToken ? "[REDACTED]" : undefined,
    },
    hermes: {
      mode: env.hermesMode,
      cliPath: env.hermesCliPath,
      realExec: env.hermesRealExec,
      profile: env.hermesProfile,
    },
    obsidian: {
      mode: env.obsidianMode,
      endpoint: env.obsidianApiUrl,
      hasToken: Boolean(env.obsidianToken),
      token: env.obsidianToken ? "[REDACTED]" : undefined,
      writeMode: env.obsidianWriteMode,
    },
    codingAgents: {
      realExec: env.codingAgentRealExec,
      requireApproval: env.codingAgentRequireApproval,
      allowedRoots: env.codingAgentAllowedRoots,
      workspaceRoot: env.codingAgentWorkspaceRoot,
      maxTimeoutMs: env.codingAgentMaxTimeoutMs,
      allowPush: env.codingAgentAllowPush,
      allowDeploy: env.codingAgentAllowDeploy,
    },
  };
}

export async function runCommand(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<CommandProbeResult> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { timeout: timeoutMs });
    return { ok: true, stdout, stderr, timedOut: false };
  } catch (error) {
    const nodeError = error as Error & {
      stdout?: string;
      stderr?: string;
      code?: string;
      killed?: boolean;
      signal?: string;
    };
    return {
      ok: false,
      stdout: nodeError.stdout ?? "",
      stderr: nodeError.stderr ?? "",
      timedOut:
        nodeError.killed || nodeError.signal === "SIGTERM" || nodeError.code === "ETIMEDOUT",
      error: nodeError.message,
    };
  }
}

async function getCommandVersion(command: string): Promise<string | null> {
  if (!command.includes("/")) {
    const exists = await runCommand("which", [command], 1000);
    if (!exists.ok) return null;
  }
  const result = await runCommand(command, ["--version"], 2500);
  return result.ok ? result.stdout.trim().split(/\r?\n/)[0] : null;
}

function diagnoseOpenClaw(status: OpenClawStatus, version: string | null): DiagnosticItem[] {
  if (!version) {
    return [
      {
        code: "cli_missing",
        severity: "danger",
        title: "OpenClaw CLI 不可用",
        message: "请运行 pnpm services:install，或配置 OPENCLAW_CLI_PATH。",
      },
    ];
  }
  if (status.connected) {
    return [{ code: "ok", severity: "info", title: "OpenClaw 已连接", message: "Gateway 可用。" }];
  }
  const message = status.lastError ?? "Gateway 未连接。";
  const code: DiagnosticCode = /ECONNREFUSED|refused/i.test(message)
    ? "daemon_not_running"
    : /token|auth|401|403/i.test(message)
      ? "token_mismatch"
      : "unknown";
  return [
    {
      code,
      severity: "warning",
      title: "OpenClaw Gateway 离线",
      message,
      action: "启动 OpenClaw Gateway 或检查配对状态。",
    },
  ];
}

function diagnoseHermes(status: HermesStatus): DiagnosticItem[] {
  if (status.available) {
    return [
      { code: "ok", severity: "info", title: "Hermes 可用", message: "CLI/adapter 状态正常。" },
    ];
  }
  return [
    {
      code: "unknown",
      severity: "warning",
      title: "Hermes 需要配置",
      message: status.memoryStatus ?? "请运行 hermes doctor / hermes model。",
    },
  ];
}

function diagnoseObsidian(env: BridgeEnv, status: ObsidianStatus): DiagnosticItem[] {
  if (status.connected) {
    return [
      { code: "ok", severity: "info", title: "Obsidian 可用", message: "Vault adapter 可用。" },
    ];
  }
  if (env.obsidianMode === "rest" && !env.obsidianToken) {
    return [
      {
        code: "needs_token",
        severity: "warning",
        title: "Obsidian token 未配置",
        message: "请启用 Local REST API 插件并配置 OBSIDIAN_REST_TOKEN。",
      },
    ];
  }
  return [
    {
      code: "unknown",
      severity: "warning",
      title: "Obsidian 离线",
      message: "REST adapter 不可达。",
    },
  ];
}

function diagnoseCommand(label: string, result: CommandProbeResult): DiagnosticItem[] {
  if (result.ok)
    return [{ code: "ok", severity: "info", title: `${label} 正常`, message: "命令执行成功。" }];
  if (result.timedOut) {
    return [
      {
        code: "command_timeout",
        severity: "danger",
        title: `${label} 超时`,
        message: result.error ?? "命令超过超时时间。",
      },
    ];
  }
  return [
    {
      code: /not found|ENOENT/i.test(result.error ?? "") ? "cli_missing" : "unknown",
      severity: "warning",
      title: `${label} 返回异常`,
      message: result.stderr || result.error || "unknown",
    },
  ];
}
