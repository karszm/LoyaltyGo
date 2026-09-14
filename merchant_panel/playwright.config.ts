import { defineConfig, devices } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const port = 4173
const baseURL = `http://127.0.0.1:${port}`
const realLocalSupabase = process.env.E2E_REAL_SUPABASE === '1'

function resolveSupabaseConfig() {
  if (!realLocalSupabase) {
    return {
      url: process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321',
      key: process.env.VITE_SUPABASE_ANON_KEY ?? 'e2e-anon-key',
    }
  }

  try {
    const output = execFileSync('supabase', ['status', '-o', 'json'], {
      cwd: resolve(process.cwd(), '../backend'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const status = JSON.parse(output) as Record<string, string>
    const key = status.PUBLISHABLE_KEY ?? status.ANON_KEY
    if (!status.API_URL || !key) throw new Error('brak API_URL lub klucza publicznego')
    return { url: status.API_URL, key }
  } catch (error) {
    throw new Error(`Lokalny Supabase nie jest gotowy. Uruchom \`supabase start\` w backend/. ${String(error)}`)
  }
}

const supabaseConfig = resolveSupabaseConfig()

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
      VITE_SUPABASE_URL: supabaseConfig.url,
      VITE_SUPABASE_ANON_KEY: supabaseConfig.key,
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
})
