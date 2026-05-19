import { demoFrontendEnv } from "./workflow/env.mjs";
import { runViteDev } from "./workflow/frontend.mjs";
import { forwardedArgs, projectRoot } from "./workflow/paths.mjs";
import {
  createCleanupRunner,
  createExitWithCleanup,
  installProcessCleanupHandlers,
} from "./workflow/process.mjs";

const cleanup = createCleanupRunner();
const exitWithCleanup = createExitWithCleanup(cleanup);
installProcessCleanupHandlers(exitWithCleanup);

const viteResult = await runViteDev(cleanup, {
  cwd: projectRoot,
  env: demoFrontendEnv(),
  args: forwardedArgs(),
});
await exitWithCleanup(viteResult.code);
