import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://loyaltygo.pl",
  output: "static",
  build: {
    inlineStylesheets: "auto",
  },
});
