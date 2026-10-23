import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { DEV_API_PORT } from "./scripts/dev.ts";

export default defineConfig({
  build: { outDir: "dist/client", emptyOutDir: true },
  server: {
    proxy: { "/api": `http://127.0.0.1:${process.env["ALMANAC_PORT"] ?? String(DEV_API_PORT)}` },
  },
  plugins: [react()],
});
