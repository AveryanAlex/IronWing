import { webBuildEnv } from "./workflow/env.mjs";
import { runFrontendBuild } from "./workflow/frontend.mjs";
import { projectRoot } from "./workflow/paths.mjs";

await runFrontendBuild({ cwd: projectRoot, env: webBuildEnv() });
