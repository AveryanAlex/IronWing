import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "url";

const platformDir = process.env.IRONWING_PLATFORM === "mock" ? "mock" : "tauri";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@platform/core": fileURLToPath(new URL(`src/platform/${platformDir}/core.ts`, import.meta.url)),
      "@platform/event": fileURLToPath(new URL(`src/platform/${platformDir}/event.ts`, import.meta.url)),
      "@platform/http": fileURLToPath(new URL(`src/platform/${platformDir}/http.ts`, import.meta.url)),
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "es2022",
    },
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 3000,
  },
  server: {
    host: process.env.TAURI_ENV_PLATFORM === "android" ? "0.0.0.0" : "localhost",
  },
});
