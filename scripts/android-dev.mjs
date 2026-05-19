import { androidSitlTcpEnv } from "./workflow/env.mjs";
import { projectRoot } from "./workflow/paths.mjs";
import { startSitlSession } from "./workflow/sitl-session.mjs";
import { runTauriAndroidDev } from "./workflow/tauri.mjs";

const androidSitlHost = process.env.IRONWING_ANDROID_SITL_HOST ?? "10.0.2.2";
const { cleanup, exitWithCleanup, runtime } = await startSitlSession({
  cwd: projectRoot,
  logPrefix: "dev:android",
});
const { env, tcpAddress: androidTcpAddress } = androidSitlTcpEnv(runtime, androidSitlHost);

console.log(`[dev:android] SITL ready. Launching Tauri Android dev with TCP ${androidTcpAddress}.`);
console.log("[dev:android] Override IRONWING_ANDROID_SITL_HOST for physical devices or custom networking.");

const tauriResult = await runTauriAndroidDev(cleanup, {
  cwd: projectRoot,
  env,
});
await exitWithCleanup(tauriResult.code);
