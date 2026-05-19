import {
  createCleanupRunner,
  createExitWithCleanup,
  installProcessCleanupHandlers,
} from "./process.mjs";
import { resolveRequestedRuntime } from "./runtime.mjs";
import { startSitl, stopSitl } from "./sitl.mjs";
import { waitForTcp } from "./wait.mjs";

export async function createSitlSession({
  cwd,
  env = process.env,
  logPrefix = "sitl",
  runtime,
  waitHost = "127.0.0.1",
  waitTimeoutMs = 90_000,
} = {}) {
  const resolvedRuntime = runtime ?? (await resolveRequestedRuntime(env));
  const cleanup = createCleanupRunner();
  const exitWithCleanup = createExitWithCleanup(cleanup);

  let started = false;
  let startPromise;

  cleanup.add(async () => {
    if (!started) {
      return;
    }

    console.log(`[${logPrefix}] Stopping SITL container ${resolvedRuntime.sitlContainer}...`);
    await stopSitl(resolvedRuntime, { cwd });
  });
  installProcessCleanupHandlers(exitWithCleanup);

  return {
    cleanup,
    exitWithCleanup,
    runtime: resolvedRuntime,
    async start() {
      if (startPromise) {
        return startPromise;
      }

      startPromise = (async () => {
        started = true;
        console.log(
          `[${logPrefix}] Starting SITL instance ${resolvedRuntime.instanceId} on ${resolvedRuntime.tcpAddress}...`,
        );

        try {
          await startSitl(resolvedRuntime, { cwd });
          await waitForTcp(waitHost, resolvedRuntime.sitlTcpPort, waitTimeoutMs);
        } catch (error) {
          await cleanup.run();
          throw error;
        }
      })();

      return startPromise;
    },
  };
}

export async function startSitlSession(options) {
  const session = await createSitlSession(options);
  await session.start();
  return session;
}
