#!/usr/bin/env node
// Finds a free port, then runs Playwright with E2E_PORT set so the config
// file sees the same port in both the main process and every worker.

import net from "node:net";
import { spawn } from "node:child_process";

const host = "127.0.0.1";
const srv = net.createServer();

srv.listen(0, host, () => {
  const { port } = srv.address();
  srv.close(() => {
    const args = ["exec", "playwright", "test", ...process.argv.slice(2)];
    const child = spawn("pnpm", args, {
      stdio: "inherit",
      env: { ...process.env, E2E_PORT: String(port) },
    });
    child.on("exit", (code) => process.exit(code ?? 1));
  });
});

srv.on("error", (err) => {
  console.error("Failed to find a free port:", err.message);
  process.exit(1);
});
