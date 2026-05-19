import { sitlWebSocketEnv, webFrontendEnv } from "./workflow/env.mjs";
import { runViteDev } from "./workflow/frontend.mjs";
import { forwardedArgs, projectRoot } from "./workflow/paths.mjs";
import { PNPM_COMMAND, runCommand } from "./workflow/process.mjs";
import { startSitlSession } from "./workflow/sitl-session.mjs";
import {
  DEFAULT_SITL_TCP_HOST,
  DEFAULT_SITL_WS_HOST,
  DEFAULT_SITL_WS_PORT,
  parsePort,
  startSitlWebSocketBridgeSession,
} from "./workflow/sitl-ws.mjs";

await runCommand(PNPM_COMMAND, ["run", "internal:wasm:web:debug"], {
  cwd: projectRoot,
});

const { cleanup, exitWithCleanup, runtime } = await startSitlSession({
  cwd: projectRoot,
  logPrefix: "dev:web",
});
const wsHost = process.env.IRONWING_WEB_SITL_WS_HOST ?? DEFAULT_SITL_WS_HOST;
const wsPort = parsePort(
  process.env.IRONWING_WEB_SITL_WS_PORT ?? String(DEFAULT_SITL_WS_PORT + runtime.instanceId),
  "IRONWING_WEB_SITL_WS_PORT",
);
const bridgeSession = await startSitlWebSocketBridgeSession({
  cleanup,
  exitWithCleanup,
  config: {
    tcpHost: DEFAULT_SITL_TCP_HOST,
    tcpPort: runtime.sitlTcpPort,
    wsHost,
    wsPort,
  },
});

console.log(`[dev:web] WebSocket bridge listening on ${bridgeSession.listenWsUrl} -> ${bridgeSession.tcpUrl}.`);
console.log("[dev:web] The app will preselect WebSocket mode with the matching bridge URL.");

const viteResult = await runViteDev(cleanup, {
  cwd: projectRoot,
  env: webFrontendEnv(sitlWebSocketEnv(bridgeSession.browserWsUrl)),
  args: forwardedArgs(),
});
await exitWithCleanup(viteResult.code);
