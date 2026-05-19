import { remoteUiEnv } from "./workflow/env.mjs";
import { projectRoot } from "./workflow/paths.mjs";
import { createSitlSession } from "./workflow/sitl-session.mjs";
import { parsePort } from "./workflow/sitl-ws.mjs";
import { runTauriDesktopDev } from "./workflow/tauri.mjs";

const REMOTE_UI_DEFAULT_PORT = 14242;

const sitlSession = await createSitlSession({
  cwd: projectRoot,
  logPrefix: "dev:desktop:remote",
});
const { cleanup, exitWithCleanup, runtime } = sitlSession;

const remoteUiHost = process.env.IRONWING_REMOTE_UI_HOST ?? "127.0.0.1";
const remoteUiPort = parsePort(
  process.env.IRONWING_REMOTE_UI_PORT ?? String(REMOTE_UI_DEFAULT_PORT + runtime.instanceId),
  "IRONWING_REMOTE_UI_PORT",
);
const browserHost = remoteUiHost === "0.0.0.0" ? "127.0.0.1" : remoteUiHost;
const remoteUiBridgeUrl = `http://${browserHost}:${remoteUiPort}`;
const viteHost = process.env.IRONWING_REMOTE_UI_VITE_HOST ?? "127.0.0.1";
const viteBrowserHost = viteHost === "0.0.0.0" ? "127.0.0.1" : viteHost;
const browserUrl = `http://${viteBrowserHost}:5173`;

await sitlSession.start();

console.log(`[dev:desktop:remote] SITL ready. Starting Tauri remote UI bridge on ${remoteUiBridgeUrl}.`);
console.log(`[dev:desktop:remote] Open the agent/browser UI at ${browserUrl}.`);
console.log("[dev:desktop:remote] The app will auto-connect to the matching SITL TCP address.");

const tauriResult = await runTauriDesktopDev(cleanup, {
  cwd: projectRoot,
  env: remoteUiEnv({ remoteUiHost, remoteUiPort, remoteUiBridgeUrl, runtime, viteHost }),
});
await exitWithCleanup(tauriResult.code);
