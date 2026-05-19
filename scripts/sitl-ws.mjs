import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCleanupRunner } from "./workflow/process.mjs";
import { resolveRequestedRuntime } from "./workflow/runtime.mjs";
import { startSitl, stopSitl } from "./workflow/sitl.mjs";
import {
  createSitlWebSocketBridge,
  resolveSitlWsConfig,
  waitForBridgeListening,
} from "./workflow/sitl-ws.mjs";
import { waitForTcp } from "./workflow/wait.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const runtime = await resolveRequestedRuntime(process.env);
const config = resolveSitlWsConfig({ argv: process.argv.slice(2), env: process.env, runtime });
const cleanup = createCleanupRunner();

let bridge;
let exiting = false;

if (config.startSitl) {
  cleanup.add(async () => {
    console.log(`[sitl-ws] Stopping SITL container ${config.runtime.sitlContainer}...`);
    await stopSitl(config.runtime, { cwd: projectRoot });
  });
}

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

if (config.startSitl) {
  console.log(`[sitl-ws] Starting SITL instance ${config.runtime.instanceId} on ${config.runtime.tcpAddress}...`);
  await startSitl(config.runtime, { cwd: projectRoot });
  await waitForTcp(config.tcpHost, config.tcpPort, 90_000);
  console.log(`[sitl-ws] SITL ready on tcp://${config.tcpHost}:${config.tcpPort}.`);
} else {
  console.log(`[sitl-ws] Using existing SITL at tcp://${config.tcpHost}:${config.tcpPort}.`);
}

bridge = createSitlWebSocketBridge(config);
cleanup.add(async () => {
  await bridge?.close();
});
bridge.server.on("error", (error) => {
  console.error(error);
  void exitWithCleanup(1);
});
await waitForBridgeListening(bridge.server);

console.log(`[sitl-ws] WebSocket bridge listening on ws://${config.wsHost}:${config.wsPort} -> tcp://${config.tcpHost}:${config.tcpPort}`);
console.log(`[sitl-ws] Connect the pure web app to ws://${config.wsHost}:${config.wsPort}.`);
