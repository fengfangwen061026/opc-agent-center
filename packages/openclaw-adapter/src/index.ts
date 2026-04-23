import { execFile } from "node:child_process";
import { promisify } from "node:util";
import WebSocket from "ws";
import type {
  OpenClawConnectionConfig,
  OpenClawEvent,
  OpenClawStatus,
  OpcAgent,
  OpcEvent,
  OpcSubagent,
  SendMessageInput,
  SendMessageResult,
  TaskLog,
} from "@opc/core";
import agentsJson from "../../../data/mock/agents.json";
import eventsJson from "../../../data/mock/events.json";

const execFileAsync = promisify(execFile);

export interface OpenClawAdapter {
  connect(config?: Partial<OpenClawConnectionConfig>): Promise<void>;
  disconnect(): Promise<void>;
  status(): Promise<OpenClawStatus>;
  getVersion(): Promise<string | null>;
  gatewayStatus(): Promise<GatewayStatus>;
  doctor(): Promise<DoctorResult>;
  channelsStatusProbe(): Promise<ChannelsProbeResult>;
  getRecentLogs(): Promise<OpenClawLogLine[]>;
  subscribe(handler: (event: OpenClawEvent) => void): () => void;
  sendMessage(input: SendMessageInput): Promise<SendMessageResult>;
  listAgents(): Promise<OpcAgent[]>;
  listSubagents(sessionId?: string): Promise<OpcSubagent[]>;
  getTaskLog(taskId: string): Promise<TaskLog>;
}

export type GatewayStatus = {
  connected: boolean;
  raw?: unknown;
  lastError?: string;
};

export type DoctorResult = {
  ok: boolean;
  raw: string;
  diagnostics: string[];
};

export type ChannelsProbeResult = {
  ok: boolean;
  raw: string;
};

export type OpenClawLogLine = {
  ts: string;
  stream: "stdout" | "stderr";
  line: string;
};

export class AuthError extends Error {
  constructor(message = "OpenClaw authentication failed") {
    super(message);
    this.name = "AuthError";
  }
}

type Handler = (event: OpenClawEvent) => void;

export class MockOpenClawAdapter implements OpenClawAdapter {
  private handlers = new Set<Handler>();
  private timer: NodeJS.Timeout | null = null;
  private connected = false;
  private index = 0;

  async connect(): Promise<void> {
    this.connected = true;
    this.timer ??= setInterval(() => {
      const event = eventsJson[this.index % eventsJson.length];
      this.index += 1;
      this.emit({
        id: `mock-openclaw-${Date.now()}-${this.index}`,
        timestamp: new Date().toISOString(),
        type: event.type,
        source: "mock",
        payload: event.payload,
      });
    }, 5000);
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async status(): Promise<OpenClawStatus> {
    return {
      connected: this.connected,
      mode: "mock",
      gatewayUrl: "mock://openclaw",
      authStatus: "not_required",
      latencyMs: 12,
    };
  }

  async getVersion(): Promise<string | null> {
    return "mock-openclaw";
  }

  async gatewayStatus(): Promise<GatewayStatus> {
    return { connected: this.connected, raw: { mode: "mock" } };
  }

  async doctor(): Promise<DoctorResult> {
    return { ok: true, raw: "mock doctor ok", diagnostics: [] };
  }

  async channelsStatusProbe(): Promise<ChannelsProbeResult> {
    return { ok: true, raw: "mock channels ok" };
  }

  async getRecentLogs(): Promise<OpenClawLogLine[]> {
    return [];
  }

  subscribe(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    const conversationId = input.conversationId ?? "conv-panel-command";
    const now = new Date().toISOString();
    const message = {
      id: `msg-user-${Date.now()}`,
      conversationId,
      channel: input.channel,
      direction: "outbound" as const,
      role: "user" as const,
      author: { type: "human" as const, id: "user-local", displayName: "用户" },
      content: input.content,
      createdAt: now,
      taskId: input.taskId,
    };
    const autoReply = {
      id: `msg-agent-${Date.now()}`,
      conversationId,
      channel: input.channel,
      direction: "internal" as const,
      role: "agent" as const,
      author: { type: "agent" as const, id: "agent-conductor", displayName: "OPC Conductor" },
      content: "mock 模式已收到消息，并暂存给 OPC Conductor 处理。",
      createdAt: new Date(Date.now() + 150).toISOString(),
      taskId: input.taskId,
    };
    const event: OpcEvent = {
      id: `evt-chat-${Date.now()}`,
      timestamp: now,
      source: "gateway",
      type: "chat.message_created",
      payload: { message, autoReply },
    };
    this.emit({ ...event, source: "mock" });
    return { message, autoReply, event };
  }

  async listAgents(): Promise<OpcAgent[]> {
    return agentsJson as OpcAgent[];
  }

  async listSubagents(): Promise<OpcSubagent[]> {
    return [];
  }

  async getTaskLog(taskId: string): Promise<TaskLog> {
    return {
      taskId,
      entries: [
        {
          id: `log-${taskId}-1`,
          timestamp: new Date().toISOString(),
          level: "info",
          message: "来自 OpenClawAdapter 的 mock 任务日志。",
        },
      ],
    };
  }

  private emit(event: OpenClawEvent): void {
    for (const handler of this.handlers) handler(event);
  }
}

export class WsOpenClawAdapter implements OpenClawAdapter {
  private socket: WebSocket | null = null;
  private handlers = new Set<Handler>();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectDelay = 1000;
  private config: OpenClawConnectionConfig = {
    mode: "ws",
    gatewayUrl: "ws://127.0.0.1:18789",
  };
  private connected = false;
  private lastError: string | undefined;
  private authFailed = false;

