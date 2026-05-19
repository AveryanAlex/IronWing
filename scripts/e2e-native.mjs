import { access, readFile } from "node:fs/promises";
import path from "node:path";
import {
  PNPM_COMMAND,
  runManagedChild,
  runCommand,
} from "./workflow/process.mjs";
import {
  NATIVE_E2E_NATIVE_DRIVER_PORT,
  NATIVE_E2E_WEBDRIVER_PORT,
  nativeE2eApplicationPath,
  nativeE2eBuildEnv,
  resolveNativeE2eDriverPort,
} from "./workflow/native-e2e.mjs";
import { projectRoot } from "./workflow/paths.mjs";
import { createSitlSession } from "./workflow/sitl-session.mjs";

const sitlSession = await createSitlSession({
  cwd: projectRoot,
  logPrefix: "e2e:native",
});
const { cleanup, exitWithCleanup, runtime } = sitlSession;

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

await sitlSession.start();

console.log(`[e2e:native] SITL ready. Launching WebDriverIO against ${applicationPath}.`);
const wdioResult = await runManagedChild(cleanup, PNPM_COMMAND, ["exec", "wdio", "run", "e2e-native/wdio.conf.mjs"], {
  cwd: projectRoot,
  description: "pnpm exec wdio run e2e-native/wdio.conf.mjs",
  env: {
    ...buildEnv,
    IRONWING_WDIO_APPLICATION: applicationPath,
    IRONWING_WDIO_TCP_ADDRESS: runtime.tcpAddress,
    IRONWING_WDIO_PORT: String(webdriverPort),
    IRONWING_WDIO_NATIVE_PORT: String(nativeDriverPort),
  },
});
await exitWithCleanup(wdioResult.code);
