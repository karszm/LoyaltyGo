import { defineConfig } from 'vitest/config'

// Kept separate from vite.config.ts: merging test config in there pulls @vitejs/plugin-react's
// Plugin type (resolved against this package's own nested vite) against vitest/config's
// defineConfig (resolved against the root's hoisted, older vite) — two different vite
// installs in this monorepo, so tsc sees two incompatible Plugin types for one array. Splitting
// the files means this config never imports the react plugin, so the mismatch never occurs.
export default defineConfig({
  test: {
    environment: 'node', // lib/ tests are pure functions; no DOM needed (no component tests).
  },
})
