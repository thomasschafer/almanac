import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { DEV_API_PORT } from "./scripts/dev.ts";

export default defineConfig({
  build: { outDir: "dist/client", emptyOutDir: true },
  server: {
    proxy: { "/api": `http://127.0.0.1:${process.env["ALMANAC_PORT"] ?? String(DEV_API_PORT)}` },
  },
  plugins: [
    react(),
    VitePWA({
      // Tools save their state as it changes, so updating straight away never loses anything.
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Almanac",
        short_name: "Almanac",
        description: "A collection of small, useful tools",
        start_url: "/",
        display: "standalone",
        // Manifests can't vary by colour scheme, so these match the dark theme.
        background_color: "#0c0c0c",
        theme_color: "#0c0c0c",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        // API responses must never come from the service worker's cache: tools keep their own
        // offline copy of their state, and know when it's unsaved.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [],
      },
    }),
  ],
});
