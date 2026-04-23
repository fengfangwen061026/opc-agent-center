import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sanitizeLog } from "../lib/sanitizeLog";
import { ensureDir, writeJsonFile } from "./jsonFiles";

export type IntegrationConfigStoreInput = {
  id: string;
  config?: Record<string, unknown>;
  secrets?: Record<string, unknown>;
};

export class IntegrationConfigStore {
  private readonly configPath: string;
  private readonly secretsPath: string;

  constructor(dir: string) {
    this.configPath = join(dir, "config", "local.json");
    this.secretsPath = join(dir, "secrets", "secrets.local.json");
    ensureDir(join(dir, "config"));
    ensureDir(join(dir, "secrets"));
    if (!existsSync(this.configPath)) writeJsonFile(this.configPath, {});
    if (!existsSync(this.secretsPath)) {
      writeFileSync(this.secretsPath, "{}\n", { mode: 0o600 });
      this.chmodSecrets();
    }
  }

  getRedacted(id?: string): Record<string, unknown> {
    const config = this.read(this.configPath);
    const secrets = this.read(this.secretsPath);
    if (id) {
      return sanitizeLog({
        config: (config[id] as Record<string, unknown> | undefined) ?? {},
        secrets: redactSecrets((secrets[id] as Record<string, unknown> | undefined) ?? {}),
      });
    }
    return sanitizeLog({
      config,
      secrets: Object.fromEntries(
        Object.keys(secrets).map((key) => [
          key,
          redactSecrets((secrets[key] as Record<string, unknown> | undefined) ?? {}),
        ]),
      ),
    });
  }

  merge(input: IntegrationConfigStoreInput): Record<string, unknown> {
    const config = this.read(this.configPath);
    const secrets = this.read(this.secretsPath);
    config[input.id] = {
      ...((config[input.id] as Record<string, unknown> | undefined) ?? {}),
      ...(input.config ?? {}),
    };
    secrets[input.id] = {
      ...((secrets[input.id] as Record<string, unknown> | undefined) ?? {}),
      ...(input.secrets ?? {}),
    };
    writeJsonFile(this.configPath, config);
    writeFileSync(this.secretsPath, `${JSON.stringify(secrets, null, 2)}\n`, { mode: 0o600 });
    this.chmodSecrets();
    return this.getRedacted(input.id);
  }

  private read(path: string): Record<string, unknown> {
    try {
      return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  private chmodSecrets(): void {
    try {
      chmodSync(this.secretsPath, 0o600);
    } catch {
      // chmod is best-effort on non-POSIX filesystems.
    }
  }
}

function redactSecrets(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      typeof value === "string" && value ? maskSecret(value) : Boolean(value),
    ]),
  );
}

function maskSecret(value: string): string {
  if (value.length <= 8) return "[REDACTED]";
  return `${value.slice(0, 3)}***${value.slice(-4)}`;
}
