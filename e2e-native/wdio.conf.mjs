import { fileURLToPath } from "node:url";
import { spawnCommand, terminateChild } from "../scripts/workflow/process.mjs";
import { waitForHttpOk } from "../scripts/workflow/wait.mjs";

const WEBDRIVER_HOST = "127.0.0.1";
const WEBDRIVER_PORT = Number.parseInt(process.env.IRONWING_WDIO_PORT ?? "4444", 10);
const NATIVE_WEBDRIVER_PORT = Number.parseInt(process.env.IRONWING_WDIO_NATIVE_PORT ?? "4445", 10);
const TAURI_DRIVER_COMMAND = process.env.IRONWING_TAURI_DRIVER_PATH ?? "tauri-driver";

function requireApplicationPath() {
  const application = process.env.IRONWING_WDIO_APPLICATION;
  if (!application) {
    throw new Error("IRONWING_WDIO_APPLICATION must point to the built Tauri binary.");
  }

  return application;
}

let tauriDriverChild;

async function cleanupTauriDriver() {
  if (tauriDriverChild) {
    await terminateChild(tauriDriverChild);
    tauriDriverChild = undefined;
  }
}

function cleanupTauriDriverSync() {
  if (!tauriDriverChild?.pid || tauriDriverChild.exitCode !== null || tauriDriverChild.signalCode !== null) {
    return;
  }

  try {
    process.kill(-tauriDriverChild.pid, "SIGTERM");
  } catch {
    // Ignore cleanup failures during process exit.
  }
}

process.once("exit", cleanupTauriDriverSync);

export const config = {
  host: WEBDRIVER_HOST,
  port: WEBDRIVER_PORT,
  specs: [fileURLToPath(new URL("./smoke.spec.mjs", import.meta.url))],
  maxInstances: 1,
  reporters: ["spec"],
  framework: "mocha",
  waitforTimeout: 30_000,
  mochaOpts: {
    ui: "bdd",
    timeout: 120_000,
  },
  capabilities: [
    {
      maxInstances: 1,
      "tauri:options": {
        application: requireApplicationPath(),
      },
    },
  ],
  beforeSession: async () => {
    tauriDriverChild = spawnCommand(
      TAURI_DRIVER_COMMAND,
      ["--port", String(WEBDRIVER_PORT), "--native-port", String(NATIVE_WEBDRIVER_PORT)],
      {
      stdio: "inherit",
      },
    );

    try {
      await Promise.race([
        waitForHttpOk(`http://${WEBDRIVER_HOST}:${WEBDRIVER_PORT}/status`, {
          timeoutMs: 30_000,
          isStillRunning: () => Boolean(tauriDriverChild?.pid) && tauriDriverChild.exitCode == null,
        }),
        new Promise((_, reject) => {
          tauriDriverChild.once("error", reject);
          tauriDriverChild.once("exit", (code, signal) => {
            reject(
              new Error(
                `tauri-driver exited before becoming ready (code=${code ?? "null"}, signal=${signal ?? "null"}).`,
              ),
            );
          });
        }),
      ]);
    } catch (error) {
      await cleanupTauriDriver();
      throw error;
    }
  },
  afterSession: async () => {
    await cleanupTauriDriver();
  },
};
