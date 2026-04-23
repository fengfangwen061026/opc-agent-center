const sensitiveKeys = [
  "api_key",
  "secret",
  "token",
  "password",
  "authorization",
  "cookie",
  "private_key",
  "ssh_key",
  "session",
  "bearer",
];

export function sanitizeLog<T>(input: T): T {
  if (Array.isArray(input)) return input.map((item) => sanitizeLog(item)) as T;
  if (!input || typeof input !== "object") return input;
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    output[key] = sensitiveKeys.some((sensitive) => key.toLowerCase().includes(sensitive))
      ? "[REDACTED]"
      : sanitizeLog(value);
  }
  return output as T;
}

export function bridgeLog(message: string, payload?: unknown): void {
  if (payload === undefined) {
    console.log(message);
    return;
  }
  console.log(message, sanitizeLog(payload));
}
