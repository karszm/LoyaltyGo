import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execFileSync } from 'node:child_process'

function buildCommit(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_BUILD_COMMIT': JSON.stringify(buildCommit()),
  },
  server: {
    port: 3000,
    strictPort: true, // config.toml's auth.site_url is pinned to 127.0.0.1:3000; a silent
                       // port bump would break Supabase Auth redirects.
  },
})
