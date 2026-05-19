#!/usr/bin/env node
// Finds a free port, then runs Playwright with E2E_PORT set so the config
// file sees the same port in both the main process and every worker.

import { spawn } from "node:child_process";
import { mockProfileEnv } from "./workflow/env.mjs";
import { PNPM_COMMAND } from "./workflow/process.mjs";
import { reserveFreeTcpPort } from "./workflow/ports.mjs";

const host = "127.0.0.1";

function parseArgs(argv) {
  const playwrightArgs = [];
  let mockProfile;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--mock-profile") {
      if (argv[index + 1] == null || argv[index + 1] === "") {
        throw new Error("--mock-profile requires a non-empty value");
      }

      mockProfile = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--mock-profile=")) {
      mockProfile = arg.slice("--mock-profile=".length);
      continue;
    }

    playwrightArgs.push(arg);
  }

  if (mockProfile === "") {
    throw new Error("--mock-profile requires a non-empty value");
  }

  return { mockProfile, playwrightArgs };
}

const { mockProfile, playwrightArgs } = parseArgs(process.argv.slice(2));
const port = await reserveFreeTcpPort(host);
const args = ["exec", "playwright", "test", ...playwrightArgs];
const child = spawn(PNPM_COMMAND, args, {
  stdio: "inherit",
  env: {
    ...process.env,
    E2E_PORT: String(port),
    ...mockProfileEnv(mockProfile),
  },
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
child.on("exit", (code) => {
  process.exit(code ?? 1);
});
