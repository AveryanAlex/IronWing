import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "url";

export default defineConfig({
  resolve: {
    alias: {
      "@platform/core": fileURLToPath(new URL("src/platform/tauri/core.ts", import.meta.url)),
      "@platform/event": fileURLToPath(new URL("src/platform/tauri/event.ts", import.meta.url)),
      "@platform/http": fileURLToPath(new URL("src/platform/tauri/http.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.mjs"],
  },
});
