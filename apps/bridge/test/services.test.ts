import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createOpcEvent, type CodingRunV1 } from "@opc/shared";
import { parseHermesJson } from "@opc/hermes-adapter";
import { MockObsidianAdapter } from "@opc/obsidian-adapter";
import { createBridgeRuntime } from "../src/runtime";
import { ApprovalEffectRunner, hashEffectParams } from "../src/services/approvalEffectRunner";
import { CodingWorkspaceManager } from "../src/services/codingWorkspaceManager";
import { EventBus } from "../src/services/eventBus";
import { runCommand, testObsidian } from "../src/services/serviceDiagnostics";
import { ServiceSupervisor } from "../src/services/supervisor";
import { validateCommand } from "../src/services/commandSafety";
import { evaluatePolicy } from "../src/services/policyEngine";
import { runCodingTestCommand } from "../src/services/testCommandRunner";
import { writeReviewNoteCreateOnlyAndVerify } from "../src/services/obsidianReviewWriter";
import {
  createRuntimeBackup,
  exportRuntimeBundle,
  previewRuntimeCleanup,
  runtimeStateSummary,
} from "../src/services/runtimeStateService";
import { CapsuleStore } from "../src/stores/capsuleStore";
import { ApprovalStore } from "../src/stores/approvalStore";
import { validateAllowedRoot } from "../src/stores/codingRunStore";
import { ObsidianReviewStore } from "../src/stores/obsidianReviewStore";
import { SkillRegistry } from "../src/stores/skillRegistry";
import type { BridgeEnv } from "../src/lib/env";

