import { emitWebEvent } from "./event";
import type { IronwingWasmRuntime } from "./generated/ironwing_wasm";

type IronwingWasmModule = typeof import("./generated/ironwing_wasm.js");

let initPromise: Promise<void> | null = null;
let runtime: IronwingWasmRuntime | null = null;
let wasmModule: IronwingWasmModule | null = null;

export async function ensureWasmRuntime(): Promise<IronwingWasmRuntime> {
  initPromise ??= (async () => {
    const [module, wasmAsset] = await Promise.all([
      import("./generated/ironwing_wasm.js"),
      import("./generated/ironwing_wasm_bg.wasm?url"),
    ]);
    await module.default({ module_or_path: wasmAsset.default });
    wasmModule = module;
  })();

  await initPromise;
  runtime ??= new wasmModule!.IronwingWasmRuntime((event: string, payload: unknown) => emitWebEvent(event, payload));
  return runtime;
}
