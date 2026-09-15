import { configDefaults, defineConfig } from 'vitest/config'

// Kept separate from vite.config.ts: merging test config in there pulls @vitejs/plugin-react's
// Plugin type (resolved against this package's own nested vite) against vitest/config's
// defineConfig (resolved against the root's hoisted, older vite) — two different vite
// installs in this monorepo, so tsc sees two incompatible Plugin types for one array. Splitting
// the files means this config never imports the react plugin, so the mismatch never occurs.
export default defineConfig({
  test: {
    // Pure lib tests stay fast in Node. Component suites opt into jsdom with a
    // per-file @vitest-environment directive, so DOM setup is paid only where needed.
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
