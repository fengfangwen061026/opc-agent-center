import {
  policyDecisionInputV1Schema,
  policyDecisionV1Schema,
  type PolicyDecisionInputV1,
  type PolicyDecisionV1,
} from "@opc/shared";
import type { BridgeEnv } from "../lib/env";
import { validateCommand } from "./commandSafety";
import {
  validatePathInsideRoots,
  validateWorkspacePath,
  validateWorkspaceRoot,
} from "./pathSafety";

export function evaluatePolicy(env: BridgeEnv, input: PolicyDecisionInputV1): PolicyDecisionV1 {
  const request = policyDecisionInputV1Schema.parse(input);
  const blockedBy: string[] = [];
  const requiredEnv: string[] = [];
  const normalizedPaths: Record<string, string> = {};
  let allowed = true;
  const requiresApproval =
    request.action.approvalRequired === true || ["S3", "S4"].includes(request.action.risk);
  let reason = requiresApproval
    ? "高风险或显式要求审批，必须通过 ApprovalEffectRunner。"
    : "策略允许。";
  let severity: PolicyDecisionV1["severity"] = requiresApproval ? "warning" : "info";

  const block = (code: string, message: string, envName?: string) => {
    allowed = false;
    blockedBy.push(code);
    if (envName) requiredEnv.push(envName);
    reason = message;
    severity = "danger";
  };

  if (request.action.type === "coding.run") {
    if (!env.codingAgentRealExec) {
      block(
        "real_exec_disabled",
        "CODING_AGENT_REAL_EXEC=0，真实 coding run 不允许执行，只能 mock/fallback。",
        "CODING_AGENT_REAL_EXEC",
      );
    }
    const repoPath = request.resource?.repoPath;
    if (repoPath) {
      const repo = validatePathInsideRoots(repoPath, env.codingAgentAllowedRoots, "repoPath");
      if (repo.path) normalizedPaths.repoPath = repo.path;
      if (!repo.ok)
        block("repo_path", repo.reason ?? "repoPath 不合法。", "CODING_AGENT_ALLOWED_ROOTS");
    }
    const root = validateWorkspaceRoot(env.codingAgentWorkspaceRoot);
    if (root.path) normalizedPaths.workspaceRoot = root.path;
    if (!root.ok)
      block(
        "workspace_root",
        root.reason ?? "workspace root 不合法。",
        "CODING_AGENT_WORKSPACE_ROOT",
      );
    if (request.resource?.workspacePath) {
      const workspace = validateWorkspacePath(
        request.resource.workspacePath,
        env.codingAgentWorkspaceRoot,
      );
      if (workspace.path) normalizedPaths.workspacePath = workspace.path;
      if (!workspace.ok) block("workspace_path", workspace.reason ?? "workspace path 不合法。");
    }
  }

  if (request.action.type === "coding.test") {
    const command = request.resource?.command ?? "";
    const commandResult = validateCommand(command, env.codingAgentAllowedTestCommands);
    if (!commandResult.ok) block("test_command", commandResult.reason ?? "测试命令不合法。");
    if (request.resource?.workspacePath) {
      const workspace = validateWorkspacePath(
        request.resource.workspacePath,
        env.codingAgentWorkspaceRoot,
      );
      if (workspace.path) normalizedPaths.workspacePath = workspace.path;
      if (!workspace.ok) block("workspace_path", workspace.reason ?? "workspace path 不合法。");
    }
  }

  if (request.action.type === "obsidian.review.write") {
    const path = request.resource?.path ?? "";
    const reviewQueue = env.obsidianReviewQueuePath.replace(/^\/+|\/+$/g, "");
    if (!path.startsWith(`${reviewQueue}/`)) {
      block("obsidian_review_queue", "Obsidian 只能 create-only 写入 Review Queue。");
    }
  }

  if (request.action.type === "hermes.candidate.apply") {
    const path = request.resource?.path ?? "";
    if (path.includes("/stable/") || /MEMORY\.md|USER\.md/i.test(path)) {
      block(
        "hermes_target",
        "Hermes candidate 只能写入 draft/experimental，不能改 stable 或真实 MEMORY/USER。",
      );
    }
  }

  if (request.action.type === "skill.promote") {
    if (request.action.risk === "S3" || request.action.risk === "S4") {
      reason = "Skill promotion 需要 eval + approval + backup。";
      severity = allowed ? "warning" : severity;
    }
  }

  if (request.action.type === "service.start" || request.action.type === "service.stop") {
    if (request.resource?.serviceId === "openclaw" && !env.openclawManagedGateway) {
      block(
        "managed_service",
        "Bridge 只能管理自己启动的 OpenClaw Gateway。",
        "OPENCLAW_MANAGED_GATEWAY",
      );
    }
  }

  return policyDecisionV1Schema.parse({
    allowed,
    requiresApproval,
    reason,
    severity,
    requiredEnv: requiredEnv.length ? [...new Set(requiredEnv)] : undefined,
    blockedBy: blockedBy.length ? blockedBy : undefined,
    normalizedPaths: Object.keys(normalizedPaths).length ? normalizedPaths : undefined,
    rollbackNote: rollbackNoteFor(request),
  });
}

function rollbackNoteFor(input: PolicyDecisionInputV1): string {
  if (input.action.type === "coding.run") return "删除隔离 workspace 或丢弃 diff；不影响原 repo。";
  if (input.action.type === "obsidian.review.write")
    return "删除新建 Review Queue note；不会覆盖已有笔记。";
  if (input.action.type === "hermes.candidate.apply")
    return "删除 draft/experimental candidate 文件。";
  if (input.action.type === "skill.promote")
    return "使用 data/runtime/backups/skills 中的备份恢复。";
  return "拒绝或归档审批即可停止动作。";
}
