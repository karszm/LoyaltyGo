import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://loyaltygo.pl",
  output: "static",
  // Kanonizację URL-i robi host (assets.html_handling = "drop-trailing-slash"
  // w wrangler.jsonc). Tu ustawiamy tylko kształt Astro.url, żeby rel=canonical
  // zgadzał się z tym, co Cloudflare faktycznie serwuje.
  // build.format zostaje domyślne ("directory") — "file" wymusiłoby .html
  // w Astro.url.pathname, a więc i w canonicalu.
  trailingSlash: "never",
  build: {
    inlineStylesheets: "auto",
  },
});
