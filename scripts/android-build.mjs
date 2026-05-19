import { tauriFrontendEnv } from "./workflow/env.mjs";
import { projectRoot } from "./workflow/paths.mjs";
import { PNPM_COMMAND, runCommand } from "./workflow/process.mjs";

await runCommand(PNPM_COMMAND, ["exec", "tauri", "android", "build", "--apk"], {
  cwd: projectRoot,
  env: tauriFrontendEnv(),
});
