import { expect, test } from '@playwright/test'

const BASE = 'http://127.0.0.1:5174'

test('AppShell renders', async ({ page }) => {
  await page.goto(BASE)
  await expect(page.locator('[data-testid="topbar"]')).toBeVisible()
  await expect(page.locator('[data-testid="left-nav"]')).toBeVisible()
})

test('Dashboard has 6 metric cards', async ({ page }) => {
  await page.goto(BASE)
  const cards = page.locator('[data-testid="metric-card"]')
  await expect(cards).toHaveCount(6)
})

test('Memory page renders', async ({ page }) => {
  await page.goto(`${BASE}/memory`)
  await expect(page.locator('[data-testid="memory-sidebar"]')).toBeVisible()
  await expect(page.locator('[data-testid="memory-list"]')).toBeVisible()
})

test('Knowledge page renders', async ({ page }) => {
  await page.goto(`${BASE}/knowledge`)
  await expect(page.locator('[data-testid="vault-tree"]')).toBeVisible()
})

test('Notifications page renders', async ({ page }) => {
  await page.goto(`${BASE}/notifications`)
  await expect(page.locator('[data-testid="notification-list"]')).toBeVisible()
})

test('Skills page renders', async ({ page }) => {
  await page.goto(`${BASE}/skills`)
  await expect(page.locator('[data-testid="skill-list"]')).toBeVisible()
})

test('Chat page renders', async ({ page }) => {
  await page.goto(`${BASE}/chat`)
  await expect(page.locator('[data-testid="conversation-list"]')).toBeVisible()
})

test('No console errors on any page', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  for (const path of ['/', '/memory', '/knowledge', '/notifications', '/skills', '/chat', '/settings']) {
    await page.goto(`${BASE}${path}`)
    await page.waitForLoadState('networkidle')
  }
  expect(errors).toHaveLength(0)
})
