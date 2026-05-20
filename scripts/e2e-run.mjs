#!/usr/bin/env node
// Finds a free port, then runs Playwright with E2E_PORT set so the config
// file sees the same port in both the main process and every worker.

import { spawn } from "node:child_process";
import { PNPM_COMMAND } from "./workflow/process.mjs";
import { reserveFreeTcpPort } from "./workflow/ports.mjs";

const host = "127.0.0.1";

const playwrightArgs = process.argv.slice(2);
const port = await reserveFreeTcpPort(host);
const args = ["exec", "playwright", "test", ...playwrightArgs];
const child = spawn(PNPM_COMMAND, args, {
  stdio: "inherit",
  env: {
    ...process.env,
    E2E_PORT: String(port),
  },
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
child.on("exit", (code) => {
  process.exit(code ?? 1);
});
