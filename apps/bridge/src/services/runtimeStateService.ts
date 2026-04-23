import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import type { BridgeRuntime } from "../runtime";
import { sanitizeLog } from "../lib/sanitizeLog";
import { validateWorkspacePath } from "./pathSafety";
import { writeJsonFile } from "../stores/jsonFiles";

export type RuntimeCleanupCandidate = {
  kind: "coding_workspace";
  path: string;
  reason: string;
  bytes: number;
};

export function runtimeStateSummary(runtime: BridgeRuntime) {
  const runtimeRoot = new URL("../../../../data/runtime", import.meta.url).pathname;
  return {
    generatedAt: new Date().toISOString(),
    counts: {
      capsules: runtime.capsuleStore.list().length,
      approvals: runtime.approvalStore.list().length,
      skillRuns: runtime.skillRunStore.list().length,
      codingRuns: runtime.codingRunStore.list().length,
      hermesCandidates: runtime.hermesCandidateStore.list().length,
      hermesRuns: runtime.hermesRunStore.list().length,
      obsidianReviewNotes: runtime.obsidianReviewStore.list().length,
      skillEvals: runtime.skillEvalStore.list().length,
      skillPromotions: runtime.skillPromotionStore.list().length,
      recentEvents: runtime.eventBus.recent(2000).length,
    },
    runtimeDir: summarizeDir(runtimeRoot),
    safety: {
      codingRealExec: runtime.env.codingAgentRealExec,
      hermesRealExec: runtime.env.hermesRealExec,
      obsidianMode: runtime.env.obsidianMode,
      openclawMode: runtime.env.openclawMode,
    },
  };
}

export function exportRuntimeBundle(runtime: BridgeRuntime) {
  return sanitizeLog({
    exportedAt: new Date().toISOString(),
    summary: runtimeStateSummary(runtime),
    capsules: runtime.capsuleStore.list(),
    approvals: runtime.approvalStore.list(),
    skills: runtime.skillRegistry.list(),
    skillRuns: runtime.skillRunStore.list(),
    codingRuns: runtime.codingRunStore.list(),
    hermesCandidates: runtime.hermesCandidateStore.list(),
    hermesRuns: runtime.hermesRunStore.list(),
    obsidianReviewNotes: runtime.obsidianReviewStore.list(),
    skillEvals: runtime.skillEvalStore.list(),
    skillPromotions: runtime.skillPromotionStore.list(),
    events: runtime.eventBus.recent(500),
    note: "导出不包含 secrets，不包含完整 coding workspace 原始日志；artifact 可通过单独 API 查看。",
  });
}

export function createRuntimeBackup(runtime: BridgeRuntime) {
  const backupRoot = new URL("../../../../data/runtime/backups/state", import.meta.url).pathname;
  mkdirSync(backupRoot, { recursive: true });
  const id = new Date().toISOString().replace(/[:.]/g, "-");
  const path = join(backupRoot, `${id}.json`);
  writeJsonFile(path, exportRuntimeBundle(runtime));
  return { id, path, createdAt: new Date().toISOString() };
}

export function listRuntimeBackups() {
  const backupRoot = new URL("../../../../data/runtime/backups/state", import.meta.url).pathname;
  if (!existsSync(backupRoot)) return [];
  return readdirSync(backupRoot)
    .filter((file) => file.endsWith(".json"))
    .map((file) => {
      const path = join(backupRoot, file);
      const stat = statSync(path);
      return {
        id: file.replace(/\.json$/, ""),
        path,
        bytes: stat.size,
        createdAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function previewRuntimeCleanup(runtime: BridgeRuntime): RuntimeCleanupCandidate[] {
  const currentWorkspacePaths = new Set(
    runtime.codingRunStore
      .list()
      .map((run) => run.workspacePath)
      .filter(Boolean),
  );
  const root = runtime.env.codingAgentWorkspaceRoot;
  if (!existsSync(root)) return [];
  const candidates: RuntimeCleanupCandidate[] = [];
  for (const child of readdirSync(root)) {
    const path = join(root, child);
    if (!statSync(path).isDirectory()) continue;
    if (currentWorkspacePaths.has(path)) continue;
    const safety = validateWorkspacePath(path, root);
    if (!safety.ok || !safety.path) continue;
    candidates.push({
      kind: "coding_workspace",
      path: safety.path,
      reason: "未被当前 CodingRun 引用的隔离 workspace。",
      bytes: summarizeDir(safety.path).bytes,
    });
  }
  return candidates;
}

export function applyRuntimeCleanup(runtime: BridgeRuntime, confirm: boolean) {
  const candidates = previewRuntimeCleanup(runtime);
  if (!confirm) return { applied: false, candidates };
  const removed: RuntimeCleanupCandidate[] = [];
  for (const candidate of candidates) {
    const safety = validateWorkspacePath(candidate.path, runtime.env.codingAgentWorkspaceRoot);
    if (!safety.ok || !safety.path) continue;
    rmSync(safety.path, { recursive: true, force: true });
    removed.push(candidate);
  }
  return { applied: true, removed };
}

function summarizeDir(path: string): { path: string; files: number; bytes: number } {
  if (!existsSync(path)) return { path, files: 0, bytes: 0 };
  let files = 0;
  let bytes = 0;
  const walk = (dir: string) => {
    for (const child of readdirSync(dir)) {
      if (["secrets", "node_modules"].includes(basename(child))) continue;
      const full = join(dir, child);
      const stat = statSync(full);
      if (stat.isDirectory()) walk(full);
      else {
        files += 1;
        bytes += stat.size;
      }
    }
  };
  walk(path);
  return { path, files, bytes };
}

export function readSmallText(path: string, maxBytes = 200_000): string {
  if (!existsSync(path)) return "";
  const stat = statSync(path);
  if (stat.size > maxBytes) {
    return `${readFileSync(path, "utf8").slice(0, maxBytes)}\n\n[truncated ${stat.size - maxBytes} bytes]`;
  }
  return readFileSync(path, "utf8");
}