describe("ServiceSupervisor", () => {
  it("starts a short process and collects logs", async () => {
    const supervisor = new ServiceSupervisor();
    const state = supervisor.start({
      id: "short",
      label: "short",
      command: process.execPath,
      args: ["-e", "console.log('supervisor-ok')"],
    });
    expect(state.status).toBe("running");
    await waitFor(() => supervisor.status("short").status === "exited");
    expect(supervisor.status("short").status).toBe("exited");
    expect(supervisor.logs("short").some((line) => line.line.includes("supervisor-ok"))).toBe(true);
  });
});

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 2000;
  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe("EventBus", () => {
  it("publishes and reloads recent events", () => {
    const dir = mkdtempSync(join(tmpdir(), "opc-events-"));
    try {
      const file = join(dir, "events.jsonl");
      const bus = new EventBus(file);
      bus.publish(
        createOpcEvent({
          type: "chat.message.created",
          source: "bridge",
          payload: { content: "你好" },
        }),
      );
      expect(bus.recent(1)).toHaveLength(1);
      expect(new EventBus(file).recent(1)[0]?.type).toBe("chat.message.created");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("CapsuleStore", () => {
  it("creates, reads, and patches capsules", () => {
    const dir = mkdtempSync(join(tmpdir(), "opc-capsules-"));
    try {
      const store = new CapsuleStore(dir);
      const capsule = store.create({
        taskId: "task-test",
        userRequest: "测试",
        goal: "测试 capsule",
        intent: "unit_test",
        riskLevel: "S1",
        conductorAgentId: "agent-conductor",
        workerAgentIds: [],
        skillsUsed: [],
        inputs: ["测试"],
        actionsSummary: [],
        outputs: [],
        verification: [],
        problems: [],
        memoryCandidates: [],
        skillCandidates: [],
        approvals: [],
      });
      expect(store.get(capsule.id)?.goal).toBe("测试 capsule");
      expect(store.patch(capsule.id, { status: "completed" })?.status).toBe("completed");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("Diagnostics", () => {
  it("detects command timeout", async () => {
    const result = await runCommand(process.execPath, ["-e", "setTimeout(()=>{}, 2000)"], 50);
    expect(result.ok).toBe(false);
    expect(result.timedOut).toBe(true);
  });

  it("returns needs_token for Obsidian REST without token", async () => {
    const result = await testObsidian({
      obsidianMode: "rest",
      obsidianApiUrl: "https://127.0.0.1:27124",
    } as BridgeEnv);
    expect(result.status).toBe("needs_token");
  });
});

describe("Phase 3 stores", () => {
  it("parses skill frontmatter and applies safe defaults", () => {
    const dir = mkdtempSync(join(tmpdir(), "opc-skill-registry-"));
    try {
      const skillDir = join(dir, "risky-skill");
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(
        join(skillDir, "SKILL.md"),
        "---\nname: risky-skill\ndescription: Missing opc metadata\n---\n# risky\n",
      );
      const registry = new SkillRegistry([dir], join(dir, "cache", "registry-cache.json"));
      const result = registry.scan();
      const skill = result.skills.find((item) => item.id === "risky-skill");
      expect(skill?.risk).toBe("S3");
      expect(skill?.approvalRequired).toBe(true);
      expect(skill?.trust).toBe("review_required");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("transitions approvals", () => {
    const dir = mkdtempSync(join(tmpdir(), "opc-approvals-"));
    try {
      const store = new ApprovalStore(dir);
      const approval = store.create({
        kind: "coding_run",
        title: "审批",
        summary: "测试审批",
        risk: "S3",
        requestedBy: "user",
        related: {},
        proposedAction: { label: "执行", filesTouched: [], reversible: false },
      });
      expect(store.transition(approval.id, "request_changes")?.status).toBe("changes_requested");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("validates allowed coding roots and blocks path escape", () => {
    const dir = mkdtempSync(join(tmpdir(), "opc-allowed-root-"));
    const outside = mkdtempSync(join(tmpdir(), "opc-outside-"));
    try {
      expect(validateAllowedRoot(dir, [dir]).ok).toBe(true);
      expect(validateAllowedRoot(outside, [dir]).ok).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("prevents symlink escape from allowed coding roots", () => {
    const root = mkdtempSync(join(tmpdir(), "opc-allowed-root-"));
    const outside = mkdtempSync(join(tmpdir(), "opc-outside-"));
    try {
      const link = join(root, "outside-link");
      symlinkSync(outside, link, "dir");
      expect(validateAllowedRoot(link, [root]).ok).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("builds safe Codex and Claude commands", () => {
    const dir = mkdtempSync(join(tmpdir(), "opc-coding-workspace-"));
    try {
      const env = {
        codingAgentWorkspaceRoot: dir,
        codingAgentAllowedRoots: [dir],
        codingAgentMaxTimeoutMs: 1000,
        codingAgentAllowedTestCommands: ["pnpm test"],
        codexCliPath: "codex",
        claudeCliPath: "claude",
        claudeCodeRealEdit: false,
      } as BridgeEnv;
      const manager = new CodingWorkspaceManager(env);
      const codex = manager.buildCodexCommand(dir, dir);
      expect(codex.args.join(" ")).not.toContain("yolo");
      expect(codex.args.join(" ")).not.toContain("danger-full-access");
      const claude = manager.buildClaudeCommand(dir, "plan only");
      expect(claude.args).toContain("plan");
      expect(claude.args.join(" ")).not.toContain("bypassPermissions");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects ApprovalEffectRunner paramsHash mismatch", async () => {
    const runtime = await createBridgeRuntime();
    try {
      const approval = runtime.approvalStore.create({
        kind: "skill_run",
        title: "坏 hash",
        summary: "拒绝执行",
        risk: "S3",
        requestedBy: "user",
        related: {},
        proposedAction: { label: "执行", filesTouched: [], reversible: false },
        effect: {
          id: "effect-bad-hash",
          targetType: "skill_run",
          targetId: "missing-run",
          action: "resume",
          paramsHash: "bad",
          createdAt: new Date().toISOString(),
          idempotencyKey: "bad",
        },
      });
      const record = await new ApprovalEffectRunner(
        runtime,
        join(mkdtempSync(join(tmpdir(), "opc-effects-")), "effects"),
      ).apply(approval);
      expect(record?.status).toBe("failed");
      expect(record?.error).toContain("paramsHash mismatch");
    } finally {
      await runtime.openclaw.disconnect();
    }
  });

  it("keeps ApprovalEffectRunner idempotent for completed effects", async () => {
    const runtime = await createBridgeRuntime();
    try {
      const skill = runtime.skillRegistry.get("builtin-echo")?.descriptor;
      expect(skill).toBeTruthy();
      const run = runtime.skillRunStore.create({
        skillId: "builtin-echo",
        requestedBy: "user",
        mode: "execute",
        status: "waiting_approval",
        risk: "S0",
        input: {},
        output: {},
      });
      const params = { targetType: "skill_run", targetId: run.id, action: "resume" } as const;
      const approval = runtime.approvalStore.create({
        kind: "skill_run",
        title: "恢复 SkillRun",
        summary: "测试幂等",
        risk: "S0",
        requestedBy: "user",
        related: { skillRunId: run.id },
        proposedAction: { label: "恢复", filesTouched: [], reversible: true },
        effect: {
          id: "effect-idempotent",
          ...params,
          paramsHash: hashEffectParams(params),
          createdAt: new Date().toISOString(),
          idempotencyKey: "effect-idempotent",
        },
      });
      const dir = mkdtempSync(join(tmpdir(), "opc-effects-"));
      const runner = new ApprovalEffectRunner(runtime, dir);
      const first = await runner.apply(approval);
      const second = await runner.apply(approval);
      expect(first?.status).toBe("succeeded");
      expect(second?.status).toBe("succeeded");
      expect(runtime.skillRunStore.get(run.id)?.status).toBe("succeeded");
    } finally {
      await runtime.openclaw.disconnect();
    }
  });

  it("creates deterministic Obsidian review previews", () => {
    const dir = mkdtempSync(join(tmpdir(), "opc-obsidian-review-"));
    try {
      const store = new ObsidianReviewStore(dir, "08_Review_Queue");
      const preview = store.createPreview({ title: "中文 Review Note", content: "内容" });
      expect(preview.path.startsWith("08_Review_Queue/")).toBe(true);
      expect(preview.content).toContain('status: "review"');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not overwrite Obsidian notes in createOnly mode", async () => {
    const adapter = new MockObsidianAdapter();
    await adapter.write("08_Review_Queue/no-overwrite.md", "# one", { mode: "createOnly" });
    await expect(
      adapter.write("08_Review_Queue/no-overwrite.md", "# two", { mode: "createOnly" }),
    ).rejects.toThrow(/存在|exists/i);
  });

  it("parses recoverable Hermes JSON output", () => {
    const parsed = parseHermesJson<{ ok: boolean }>(
      'prefix ```json\n{"ok": true, "service": "hermes"}\n``` suffix',
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.ok).toBe(true);
  });

  it("evaluates Phase 5 policy decisions", () => {
    const root = mkdtempSync(join(tmpdir(), "opc-policy-root-"));
    const workspaceRoot = mkdtempSync(join(tmpdir(), "opc-policy-workspace-"));
    const outside = mkdtempSync(join(tmpdir(), "opc-policy-outside-"));
    try {
      const env = {
        codingAgentRealExec: true,
        codingAgentAllowedRoots: [root],
        codingAgentWorkspaceRoot: workspaceRoot,
        codingAgentAllowedTestCommands: ["pnpm test"],
        openclawManagedGateway: false,
        obsidianReviewQueuePath: "08_Review_Queue",
      } as BridgeEnv;
      const blocked = evaluatePolicy(env, {
        actor: { type: "user", id: "user" },
        action: { type: "coding.run", risk: "S3", approvalRequired: true },
        resource: { repoPath: outside, workspacePath: join(workspaceRoot, "run") },
      });
      expect(blocked.allowed).toBe(false);
      expect(blocked.blockedBy).toContain("repo_path");
      const obsidian = evaluatePolicy(env, {
        actor: { type: "agent", id: "knowledge" },
        action: { type: "obsidian.review.write", risk: "S2", approvalRequired: true },
        resource: { path: "08_Review_Queue/2026-04-23/note.md" },
      });
      expect(obsidian.allowed).toBe(true);
      expect(obsidian.rollbackNote).toContain("Review Queue");
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(workspaceRoot, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("blocks unsafe test commands and runs allowlisted commands in workspace", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "opc-test-runner-"));
    try {
      expect(validateCommand("git push", ["git push"]).ok).toBe(false);
      expect(validateCommand("pnpm test && rm -rf .", ["pnpm test && rm -rf ."]).ok).toBe(false);
      const command = `${process.execPath} -e "process.exit(0)"`;
      const env = {
        codingAgentWorkspaceRoot: workspaceRoot,
        codingAgentAllowedTestCommands: [command],
        codingAgentMaxTimeoutMs: 1000,
        codingAgentMaxOutputBytes: 1000,
      } as BridgeEnv;
      const run = {
        id: "coding-run-test",
        provider: "codex",
        status: "completed",
        repoPath: workspaceRoot,
        workspacePath: workspaceRoot,
        worktreePath: workspaceRoot,
        prompt: "test",
        timeoutMs: 1000,
        changedFiles: [],
        testStatus: "not_run",
      } as CodingRunV1;
      const result = await runCodingTestCommand(env, run, command);
      expect(result.status).toBe("passed");
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("writes Obsidian review notes createOnly and verifies readback", async () => {
    const dir = mkdtempSync(join(tmpdir(), "opc-obsidian-verify-"));
    try {
      const store = new ObsidianReviewStore(dir, "08_Review_Queue");
      const adapter = new MockObsidianAdapter();
      const note = store.createPreview({ title: "Readback Verify", content: "校验内容" });
      const result = await writeReviewNoteCreateOnlyAndVerify(adapter, store, note);
      expect(result.verified).toBe(true);
      expect(store.get(note.id)?.status).toBe("verified");
      await expect(writeReviewNoteCreateOnlyAndVerify(adapter, store, note)).rejects.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exports, summarizes, and backs up runtime state without secrets", async () => {
    const runtime = await createBridgeRuntime();
    try {
      const summary = runtimeStateSummary(runtime);
      expect(summary.counts.capsules).toBeGreaterThan(0);
      const bundle = exportRuntimeBundle(runtime) as { summary: unknown; note: string };
      expect(bundle.summary).toBeTruthy();
      expect(JSON.stringify(bundle)).not.toContain("OBSIDIAN_REST_TOKEN");
      const backup = createRuntimeBackup(runtime);
      expect(backup.path).toContain("data/runtime/backups/state");
      expect(previewRuntimeCleanup(runtime)).toBeInstanceOf(Array);
    } finally {
      await runtime.openclaw.disconnect();
    }
  });
});
