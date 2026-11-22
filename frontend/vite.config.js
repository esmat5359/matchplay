import { defineConfig } from "vite";
import { resolve } from "node:path";

const pages = ["index", "rounds", "round", "create", "account", "ledger", "docs", "demo", "404"];

export default defineConfig({
  base: "./",
  build: {
    target: "es2020",
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: Object.fromEntries(pages.map((p) => [p, resolve(__dirname, `${p}.html`)])),
    },
  },
  server: { host: true },
  define: { global: "globalThis" },
});
