import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  webServer: [
    {
      command: 'pnpm --dir ../bridge dev',
      port: 3001,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'pnpm dev',
      port: 5174,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
  use: {
    baseURL: 'http://127.0.0.1:5174',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
})