  async connect(config?: Partial<OpenClawConnectionConfig>): Promise<void> {
    this.config = { ...this.config, ...config, mode: "ws" };
    await this.openSocket();
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close();
    this.socket = null;
  }

  async status(): Promise<OpenClawStatus> {
    return {
      connected: this.connected,
      mode: "ws",
      gatewayUrl: this.config.gatewayUrl,
      authStatus: this.authFailed ? "failed" : this.connected ? "authenticated" : "unknown",
      lastError: this.lastError,
    };
  }

  async getVersion(): Promise<string | null> {
    return null;
  }

  async gatewayStatus(): Promise<GatewayStatus> {
    return { connected: this.connected, lastError: this.lastError };
  }

  async doctor(): Promise<DoctorResult> {
    return { ok: this.connected, raw: this.lastError ?? "", diagnostics: [] };
  }

  async channelsStatusProbe(): Promise<ChannelsProbeResult> {
    return { ok: this.connected, raw: "" };
  }

  async getRecentLogs(): Promise<OpenClawLogLine[]> {
    return [];
  }

  subscribe(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("OpenClaw Gateway socket is not connected");
    }
    const requestId = `send-${Date.now()}`;
    this.socket.send(JSON.stringify({ id: requestId, type: "chat.send", payload: input }));
    const now = new Date().toISOString();
    return {
      message: {
        id: requestId,
        conversationId: input.conversationId ?? "unknown",
        channel: input.channel,
        direction: "outbound",
        role: "user",
        author: { type: "human", id: "user-local", displayName: "用户" },
        content: input.content,
        createdAt: now,
      },
    };
  }

  async listAgents(): Promise<OpcAgent[]> {
    return agentsJson as OpcAgent[];
  }

  async listSubagents(): Promise<OpcSubagent[]> {
    return [];
  }

  async getTaskLog(taskId: string): Promise<TaskLog> {
    return { taskId, entries: [] };
  }

