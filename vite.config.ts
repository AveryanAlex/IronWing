import { spawn } from "node:child_process";
import { defineConfig, type Plugin } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "url";

type PlatformDir = "mock" | "remote" | "tauri" | "web";

const SUPPORTED_PLATFORMS: readonly PlatformDir[] = ["mock", "remote", "tauri", "web"];
const DEFAULT_OUT_DIRS: Record<PlatformDir, string> = {
  mock: "dist/e2e",
  remote: "dist/tauri",
  tauri: "dist/tauri",
  web: "dist/web",
};
const PNPM_COMMAND = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const projectRoot = fileURLToPath(new URL(".", import.meta.url));

function isPlatformDir(value: string): value is PlatformDir {
  return SUPPORTED_PLATFORMS.includes(value as PlatformDir);
}

function isTauriCliEnv(env = process.env): boolean {
  return env.TAURI_ENV_PLATFORM != null || env.TAURI_ENV_TARGET_TRIPLE != null;
}

function resolvePlatformDir(env = process.env): PlatformDir {
  const platform = env.IRONWING_PLATFORM;

  if (platform != null) {
    if (isPlatformDir(platform)) {
      return platform;
    }

    throw new Error(`Unsupported IRONWING_PLATFORM "${platform}". Expected one of: ${SUPPORTED_PLATFORMS.join(", ")}`);
  }

  return isTauriCliEnv(env) ? "tauri" : "web";
}

function runPnpmScript(script: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(PNPM_COMMAND, ["run", script], {
      cwd: projectRoot,
      env: process.env,
      stdio: "inherit",
    });

    child.once("error", (error) =>
      reject(new Error(`${PNPM_COMMAND} run ${script} failed to start: ${error.message}`)),
    );
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      const reason = signal == null ? `code ${code ?? 1}` : `signal ${signal}`;
      reject(new Error(`${PNPM_COMMAND} run ${script} exited with ${reason}`));
    });
  });
}

function ironwingWebWasmPlugin(enabled: boolean): Plugin {
  let command: "build" | "serve" = "serve";
  let built = false;
  let cleaned = false;

  return {
    name: "ironwing-web-wasm",
    configResolved(config) {
      command = config.command;
    },
    async buildStart() {
      if (!enabled || built) {
        return;
      }

      built = true;
      await runPnpmScript(command === "serve" ? "internal:wasm:web:debug" : "internal:wasm:web:release");
    },
    async closeBundle() {
      if (!enabled || command !== "build" || cleaned || process.env.IRONWING_KEEP_WASM_GENERATED === "1") {
        return;
      }

      cleaned = true;
      await runPnpmScript("internal:wasm:web:cleanup");
    },
  };
}

const platformDir = resolvePlatformDir();

const serverHost =
  process.env.TAURI_ENV_PLATFORM === "android"
    ? "0.0.0.0"
    : platformDir === "remote"
      ? (process.env.IRONWING_REMOTE_UI_VITE_HOST ?? "127.0.0.1")
      : "localhost";

export default defineConfig({
  base: process.env.IRONWING_BASE ?? (platformDir === "web" ? "./" : undefined),
  plugins: [ironwingWebWasmPlugin(platformDir === "web"), svelte(), tailwindcss()],
  resolve: {
    alias: {
      "@platform/core": fileURLToPath(new URL(`src/platform/${platformDir}/core.ts`, import.meta.url)),
      "@platform/event": fileURLToPath(new URL(`src/platform/${platformDir}/event.ts`, import.meta.url)),
      "@platform/http": fileURLToPath(new URL(`src/platform/${platformDir}/http.ts`, import.meta.url)),
      "@platform/analytics": fileURLToPath(new URL(`src/platform/${platformDir}/analytics.ts`, import.meta.url)),
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "es2022",
    },
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 5120,
    outDir: process.env.IRONWING_OUT_DIR ?? DEFAULT_OUT_DIRS[platformDir],
  },
  server: {
    host: serverHost,
    watch: {
      ignored: ["**/.direnv/**"],
    },
  },
});
