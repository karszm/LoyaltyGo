// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://karta.loyaltygo.pl',
  output: 'server',
  adapter: cloudflare(),
  devToolbar: { enabled: false },
  // Default assetsInlineLimit (4KB) inlines small script chunks straight into the rendered
  // HTML as `<script>...</script>` — CSP's `script-src 'self'` (middleware.ts) then silently
  // blocks that inline script in a real browser. Forcing every asset external is the fix, not
  // a CSP exception: it's a one-time global setting, not a per-page opt-out (task-8 review).
  vite: { build: { assetsInlineLimit: 0 } },
});
