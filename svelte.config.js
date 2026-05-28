import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

const SUPPORTED_PLATFORMS = ["mock", "remote", "tauri", "web"];
const base = process.env.IRONWING_BASE;
const platformDir = resolvePlatformDir();
const DEFAULT_OUT_DIRS = {
  mock: "dist/e2e",
  remote: "dist/tauri",
  tauri: "dist/tauri",
  web: "dist/web",
};
const outDir = process.env.IRONWING_OUT_DIR ?? DEFAULT_OUT_DIRS[platformDir];

function isTauriCliEnv(env = process.env) {
  return env.TAURI_ENV_PLATFORM != null || env.TAURI_ENV_TARGET_TRIPLE != null;
}

function resolvePlatformDir(env = process.env) {
  const platform = env.IRONWING_PLATFORM;

  if (platform != null) {
    if (SUPPORTED_PLATFORMS.includes(platform)) {
      return platform;
    }

    throw new Error(`Unsupported IRONWING_PLATFORM "${platform}". Expected one of: ${SUPPORTED_PLATFORMS.join(", ")}`);
  }

  return isTauriCliEnv(env) ? "tauri" : "web";
}

function resolvePaths() {
  if (base == null || base === "./") {
    return {};
  }

  return {
    base,
  };
}

/** @type {import("@sveltejs/kit").Config} */
const svelteConfig = {
  preprocess: vitePreprocess(),
  compilerOptions: {
    experimental: {
      async: true,
    },
  },
  kit: {
    alias: {
      "@app": "src/app",
      "@components": "src/components",
      "@features": "src/features",
      "@ui": "src/components/ui",
      "@lib": "src/lib",
      "@data": "src/data",
      "@platform/core": `src/platform/${platformDir}/core.ts`,
      "@platform/event": `src/platform/${platformDir}/event.ts`,
      "@platform/http": `src/platform/${platformDir}/http.ts`,
      "@platform/analytics": `src/platform/${platformDir}/analytics.ts`,
    },
    adapter: adapter({
      pages: outDir,
      assets: outDir,
      fallback: platformDir === "web" ? undefined : "index.html",
    }),
    paths: resolvePaths(),
  },
};

export default svelteConfig;
