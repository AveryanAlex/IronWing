import { rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const generatedDir = path.join(rootDir, "src/platform/web/generated");

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      env,
      stdio: "inherit",
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
    });
    child.on("error", reject);
  });
}

async function removeTransientGeneratedFiles() {
  await Promise.all([
    rm(path.join(generatedDir, "ironwing_wasm.js"), { force: true }),
    rm(path.join(generatedDir, "ironwing_wasm_bg.wasm"), { force: true }),
    rm(path.join(generatedDir, "ironwing_wasm_bg.wasm.d.ts"), { force: true }),
    rm(path.join(generatedDir, ".gitignore"), { force: true }),
  ]);
}

await removeTransientGeneratedFiles();
await run("pnpm", ["run", "wasm:web:build"]);

const buildEnv = {
  ...process.env,
  IRONWING_PLATFORM: "web",
  IRONWING_OUT_DIR: process.env.IRONWING_OUT_DIR ?? "dist",
  IRONWING_BASE: process.env.IRONWING_BASE ?? "./",
};

await run("pnpm", ["exec", "tsc", "--noEmit"], buildEnv);
await run("pnpm", ["exec", "vite", "build"], buildEnv);

if (process.env.IRONWING_KEEP_WASM_GENERATED !== "1") {
  await removeTransientGeneratedFiles();
}
