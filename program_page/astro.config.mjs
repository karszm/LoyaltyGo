// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://karta.loyaltygo.pl',
  output: 'server',
  adapter: cloudflare(),
  devToolbar: { enabled: false },
});
