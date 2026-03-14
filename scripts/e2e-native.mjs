import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PNPM_COMMAND,
  createCleanupRunner,
  runCommand,
  spawnCommand,
  terminateChild,
  waitForExit,
} from "./workflow/process.mjs";
import {
  NATIVE_E2E_NATIVE_DRIVER_PORT,
  NATIVE_E2E_WEBDRIVER_PORT,
  nativeE2eApplicationPath,
  nativeE2eBuildEnv,
  resolveNativeE2eDriverPort,
} from "./workflow/native-e2e.mjs";
import { resolveRequestedRuntime } from "./workflow/runtime.mjs";
import { startSitl, stopSitl } from "./workflow/sitl.mjs";
import { waitForTcp } from "./workflow/wait.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const runtime = await resolveRequestedRuntime(process.env);
const cleanup = createCleanupRunner();

let wdioChild;
let exiting = false;

cleanup.add(async () => {
  console.log(`[e2e:native] Stopping SITL container ${runtime.sitlContainer}...`);
  await stopSitl(runtime, { cwd: projectRoot });
});
cleanup.add(async () => {
  if (wdioChild) {
    await terminateChild(wdioChild);
  }
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

async function readMainBinaryName() {
  const tauriConfigPath = path.join(projectRoot, "src-tauri", "tauri.conf.json");
  const rawConfig = await readFile(tauriConfigPath, "utf8");
  const tauriConfig = JSON.parse(rawConfig);
  const mainBinaryName = tauriConfig.mainBinaryName;

  if (typeof mainBinaryName !== "string" || mainBinaryName.trim() === "") {
    throw new Error(`Missing mainBinaryName in ${tauriConfigPath}`);
  }

  return mainBinaryName;
}

const buildEnv = nativeE2eBuildEnv(runtime);
const mainBinaryName = await readMainBinaryName();
const webdriverPort = await resolveNativeE2eDriverPort({
  defaultPort: NATIVE_E2E_WEBDRIVER_PORT + runtime.instanceId,
});
const nativeDriverPort = await resolveNativeE2eDriverPort({
  defaultPort: NATIVE_E2E_NATIVE_DRIVER_PORT + runtime.instanceId,
});

console.log(`[e2e:native] Building debug Tauri app for ${runtime.tcpAddress}...`);
await runCommand(PNPM_COMMAND, ["exec", "tauri", "build", "--debug", "--no-bundle"], {
  cwd: projectRoot,
  env: buildEnv,
});

const applicationPath = nativeE2eApplicationPath(projectRoot, mainBinaryName, {
  cargoTargetDir: process.env.CARGO_TARGET_DIR,
});
await access(applicationPath);

console.log(`[e2e:native] Starting SITL instance ${runtime.instanceId} on ${runtime.tcpAddress}...`);
await startSitl(runtime, { cwd: projectRoot });
await waitForTcp("127.0.0.1", runtime.sitlTcpPort, 90_000);

console.log(`[e2e:native] SITL ready. Launching WebDriverIO against ${applicationPath}.`);
wdioChild = spawnCommand(PNPM_COMMAND, ["exec", "wdio", "run", "e2e-native/wdio.conf.mjs"], {
  cwd: projectRoot,
  env: {
    ...buildEnv,
    IRONWING_WDIO_APPLICATION: applicationPath,
    IRONWING_WDIO_TCP_ADDRESS: runtime.tcpAddress,
    IRONWING_WDIO_PORT: String(webdriverPort),
    IRONWING_WDIO_NATIVE_PORT: String(nativeDriverPort),
  },
});

const wdioResult = await waitForExit(wdioChild, "pnpm exec wdio run e2e-native/wdio.conf.mjs");
await exitWithCleanup(wdioResult.code);
