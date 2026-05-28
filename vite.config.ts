import { spawn } from "node:child_process";
import { defineConfig, type Plugin } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "url";

type PlatformDir = "mock" | "remote" | "tauri" | "web";
type WasmBuildScript = "internal:wasm:web:debug" | "internal:wasm:web:release";
type IronwingWebWasmState = {
  scriptPromises: Partial<Record<WasmBuildScript, Promise<void>>>;
};

const SUPPORTED_PLATFORMS: readonly PlatformDir[] = ["mock", "remote", "tauri", "web"];
const PNPM_COMMAND = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const IRONWING_WEB_WASM_STATE_KEY = Symbol.for("dev.averylex.ironwing.webWasmBuildState");

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

function ironwingWebWasmState(): IronwingWebWasmState {
  const globals = globalThis as typeof globalThis & {
    [IRONWING_WEB_WASM_STATE_KEY]?: IronwingWebWasmState;
  };

  globals[IRONWING_WEB_WASM_STATE_KEY] ??= {
    scriptPromises: {},
  };

  return globals[IRONWING_WEB_WASM_STATE_KEY];
}

function runWebWasmScriptOnce(script: WasmBuildScript): Promise<void> {
  const state = ironwingWebWasmState();
  state.scriptPromises[script] ??= runPnpmScript(script);
  return state.scriptPromises[script];
}

function ironwingWebWasmPlugin(enabled: boolean): Plugin {
  let command: "build" | "serve" = "serve";

  return {
    name: "ironwing-web-wasm",
    configResolved(config) {
      command = config.command;
    },
    async buildStart() {
      if (!enabled) {
        return;
      }

      const script = command === "serve" ? "internal:wasm:web:debug" : "internal:wasm:web:release";
      await runWebWasmScriptOnce(script);
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
  plugins: [ironwingWebWasmPlugin(platformDir === "web"), tailwindcss(), sveltekit()],
  define: {
    __IRONWING_PRERENDER_STATIC_ROUTES__: JSON.stringify(platformDir === "web"),
  },
  resolve: {
    alias: {
      "@app": fileURLToPath(new URL("src/app", import.meta.url)),
      "@components": fileURLToPath(new URL("src/components", import.meta.url)),
      "@features": fileURLToPath(new URL("src/features", import.meta.url)),
      "@ui": fileURLToPath(new URL("src/components/ui", import.meta.url)),
      "@lib": fileURLToPath(new URL("src/lib", import.meta.url)),
      "@data": fileURLToPath(new URL("src/data", import.meta.url)),
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
  },
  server: {
    host: serverHost,
    watch: {
      ignored: ["**/.direnv/**", "**/.svelte-kit/**", "**/src/platform/web/generated/**"],
    },
  },
});
