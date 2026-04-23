export type CommandSafetyResult = {
  ok: boolean;
  tokens?: string[];
  reason?: string;
};

const shellMeta = /[;&|`$<>]/;
const blockedCommands = new Set([
  "rm",
  "sudo",
  "curl",
  "wget",
  "docker",
  "kubectl",
  "terraform",
  "ssh",
  "scp",
]);
const blockedPairs = [
  ["git", "push"],
  ["git", "merge"],
  ["git", "checkout"],
  ["git", "reset"],
  ["terraform", "apply"],
  ["npm", "publish"],
  ["pnpm", "publish"],
];

export function validateCommand(command: string, allowlist: string[]): CommandSafetyResult {
  const trimmed = command.trim();
  if (!trimmed) return { ok: false, reason: "命令为空。" };
  if (shellMeta.test(trimmed)) return { ok: false, reason: "命令包含 shell 元字符，已阻止。" };
  if (!allowlist.includes(trimmed)) {
    return { ok: false, reason: "测试命令不在 allowlist 中。" };
  }
  const tokens = tokenizeCommand(trimmed);
  if (!tokens.length) return { ok: false, reason: "命令无法解析。" };
  const base = tokens[0] ?? "";
  if (blockedCommands.has(base)) return { ok: false, reason: `命令 ${base} 被策略禁止。` };
  for (const [first, second] of blockedPairs) {
    if (tokens[0] === first && tokens[1] === second) {
      return { ok: false, reason: `${first} ${second} 被策略禁止。` };
    }
  }
  return { ok: true, tokens };
}

export function assertNoDangerousAgentArgs(args: string[]): void {
  const joined = args.join(" ");
  for (const pattern of [
    "--yolo",
    "--dangerously-bypass",
    "--dangerously-bypass-approvals-and-sandbox",
    "--dangerously-skip-permissions",
    "--bypass-permissions",
    "danger-full-access",
    "bypassPermissions",
  ]) {
    if (joined.includes(pattern)) throw new Error(`危险参数已阻止：${pattern}`);
  }
}

export function tokenizeCommand(command: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;
  for (const char of command) {
    if ((char === "'" || char === '"') && !quote) {
      quote = char;
      continue;
    }
    if (char === quote) {
      quote = undefined;
      continue;
    }
    if (/\s/.test(char) && !quote) {
      if (current) tokens.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);
  return tokens;
}
