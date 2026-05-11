import { spawn } from "node:child_process";

const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const env = {
  ...process.env,
  IRONWING_PLATFORM: "mock",
  VITE_IRONWING_MOCK_PROFILE: "demo",
};

const viteArgs = process.argv.slice(2);

if (viteArgs[0] === "--") {
  viteArgs.shift();
}

const child = spawn(pnpmCommand, ["exec", "vite", ...viteArgs], {
  stdio: "inherit",
  env,
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

child.on("close", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
