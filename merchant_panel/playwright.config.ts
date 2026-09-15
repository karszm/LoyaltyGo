import { defineConfig, devices } from '@playwright/test'
import { execFileSync } from 'node:child_process'

const port = 4173
const baseURL = `http://127.0.0.1:${port}`
const realLocalSupabase = process.env.E2E_REAL_SUPABASE === '1'
const localStatus = realLocalSupabase
  ? JSON.parse(execFileSync('supabase', ['status', '-o', 'json'], {
      cwd: '../backend', encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    })) as Record<string, string>
  : {}

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port}`,
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      VITE_SUPABASE_URL: localStatus.API_URL ?? 'http://127.0.0.1:54321',
      VITE_SUPABASE_ANON_KEY: localStatus.PUBLISHABLE_KEY ?? localStatus.ANON_KEY ?? 'e2e-anon-key',
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
