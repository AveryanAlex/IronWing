import { execFileSync, spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

export const PNPM_COMMAND = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

export function spawnCommand(command, args, options = {}) {
  return spawn(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: options.stdio ?? "inherit",
    detached: options.detached ?? process.platform !== "win32",
  });
}

export function waitForExit(child, description = "process") {
  return new Promise((resolve, reject) => {
    child.once("error", (error) => reject(new Error(`${description} failed to start: ${error.message}`)));
    child.once("exit", (code, signal) => {
      resolve({ code: code ?? 1, signal });
    });
  });
}

export async function runCommand(command, args, options = {}) {
  const child = spawnCommand(command, args, options);
  const result = await waitForExit(child, `${command} ${args.join(" ")}`);

  if (result.code !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(" ")} exited with code ${result.code}`);
  }

  return result;
}

export function captureCommand(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    encoding: "utf8",
  }).trim();
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function terminateChild(child, { timeoutMs = 5_000 } = {}) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  const signalTarget = process.platform === "win32" ? child.pid : -child.pid;

  try {
    process.kill(signalTarget, "SIGTERM");
  } catch {
    return;
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessAlive(child.pid)) {
      return;
    }

    await delay(100);
  }

  try {
    process.kill(signalTarget, "SIGKILL");
  } catch {
    // Ignore cleanup failures.
  }
}

export function createCleanupRunner() {
  const steps = [];
  let runningCleanup;

  return {
    add(step) {
      steps.unshift(step);
    },
    async run() {
      if (!runningCleanup) {
        runningCleanup = (async () => {
          for (const step of steps) {
            try {
              await step();
            } catch (error) {
              console.error(error);
            }
          }
        })();
      }

      await runningCleanup;
    },
  };
}
