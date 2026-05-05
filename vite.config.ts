import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "url";
import svelteConfig from "./svelte.config";

const platformDir = process.env.IRONWING_PLATFORM === "mock"
  ? "mock"
  : process.env.IRONWING_PLATFORM === "remote"
    ? "remote"
    : "tauri";

const serverHost = process.env.TAURI_ENV_PLATFORM === "android"
  ? "0.0.0.0"
  : process.env.IRONWING_PLATFORM === "remote"
    ? (process.env.IRONWING_REMOTE_UI_VITE_HOST ?? "127.0.0.1")
    : "localhost";

export default defineConfig({
  plugins: [svelte(svelteConfig), tailwindcss()],
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
    host: serverHost,
  },
});
