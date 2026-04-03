import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath, URL } from "url";
import svelteConfig from "./svelte.config";

// Vitest 4 ships newer Vite plugin typings than the active Vite 5 app toolchain.
// Keep the cast local so targeted Svelte tests can use the real transform without
// dragging this config back into the shipped frontend typecheck surface.
const svelteVitestPlugin = svelte(svelteConfig) as never;

export default defineConfig({
  plugins: [svelteVitestPlugin],
  resolve: {
    alias: {
      "@platform/core": fileURLToPath(new URL("src/platform/tauri/core.ts", import.meta.url)),
      "@platform/event": fileURLToPath(new URL("src/platform/tauri/event.ts", import.meta.url)),
      "@platform/http": fileURLToPath(new URL("src/platform/tauri/http.ts", import.meta.url)),
    },
    conditions: ["browser"],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.mjs"],
    exclude: ["src-old/**/*"],
  },
});
