import { existsSync, mkdirSync, realpathSync } from "node:fs";
import { resolve } from "node:path";

export type PathCheck = {
  ok: boolean;
  path?: string;
  reason?: string;
};

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

export function validatePathInsideRoots(path: string, roots: string[], label: string): PathCheck {
  if (!roots.length) return { ok: false, reason: `${label} allowed roots 未配置。` };
  const realPath = safeRealPath(path);
  if (!realPath) return { ok: false, reason: `${label} 不存在或无法解析。` };
  if (hasSensitiveSegment(realPath)) return { ok: false, reason: `${label} 指向敏感路径。` };
  for (const root of roots) {
    const realRoot = safeRealPath(root);
    if (realRoot && containsPath(realRoot, realPath)) return { ok: true, path: realPath };
  }
  return { ok: false, reason: `${label} 不在允许路径内。` };
}

export function validateWorkspaceRoot(root: string): PathCheck {
  try {
    mkdirSync(root, { recursive: true });
    const realRoot = realpathSync(root);
    if (realRoot === "/" || realRoot.length < 8) {
      return { ok: false, reason: "workspace root 不能是根目录或过短路径。" };
    }
    if (hasSensitiveSegment(realRoot))
      return { ok: false, reason: "workspace root 指向敏感路径。" };
    return { ok: true, path: realRoot };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

export function validateWorkspacePath(workspacePath: string, workspaceRoot: string): PathCheck {
  const root = validateWorkspaceRoot(workspaceRoot);
  if (!root.ok || !root.path) return root;
  const realPath = safeRealPath(workspacePath) ?? resolve(workspacePath);
  if (!containsPath(root.path, realPath)) {
    return { ok: false, reason: "workspacePath escaped CODING_AGENT_WORKSPACE_ROOT。" };
  }
  return { ok: true, path: realPath };
}

export function hasSensitiveSegment(path: string): boolean {
  return path
    .split("/")
    .some((segment) =>
      /(^\.env|secret|token|password|private_key|ssh_key|credentials)/i.test(segment),
    );
}
