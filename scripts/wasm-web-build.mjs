import { runCommand } from "./workflow/process.mjs";
import { projectRoot } from "./workflow/paths.mjs";
import {
  removeTransientWasmWebFiles,
  removeWasmWebMetadataFiles,
  removeWasmWebRuntimeFiles,
  shouldKeepWasmGenerated,
} from "./workflow/wasm-web.mjs";

const cleanAfter =
  process.argv.includes("--clean-after") && !shouldKeepWasmGenerated();
const cleanupOnly = process.argv.includes("--cleanup-only");
// Keep in sync with [profile.wasm-release] in the workspace Cargo.toml.
const wasmReleaseProfileEnv = {
  CARGO_PROFILE_RELEASE_LTO: "fat",
  CARGO_PROFILE_RELEASE_INCREMENTAL: "false",
  CARGO_PROFILE_RELEASE_CODEGEN_UNITS: "1",
  CARGO_PROFILE_RELEASE_OPT_LEVEL: "z",
  // CARGO_PROFILE_RELEASE_STRIP: "symbols",
  CARGO_PROFILE_RELEASE_PANIC: "unwind",
};

if (cleanupOnly) {
  if (!shouldKeepWasmGenerated()) {
    await removeTransientWasmWebFiles();
  }
} else {
  await removeWasmWebMetadataFiles();

  await runCommand(
    "wasm-pack",
    [
      "build",
      "crates/ironwing-wasm",
      "--target",
      "web",
      "--out-dir",
      "../../src/platform/web/generated",
      "--out-name",
      "ironwing_wasm",
      "--no-pack",
      // Keep wasm-pack in release mode so it binds the release artifact and runs wasm-opt.
      // Cargo env overrides scope the fat-LTO release settings to web WASM builds only.
      "--release",
    ],
    { cwd: projectRoot, env: wasmReleaseProfileEnv },
  );

  await removeWasmWebMetadataFiles();

  if (cleanAfter) {
    await removeWasmWebRuntimeFiles();
  }
}
