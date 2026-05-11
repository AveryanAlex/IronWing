import { spawn } from "node:child_process";

const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const env = {
  ...process.env,
  IRONWING_PLATFORM: "mock",
  VITE_IRONWING_MOCK_PROFILE: "demo",
};

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env,
    });

    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          signal
            ? `${command} ${args.join(" ")} terminated with signal ${signal}`
            : `${command} ${args.join(" ")} exited with code ${code}`,
        ),
      );
    });
  });
}

await run(pnpmCommand, ["exec", "tsc", "--noEmit"]);
await run(pnpmCommand, ["exec", "vite", "build"]);
