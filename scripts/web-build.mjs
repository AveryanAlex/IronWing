import { webBuildEnv } from "./workflow/env.mjs";
import { runFrontendBuild } from "./workflow/frontend.mjs";
import { projectRoot } from "./workflow/paths.mjs";
import { PNPM_COMMAND, runCommand } from "./workflow/process.mjs";

await runCommand(PNPM_COMMAND, ["run", "internal:wasm:web:release"], { cwd: projectRoot });
await runFrontendBuild({ cwd: projectRoot, env: webBuildEnv() });
await runCommand(PNPM_COMMAND, ["run", "internal:wasm:web:cleanup"], { cwd: projectRoot });
