import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PNPM_COMMAND,
  createCleanupRunner,
  spawnCommand,
  terminateChild,
  waitForExit,
} from "./workflow/process.mjs";
import { resolveRequestedRuntime } from "./workflow/runtime.mjs";
import { startSitl, stopSitl } from "./workflow/sitl.mjs";
import { waitForTcp } from "./workflow/wait.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const runtime = await resolveRequestedRuntime(process.env);
const cleanup = createCleanupRunner();

let tauriChild;
let exiting = false;

cleanup.add(async () => {
  await terminateChild(tauriChild);
});
cleanup.add(async () => {
  console.log(`[dev] Stopping SITL container ${runtime.sitlContainer}...`);
  await stopSitl(runtime, { cwd: projectRoot });
});

async function exitWithCleanup(exitCode) {
  if (exiting) {
    return;
  }

  exiting = true;
  await cleanup.run();
  process.exit(exitCode);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    void exitWithCleanup(signal === "SIGINT" ? 130 : 143);
  });
}

process.on("uncaughtException", (error) => {
  console.error(error);
  void exitWithCleanup(1);
});

process.on("unhandledRejection", (error) => {
  console.error(error);
  void exitWithCleanup(1);
});

console.log(`[dev] Starting SITL instance ${runtime.instanceId} on ${runtime.tcpAddress}...`);
await startSitl(runtime, { cwd: projectRoot });
await waitForTcp("127.0.0.1", runtime.sitlTcpPort, 90_000);

console.log(`[dev] SITL ready. Launching Tauri dev with TCP ${runtime.tcpAddress}.`);
console.log("[dev] The app will preselect TCP mode with the matching address.");

tauriChild = spawnCommand(PNPM_COMMAND, ["run", "tauri:dev"], {
  cwd: projectRoot,
  env: {
    VITE_IRONWING_SITL_TCP_PORT: String(runtime.sitlTcpPort),
    VITE_IRONWING_SITL_MODE: "tcp",
  },
});

const tauriResult = await waitForExit(tauriChild, "pnpm run tauri:dev");
await exitWithCleanup(tauriResult.code);
