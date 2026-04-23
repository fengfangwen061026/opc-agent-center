import { expect, test } from "@playwright/test";

test("OPC cockpit smoke", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("网关健康")).toBeVisible();
  await expect(page.getByText("OPC 主控智能体").first()).toBeVisible();
  await page.getByRole("link", { name: /智能体/ }).click();
  await expect(page.getByRole("heading", { name: "智能体" })).toBeVisible();
  await page.getByRole("link", { name: /对话/ }).click();
  await expect(page.getByRole("heading", { name: "对话" })).toBeVisible();
  await page.getByRole("link", { name: /通知/ }).click();
  await expect(page.getByRole("heading", { name: "通知" })).toBeVisible();
  await page.getByRole("button", { name: "批准" }).first().click();
  await expect(page.getByRole("article").filter({ hasText: "已解决" }).first()).toBeVisible();

  await page.getByRole("link", { name: /对话/ }).click();
  await page.getByPlaceholder(/直接输入消息/).fill("请生成一条中文任务胶囊");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByText("关联 Capsule")).toBeVisible();

  await page.getByRole("link", { name: /设置/ }).click();
  await expect(page.getByText("Service Center", { exact: true })).toBeVisible();
  await expect(page.getByText("OpenClaw Gateway")).toBeVisible();

  await page.getByRole("link", { name: /知识库/ }).click();
  await expect(page.getByText("需要配置 Obsidian Local REST API token")).toBeVisible();

  await page.getByRole("link", { name: /技能/ }).click();
  await expect(page.locator('a[href="/skills/builtin-echo"]').first()).toBeVisible();
  await page
    .locator(".opc-action-card")
    .filter({ has: page.locator('a[href="/skills/builtin-echo"]') })
    .first()
    .getByRole("button", { name: "Dry-run" })
    .click();

  await page.getByRole("link", { name: /对话/ }).click();
  await page.getByPlaceholder(/直接输入消息/).fill("/skill builtin-echo E2E 任务");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByText("Conductor Dispatch")).toBeVisible();

  await page.getByRole("link", { name: /通知/ }).click();
  await page.getByRole("button", { name: /待审批/ }).click();
  await expect(page.getByText(/风险/).first()).toBeVisible();
  await page.getByRole("button", { name: /Hermes 候选/ }).click();
  await expect(page.getByRole("button", { name: /全部通知/ })).toBeVisible();
});
