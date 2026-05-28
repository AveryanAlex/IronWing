import { runCommand } from "./workflow/process.mjs";
import { projectRoot } from "./workflow/paths.mjs";
import {
  removeTransientWasmWebFiles,
  removeWasmWebMetadataFiles,
  removeWasmWebRuntimeFiles,
  shouldKeepWasmGenerated,
} from "./workflow/wasm-web.mjs";

const isDev = process.argv.includes("--dev");
const cleanAfter = process.argv.includes("--clean-after") && !shouldKeepWasmGenerated();
const cleanupOnly = process.argv.includes("--cleanup-only");
const profileFlag = isDev ? "--dev" : "--release";

if (cleanupOnly) {
  if (!shouldKeepWasmGenerated()) {
    await removeTransientWasmWebFiles();
  }
} else {
  await removeWasmWebMetadataFiles();

  await runCommand("wasm-pack", [
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
  ], { cwd: projectRoot });

  await removeWasmWebMetadataFiles();

  if (cleanAfter) {
    await removeWasmWebRuntimeFiles();
  }
}
