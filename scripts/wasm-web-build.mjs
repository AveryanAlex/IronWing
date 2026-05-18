import { rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const generatedDir = path.join(rootDir, "src/platform/web/generated");

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: "inherit",
      ...options,
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

async function cleanupGeneratedMetadata() {
  await Promise.all([
    rm(path.join(generatedDir, ".gitignore"), { force: true }),
    rm(path.join(generatedDir, "ironwing_wasm_bg.wasm.d.ts"), { force: true }),
  ]);
}

const isDev = process.argv.includes("--dev");
const profileFlag = isDev ? "--dev" : "--release";

await run("wasm-pack", [
  "build",
  "crates/ironwing-wasm",
  "--target",
  "web",
  "--out-dir",
  "../../src/platform/web/generated",
  "--out-name",
  "ironwing_wasm",
  "--no-pack",
  profileFlag,
]);

await cleanupGeneratedMetadata();
