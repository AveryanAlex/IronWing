import { PNPM_COMMAND, runCommand, runManagedChild } from "./process.mjs";

export async function runFrontendBuild({ cwd, env } = {}) {
  return runCommand(PNPM_COMMAND, ["run", "build:frontend"], { cwd, env });
}

export async function runViteDev(cleanup, { cwd, env, args = [] } = {}) {
  return runManagedChild(cleanup, PNPM_COMMAND, ["exec", "vite", ...args], {
    cwd,
    description: "pnpm exec vite",
    env,
  });
}
