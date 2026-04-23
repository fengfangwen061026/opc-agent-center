import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

export type ManagedProcessStatus = "stopped" | "starting" | "running" | "exited" | "failed";

export type ManagedProcessLogLine = {
  ts: string;
  stream: "stdout" | "stderr";
  line: string;
};

export interface ManagedProcessState {
  id: string;
  label: string;
  command: string;
  args: string[];
  status: ManagedProcessStatus;
  pid?: number;
  startedAt?: string;
  exitedAt?: string;
  exitCode?: number | null;
  lastError?: string;
  logs: ManagedProcessLogLine[];
}

export type StartManagedProcessInput = {
  id: string;
  label: string;
  command: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
};

type ManagedProcessRecord = {
  child?: ChildProcessWithoutNullStreams;
  state: ManagedProcessState;
};

const MAX_LOG_LINES = 300;

export class ServiceSupervisor {
  private readonly processes = new Map<string, ManagedProcessRecord>();

  start(input: StartManagedProcessInput): ManagedProcessState {
    const existing = this.processes.get(input.id);
    if (existing?.child && existing.state.status === "running") return snapshot(existing.state);

    const state: ManagedProcessState = {
      id: input.id,
      label: input.label,
      command: input.command,
      args: input.args ?? [],
      status: "starting",
      startedAt: new Date().toISOString(),
      logs: existing?.state.logs ?? [],
    };
    const record: ManagedProcessRecord = { state };
    this.processes.set(input.id, record);

    try {
      const child = spawn(input.command, input.args ?? [], {
        cwd: input.cwd,
        env: { ...process.env, ...(input.env ?? {}) },
        stdio: "pipe",
      });
      record.child = child;
      state.pid = child.pid;
      state.status = "running";
      child.stdout.on("data", (chunk) => addLogs(state, "stdout", chunk));
      child.stderr.on("data", (chunk) => addLogs(state, "stderr", chunk));
      child.on("error", (error) => {
        state.status = "failed";
        state.lastError = error.message;
        state.exitedAt = new Date().toISOString();
      });
      child.on("exit", (code) => {
        state.status = code === 0 ? "exited" : "failed";
        state.exitCode = code;
        state.exitedAt = new Date().toISOString();
        record.child = undefined;
      });
    } catch (error) {
      state.status = "failed";
      state.lastError = error instanceof Error ? error.message : "process start failed";
      state.exitedAt = new Date().toISOString();
    }

    return snapshot(state);
  }

  stop(id: string): ManagedProcessState {
    const record = this.ensureRecord(id);
    if (record.child && record.state.status === "running") {
      record.child.kill("SIGTERM");
      record.state.status = "stopped";
      record.state.exitedAt = new Date().toISOString();
      record.child = undefined;
    }
    return snapshot(record.state);
  }

  status(id: string): ManagedProcessState {
    return snapshot(this.ensureRecord(id).state);
  }

  list(): ManagedProcessState[] {
    return Array.from(this.processes.values()).map((record) => snapshot(record.state));
  }

  logs(id: string): ManagedProcessLogLine[] {
    return [...this.ensureRecord(id).state.logs];
  }

  private ensureRecord(id: string): ManagedProcessRecord {
    let record = this.processes.get(id);
    if (!record) {
      record = {
        state: {
          id,
          label: id,
          command: "",
          args: [],
          status: "stopped",
          logs: [],
        },
      };
      this.processes.set(id, record);
    }
    return record;
  }
}

function addLogs(state: ManagedProcessState, stream: "stdout" | "stderr", chunk: Buffer): void {
  for (const line of chunk.toString("utf8").split(/\r?\n/)) {
    if (!line) continue;
    state.logs.push({ ts: new Date().toISOString(), stream, line });
  }
  if (state.logs.length > MAX_LOG_LINES) {
    state.logs.splice(0, state.logs.length - MAX_LOG_LINES);
  }
}

function snapshot(state: ManagedProcessState): ManagedProcessState {
  return {
    ...state,
    args: [...state.args],
    logs: [...state.logs],
  };
}
