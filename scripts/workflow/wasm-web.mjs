import path from "node:path";
import { rm } from "node:fs/promises";
import { webGeneratedDir } from "./paths.mjs";

export const WASM_WEB_RUNTIME_FILES = ["ironwing_wasm.js", "ironwing_wasm_bg.wasm"];
export const WASM_WEB_METADATA_FILES = ["ironwing_wasm_bg.wasm.d.ts", ".gitignore"];

async function removeGeneratedFiles(files, generatedDir = webGeneratedDir) {
  await Promise.all(files.map((file) => rm(path.join(generatedDir, file), { force: true })));
}

export async function removeWasmWebRuntimeFiles(options = {}) {
  await removeGeneratedFiles(WASM_WEB_RUNTIME_FILES, options.generatedDir);
}

export async function removeWasmWebMetadataFiles(options = {}) {
  await removeGeneratedFiles(WASM_WEB_METADATA_FILES, options.generatedDir);
}

export async function removeTransientWasmWebFiles(options = {}) {
  await removeGeneratedFiles([...WASM_WEB_RUNTIME_FILES, ...WASM_WEB_METADATA_FILES], options.generatedDir);
}

export function shouldKeepWasmGenerated(env = process.env) {
  return env.IRONWING_KEEP_WASM_GENERATED === "1";
}
