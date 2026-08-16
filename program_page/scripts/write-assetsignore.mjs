// Cloudflare's asset uploader refuses to publish a directory that contains `_worker.js`,
// and it is right to: that is the server bundle, and uploading it would serve our
// server-side code as a public static file. The Astro Cloudflare adapter does NOT emit the
// `.assetsignore` that suppresses this, so the deploy fails with:
//
//   ✘ [ERROR] Uploading a Pages _worker.js directory as an asset.
//
// `_routes.json` is likewise configuration for the platform, not an asset to serve.
import { writeFileSync } from 'node:fs'
writeFileSync(new URL('../dist/.assetsignore', import.meta.url), '_worker.js\n_routes.json\n')
console.log('[build] wrote dist/.assetsignore')
