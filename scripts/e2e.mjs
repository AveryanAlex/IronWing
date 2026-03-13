import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PNPM_COMMAND,
  captureCommand,
  createCleanupRunner,
  runCommand,
  spawnCommand,
  terminateChild,
  waitForExit,
} from "./workflow/process.mjs";
import { resolveRequestedRuntime, runtimeEnv } from "./workflow/runtime.mjs";
import { startSitl, stopSitl } from "./workflow/sitl.mjs";
import { waitForHttpOk, waitForTcp } from "./workflow/wait.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const srcTauriDir = path.join(projectRoot, "src-tauri");
const runtime = await resolveRequestedRuntime(process.env);
const cleanup = createCleanupRunner();
const profile = process.env.E2E_APP_PROFILE === "release" ? "release" : "debug";
const playwrightArgs = process.argv.slice(2);
const sharedEnv = runtimeEnv(runtime);

let appChild;
let playwrightChild;
let exiting = false;

cleanup.add(async () => {
  await terminateChild(playwrightChild);
});
cleanup.add(async () => {
  await terminateChild(appChild);
});
cleanup.add(async () => {
  console.log(`[e2e] Stopping SITL container ${runtime.sitlContainer}...`);
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

function resolveCargoTargetDirectory() {
  try {
    const metadata = JSON.parse(
      captureCommand("cargo", ["metadata", "--no-deps", "--format-version", "1"], {
        cwd: projectRoot,
      }),
    );
    return metadata.target_directory;
  } catch {
    return path.join(projectRoot, "target");
  }
}

function resolveAppBinary() {
  const binaryName = process.platform === "win32" ? "ironwing-app.exe" : "ironwing-app";
  return path.join(resolveCargoTargetDirectory(), profile, binaryName);
}

console.log("[e2e] Building frontend assets (remote-ui platform)...");
await runCommand(PNPM_COMMAND, ["run", "build"], {
  cwd: projectRoot,
  env: { IRONWING_E2E: "1" },
});

console.log("[e2e] Building Rust binary (features: custom-protocol,e2e-remote-ui)...");
const cargoArgs = [
  "build",
  "-p",
  "ironwing",
  "--features",
  "custom-protocol,e2e-remote-ui",
];
if (profile === "release") {
  cargoArgs.push("--release");
}
await runCommand("cargo", cargoArgs, { cwd: projectRoot });

const appBinary = resolveAppBinary();
if (!fs.existsSync(appBinary)) {
  throw new Error(`E2E app binary not found at ${appBinary}`);
}

console.log(`[e2e] Starting SITL instance ${runtime.instanceId} on ${runtime.tcpAddress}...`);
await startSitl(runtime, { cwd: projectRoot });
await waitForTcp("127.0.0.1", runtime.sitlTcpPort, 90_000);

console.log(`[e2e] Launching app on ${runtime.baseUrl}...`);
appChild = spawnCommand(appBinary, [], {
  cwd: srcTauriDir,
  env: {
    ...sharedEnv,
    IRONWING_E2E: "1",
    IRONWING_E2E_PORT: String(runtime.remoteUiPort),
  },
});

await waitForHttpOk(runtime.livenessUrl, {
  timeoutMs: 120_000,
  isStillRunning: () => appChild?.exitCode == null && appChild?.signalCode == null,
});

console.log("[e2e] Remote UI is live. Running Playwright...");
playwrightChild = spawnCommand(PNPM_COMMAND, ["exec", "playwright", "test", ...playwrightArgs], {
  cwd: projectRoot,
  env: sharedEnv,
});

const playwrightResult = await waitForExit(playwrightChild, "pnpm exec playwright test");
await exitWithCleanup(playwrightResult.code);
