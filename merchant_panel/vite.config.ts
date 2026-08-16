import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: true, // config.toml's auth.site_url is pinned to 127.0.0.1:3000; a silent
                       // port bump would break Supabase Auth redirects.
  },
})
