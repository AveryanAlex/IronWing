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

const REMOTE_UI_DEFAULT_PORT = 14242;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const runtime = await resolveRequestedRuntime(process.env);
const cleanup = createCleanupRunner();

const remoteUiHost = process.env.IRONWING_REMOTE_UI_HOST ?? "127.0.0.1";
const remoteUiPort = Number.parseInt(
  process.env.IRONWING_REMOTE_UI_PORT ?? String(REMOTE_UI_DEFAULT_PORT + runtime.instanceId),
  10,
);
const browserHost = remoteUiHost === "0.0.0.0" ? "127.0.0.1" : remoteUiHost;
const remoteUiBridgeUrl = `http://${browserHost}:${remoteUiPort}`;
const viteHost = process.env.IRONWING_REMOTE_UI_VITE_HOST ?? "127.0.0.1";
const viteBrowserHost = viteHost === "0.0.0.0" ? "127.0.0.1" : viteHost;
const browserUrl = `http://${viteBrowserHost}:5173`;

if (!Number.isInteger(remoteUiPort) || remoteUiPort <= 0 || remoteUiPort > 65535) {
  throw new Error(`Invalid IRONWING_REMOTE_UI_PORT: ${process.env.IRONWING_REMOTE_UI_PORT}`);
}

let tauriChild;
let exiting = false;

cleanup.add(async () => {
  await terminateChild(tauriChild);
});
cleanup.add(async () => {
  console.log(`[remote-ui] Stopping SITL container ${runtime.sitlContainer}...`);
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

console.log(`[remote-ui] Starting SITL instance ${runtime.instanceId} on ${runtime.tcpAddress}...`);
await startSitl(runtime, { cwd: projectRoot });
await waitForTcp("127.0.0.1", runtime.sitlTcpPort, 90_000);

console.log(`[remote-ui] SITL ready. Starting Tauri remote UI bridge on ${remoteUiBridgeUrl}.`);
console.log(`[remote-ui] Open the agent/browser UI at ${browserUrl}.`);
console.log("[remote-ui] The app will auto-connect to the matching SITL TCP address.");

tauriChild = spawnCommand(PNPM_COMMAND, ["run", "tauri:dev"], {
  cwd: projectRoot,
  env: {
    IRONWING_PLATFORM: "remote",
    IRONWING_REMOTE_UI: "1",
    IRONWING_REMOTE_UI_HOST: remoteUiHost,
    IRONWING_REMOTE_UI_PORT: String(remoteUiPort),
    IRONWING_REMOTE_UI_VITE_HOST: viteHost,
    VITE_IRONWING_REMOTE_UI_URL: remoteUiBridgeUrl,
    VITE_IRONWING_SITL_TCP_PORT: String(runtime.sitlTcpPort),
    VITE_IRONWING_SITL_MODE: "tcp",
    VITE_IRONWING_AUTO_CONNECT_SITL: "1",
  },
});

const tauriResult = await waitForExit(tauriChild, "pnpm run tauri:dev");
await exitWithCleanup(tauriResult.code);