  private async openSocket(): Promise<void> {
    if (this.authFailed) throw new AuthError();
    this.socket = new WebSocket(this.config.gatewayUrl, {
      headers: {
        ...(this.config.token ? { Authorization: `Bearer ${this.config.token}` } : {}),
        ...(this.config.password ? { "X-OpenClaw-Password": this.config.password } : {}),
      },
    });
    this.socket.on("open", () => {
      this.connected = true;
      this.reconnectDelay = 1000;
    });
    this.socket.on("message", (data) => this.handleMessage(data.toString()));
    this.socket.on("error", (error) => {
      this.lastError = error.message;
      if (/auth|401|403/i.test(error.message)) this.authFailed = true;
    });
    this.socket.on("close", (code) => {
      this.connected = false;
      if (code === 1008 || this.authFailed) {
        this.authFailed = true;
        return;
      }
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket().catch((error: Error) => {
        this.lastError = error.message;
        this.scheduleReconnect();
      });
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
  }

  private handleMessage(raw: string): void {
    try {
      const parsed = JSON.parse(raw) as { id?: string; type?: string; payload?: unknown };
      const event: OpenClawEvent = {
        id: parsed.id ?? `gateway-${Date.now()}`,
        timestamp: new Date().toISOString(),
        type: parsed.type ?? "gateway.event",
        source: "gateway",
        payload: parsed.payload,
      };
      for (const handler of this.handlers) handler(event);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : "Invalid Gateway event";
    }
  }
}

export class CliOpenClawAdapter implements OpenClawAdapter {
  private handlers = new Set<Handler>();
  private available = false;
  private readonly cliPath: string;

  constructor(cliPath = "openclaw") {
    this.cliPath = cliPath;
  }

  async connect(): Promise<void> {
    this.available = await commandExists(this.cliPath);
  }

  async disconnect(): Promise<void> {
    this.available = false;
  }

  async status(): Promise<OpenClawStatus> {
    if (!this.available) {
      return {
        connected: false,
        mode: "cli",
        authStatus: "unknown",
        lastError: `${this.cliPath} CLI missing`,
      };
    }
    try {
      const { stdout } = await execFileAsync(this.cliPath, ["status", "--json"], {
        timeout: 5000,
      });
      const parsed = JSON.parse(stdout) as {
        connected?: boolean;
        latencyMs?: number;
        gateway?: { reachable?: boolean; connectLatencyMs?: number; error?: string };
      };
      return {
        connected: Boolean(parsed.connected ?? parsed.gateway?.reachable),
        mode: "cli",
        authStatus: "unknown",
        latencyMs: parsed.latencyMs ?? parsed.gateway?.connectLatencyMs ?? undefined,
        lastError: parsed.gateway?.error,
      };
    } catch (error) {
      return {
        connected: false,
        mode: "cli",
        authStatus: "unknown",
        lastError: error instanceof Error ? error.message : "openclaw status failed",
      };
    }
  }

  async getVersion(): Promise<string | null> {
    const result = await execCli(this.cliPath, ["--version"], 5000);
    return result.ok ? result.stdout.trim().split(/\r?\n/)[0] : null;
  }

  async gatewayStatus(): Promise<GatewayStatus> {
    const status = await this.status();
    return { connected: status.connected, lastError: status.lastError, raw: status };
  }

  async doctor(): Promise<DoctorResult> {
    const result = await execCli(this.cliPath, ["doctor"], 15000);
    return {
      ok: result.ok,
      raw: `${result.stdout}${result.stderr}`,
      diagnostics: result.ok ? [] : [result.error ?? "openclaw doctor failed"],
    };
  }

  async channelsStatusProbe(): Promise<ChannelsProbeResult> {
    const result = await execCli(this.cliPath, ["channels", "status", "--probe"], 10000);
    return { ok: result.ok, raw: `${result.stdout}${result.stderr}${result.error ?? ""}` };
  }

  async getRecentLogs(): Promise<OpenClawLogLine[]> {
    return [];
  }

  subscribe(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    const conversationId = input.conversationId ?? "conv-panel-command";
    const now = new Date().toISOString();
    return {
      message: {
        id: `msg-cli-${Date.now()}`,
        conversationId,
        channel: input.channel,
        direction: "outbound",
        role: "user",
        author: { type: "human", id: "user-local", displayName: "用户" },
        content: input.content,
        createdAt: now,
        taskId: input.taskId,
      },
      autoReply: {
        id: `msg-cli-fallback-${Date.now()}`,
        conversationId,
        channel: input.channel,
        direction: "internal",
        role: "agent",
        author: { type: "agent", id: "agent-conductor", displayName: "OPC Conductor" },
        content: "当前 OpenClaw CLI 为只读模式，Bridge 已用 mock fallback 暂存这条消息。",
        createdAt: new Date(Date.now() + 150).toISOString(),
        taskId: input.taskId,
      },
    };
  }

  async listAgents(): Promise<OpcAgent[]> {
    return agentsJson as OpcAgent[];
  }

  async listSubagents(): Promise<OpcSubagent[]> {
    return [];
  }

  async getTaskLog(taskId: string): Promise<TaskLog> {
    return { taskId, entries: [] };
  }
}

export function createOpenClawAdapter(config: OpenClawConnectionConfig): OpenClawAdapter {
  if (config.mode === "ws") return new WsOpenClawAdapter();
  if (config.mode === "cli") return new CliOpenClawAdapter(config.cliPath);
  return new MockOpenClawAdapter();
}

export function mapGatewayEventToOpcEvent(event: OpenClawEvent): OpcEvent {
  return {
    id: event.id,
    timestamp: event.timestamp,
    source: "gateway",
    type: event.type,
    payload: event.payload,
  };
}

async function commandExists(command: string): Promise<boolean> {
  try {
    await execFileAsync("which", [command], { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

async function execCli(command: string, args: string[], timeout: number) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { timeout });
    return { ok: true as const, stdout, stderr };
  } catch (error) {
    const nodeError = error as Error & { stdout?: string; stderr?: string };
    return {
      ok: false as const,
      stdout: nodeError.stdout ?? "",
      stderr: nodeError.stderr ?? "",
      error: nodeError.message,
    };
  }
}
