import { sitlTcpEnv, tauriFrontendEnv } from "./workflow/env.mjs";
import { projectRoot } from "./workflow/paths.mjs";
import { startSitlSession } from "./workflow/sitl-session.mjs";
import { runTauriDesktopDev } from "./workflow/tauri.mjs";

const { cleanup, exitWithCleanup, runtime } = await startSitlSession({
  cwd: projectRoot,
  logPrefix: "dev:desktop",
});

console.log(`[dev:desktop] SITL ready. Launching Tauri dev with TCP ${runtime.tcpAddress}.`);
console.log("[dev:desktop] The app will preselect TCP mode with the matching address.");

const tauriResult = await runTauriDesktopDev(cleanup, {
  cwd: projectRoot,
  env: tauriFrontendEnv(sitlTcpEnv(runtime)),
});
await exitWithCleanup(tauriResult.code);
