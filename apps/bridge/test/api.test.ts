import { describe, expect, it } from "vitest";
import { createBridgeApp } from "../src/app";
import { createBridgeRuntime } from "../src/runtime";

describe("Bridge API", () => {
  it("serves health, agents, notifications, and service status", async () => {
    const runtime = await createBridgeRuntime();
    const app = createBridgeApp(runtime);
    const health = await app.request("/api/health");
    const agents = await app.request("/api/agents");
    const notifications = await app.request("/api/notifications");
    const services = await app.request("/api/services/status");
    const integrations = await app.request("/api/integrations");
    const events = await app.request("/api/events/recent");
    const runtimeSummary = await app.request("/api/runtime/state-summary");
    const obsidianConfig = await app.request("/api/obsidian/config/test", { method: "POST" });

    expect(health.status).toBe(200);
    expect(agents.status).toBe(200);
    expect(notifications.status).toBe(200);
    expect(services.status).toBe(200);
    expect(integrations.status).toBe(200);
    expect(events.status).toBe(200);
    expect(runtimeSummary.status).toBe(200);
    expect(obsidianConfig.status).toBe(200);
    expect(await agents.json()).toHaveLength(9);
    expect(await integrations.json()).toHaveLength(5);
    await runtime.openclaw.disconnect();
  }, 15000);

  it("updates notifications and publishes events", async () => {
    const runtime = await createBridgeRuntime();
    const app = createBridgeApp(runtime);
    const response = await app.request("/api/notifications/notif-codex-review/act", {
      method: "POST",
      body: JSON.stringify({ action: "request_changes" }),
      headers: { "Content-Type": "application/json" },
    });
    const notification = (await response.json()) as { status: string };
    expect(notification.status).toBe("changes_requested");
    expect(
      runtime.eventBus.recent(5).some((event) => event.type === "notification.changes_requested"),
    ).toBe(true);
    await runtime.openclaw.disconnect();
  });

  it("streams SSE events", async () => {
    const runtime = await createBridgeRuntime();
    const app = createBridgeApp(runtime);
    const response = await app.request("/api/events/stream");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    await runtime.openclaw.disconnect();
  });

  it("creates chat fallback capsule entries", async () => {
    const runtime = await createBridgeRuntime();
    const app = createBridgeApp(runtime);
    const before = runtime.capsuleStore.list().length;
    const response = await app.request("/api/chat/send", {
      method: "POST",
      body: JSON.stringify({
        conversationId: "conv-panel-command",
        content: "请记录一条中文 fallback 消息",
        channel: "panel",
      }),
      headers: { "Content-Type": "application/json" },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { capsule: { id: string } };
    expect(body.capsule.id).toContain("cap-task-chat");
    expect(runtime.capsuleStore.list().length).toBe(before + 1);
    await runtime.openclaw.disconnect();
  });

  it("rescans skills and dry-runs a builtin skill", async () => {
    const runtime = await createBridgeRuntime();
    const app = createBridgeApp(runtime);
    const scan = await app.request("/api/skills/rescan", { method: "POST" });
    expect(scan.status).toBe(200);
    const run = await app.request("/api/skills/builtin-echo/run", {
      method: "POST",
      body: JSON.stringify({ mode: "dry_run", input: { prompt: "测试 dry-run" } }),
      headers: { "Content-Type": "application/json" },
    });
    expect(run.status).toBe(201);
    const body = (await run.json()) as { run: { status: string }; capsule: { id: string } };
    expect(body.run.status).toBe("succeeded");
    expect(body.capsule.id).toContain("cap-task-skill");
    await runtime.openclaw.disconnect();
  });

  it("creates approval for S3 skill runs and resumes mock coding approvals", async () => {
    const runtime = await createBridgeRuntime();
    const app = createBridgeApp(runtime);
    const skillRun = await app.request("/api/skills/codex-controlled-run/run", {
      method: "POST",
      body: JSON.stringify({ mode: "execute", input: { prompt: "改代码" } }),
      headers: { "Content-Type": "application/json" },
    });
    const skillBody = (await skillRun.json()) as {
      approval: { id: string };
      run: { status: string };
    };
    expect(skillBody.run.status).toBe("waiting_approval");
    expect(skillBody.approval.id).toContain("approval-");

    const coding = await app.request("/api/coding-runs", {
      method: "POST",
      body: JSON.stringify({ prompt: "让 Codex 增加测试" }),
      headers: { "Content-Type": "application/json" },
    });
    const codingBody = (await coding.json()) as { approval: { id: string }; run: { id: string } };
    const approve = await app.request(`/api/approvals/${codingBody.approval.id}/approve`, {
      method: "POST",
    });
    expect(approve.status).toBe(200);
    expect(runtime.codingRunStore.get(codingBody.run.id)?.status).toBe("succeeded");
    const artifacts = await app.request(`/api/coding-runs/${codingBody.run.id}/artifacts`);
    expect(artifacts.status).toBe(200);
    const changedFiles = await app.request(`/api/coding-runs/${codingBody.run.id}/changed-files`);
    expect(changedFiles.status).toBe(200);
    await runtime.openclaw.disconnect();
  });

  it("checks policy and exposes runtime backup / cleanup APIs", async () => {
    const runtime = await createBridgeRuntime();
    const app = createBridgeApp(runtime);
    const policy = await app.request("/api/policy/check", {
      method: "POST",
      body: JSON.stringify({
        actor: { type: "user", id: "user" },
        action: { type: "obsidian.review.write", risk: "S2", approvalRequired: true },
        resource: { path: "08_Review_Queue/2026-04-23/test.md" },
      }),
      headers: { "Content-Type": "application/json" },
    });
    expect(policy.status).toBe(200);
    expect(((await policy.json()) as { allowed: boolean }).allowed).toBe(true);
    const backup = await app.request("/api/runtime/backup", { method: "POST" });
    const cleanupPreview = await app.request("/api/runtime/cleanup/preview", { method: "POST" });
    expect(backup.status).toBe(201);
    expect(cleanupPreview.status).toBe(200);
    await runtime.openclaw.disconnect();
  });

  it("dispatches chat commands, creates Hermes candidates, and creates Obsidian previews", async () => {
    const runtime = await createBridgeRuntime();
    const app = createBridgeApp(runtime);
    const dispatch = await app.request("/api/conductor/dispatch", {
      method: "POST",
      body: JSON.stringify({
        message: "/skill builtin-echo 测试任务",
        conversationId: "conv-panel-command",
      }),
      headers: { "Content-Type": "application/json" },
    });
    expect(dispatch.status).toBe(201);

    const capsuleId = runtime.capsuleStore.list()[0]?.id;
    const reflect = await app.request(`/api/hermes/reflect/${capsuleId}`, { method: "POST" });
    expect(reflect.status).toBe(200);
    expect(runtime.hermesCandidateStore.list().length).toBeGreaterThan(0);
    const candidateApproval = runtime.approvalStore
      .list()
      .find((approval) => approval.related.hermesCandidateId);
    expect(candidateApproval?.effect?.targetType).toBe("hermes_candidate");
    const candidateApprove = await app.request(`/api/approvals/${candidateApproval?.id}/approve`, {
      method: "POST",
    });
    expect(candidateApprove.status).toBe(200);
    expect(
      runtime.hermesCandidateStore.get(candidateApproval?.related.hermesCandidateId ?? "")?.status,
    ).toBe("applied");

    const preview = await app.request("/api/obsidian/review-notes/preview", {
      method: "POST",
      body: JSON.stringify({ title: "测试预览", content: "内容" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(preview.status).toBe(201);
    await runtime.openclaw.disconnect();
  });

  it("creates Review Queue approval and writes note after approval", async () => {
    const runtime = await createBridgeRuntime();
    const app = createBridgeApp(runtime);
    const response = await app.request("/api/obsidian/review-notes", {
      method: "POST",
      body: JSON.stringify({ title: "审批写入测试", content: "内容" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      note: { id: string; status: string };
      approval: { id: string };
    };
    expect(body.note.status).toBe("waiting_approval");
    const approve = await app.request(`/api/approvals/${body.approval.id}/approve`, {
      method: "POST",
    });
    expect(approve.status).toBe(200);
    expect(runtime.obsidianReviewStore.get(body.note.id)?.status).toBe("verified");
    await runtime.openclaw.disconnect();
  });

  it("runs safe skill eval and creates a promotion approval", async () => {
    const runtime = await createBridgeRuntime();
    const app = createBridgeApp(runtime);
    const evalResponse = await app.request("/api/skills/builtin-echo/evals/run", {
      method: "POST",
    });
    expect(evalResponse.status).toBe(201);
    const promotion = await app.request("/api/skills/builtin-echo/promotion-request", {
      method: "POST",
      body: JSON.stringify({ to: "experimental" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(promotion.status).toBe(201);
    const body = (await promotion.json()) as { approval: { effect: { targetType: string } } };
    expect(body.approval.effect.targetType).toBe("skill_promotion");
    await runtime.openclaw.disconnect();
  });
});
