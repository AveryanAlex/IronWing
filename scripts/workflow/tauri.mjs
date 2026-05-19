import { PNPM_COMMAND, runManagedChild } from "./process.mjs";

export function runTauriDesktopDev(cleanup, { cwd, env } = {}) {
  return runManagedChild(cleanup, PNPM_COMMAND, ["exec", "tauri", "dev"], {
    cwd,
    description: "pnpm exec tauri dev",
    env,
  });
}

export function runTauriAndroidDev(cleanup, { cwd, env } = {}) {
  return runManagedChild(cleanup, PNPM_COMMAND, ["exec", "tauri", "android", "dev"], {
    cwd,
    description: "pnpm exec tauri android dev",
    env,
  });
}
