import { projectRoot } from "./workflow/paths.mjs";
import { resolveRequestedRuntime } from "./workflow/runtime.mjs";
import { createSitlSession } from "./workflow/sitl-session.mjs";
import {
  resolveSitlWsConfig,
  startSitlWebSocketBridgeSession,
} from "./workflow/sitl-ws.mjs";

const runtime = await resolveRequestedRuntime(process.env);
const config = resolveSitlWsConfig({ argv: process.argv.slice(2), env: process.env, runtime });
const sitlSession = await createSitlSession({
  cwd: projectRoot,
  logPrefix: "tool:sitl:ws",
  runtime: config.runtime,
  waitHost: config.tcpHost,
});
const { cleanup, exitWithCleanup } = sitlSession;

if (config.startSitl) {
  await sitlSession.start();
  console.log(`[tool:sitl:ws] SITL ready on tcp://${config.tcpHost}:${config.tcpPort}.`);
} else {
  console.log(`[tool:sitl:ws] Using existing SITL at tcp://${config.tcpHost}:${config.tcpPort}.`);
}

const bridgeSession = await startSitlWebSocketBridgeSession({ cleanup, config, exitWithCleanup });

console.log(`[tool:sitl:ws] WebSocket bridge listening on ${bridgeSession.listenWsUrl} -> ${bridgeSession.tcpUrl}`);
console.log(`[tool:sitl:ws] Connect the pure web app to ${bridgeSession.browserWsUrl}.`);
