import { emitWebEvent } from "./event";
import type { FirmwareInstallOptions, FirmwareInstallResult, FirmwareInstallSource } from "../../firmware";
import type { MessageRateInfo } from "../../telemetry";
import type { TransportDescriptor } from "../../transport";
import type { IronwingWasmRuntime } from "./generated/ironwing_wasm";

type IronwingWasmModule = typeof import("./generated/ironwing_wasm.js");

let initPromise: Promise<void> | null = null;
let runtime: IronwingWasmRuntime | null = null;
let wasmModule: IronwingWasmModule | null = null;

export async function ensureWasmModule(): Promise<IronwingWasmModule> {
  initPromise ??= (async () => {
    const [module, wasmAsset] = await Promise.all([
      import("./generated/ironwing_wasm.js"),
      import("./generated/ironwing_wasm_bg.wasm?url"),
    ]);
    await module.default({ module_or_path: wasmAsset.default });
    wasmModule = module;
  })();

  await initPromise;
  return wasmModule!;
}

export async function ensureWasmRuntime(): Promise<IronwingWasmRuntime> {
  await ensureWasmModule();
  runtime ??= new wasmModule!.IronwingWasmRuntime((event: string, payload: unknown) => emitWebEvent(event, payload));
  return runtime;
}

export async function wasmAvailableMessageRates(): Promise<MessageRateInfo[]> {
  const module = await ensureWasmModule();
  return module.availableMessageRates() as MessageRateInfo[];
}

export async function wasmWebTransportDescriptors(options: {
  websocketAvailable: boolean;
  webSerialAvailable: boolean;
  webBluetoothAvailable: boolean;
}): Promise<TransportDescriptor[]> {
  const module = await ensureWasmModule();
  return module.webTransportDescriptors(
    options.websocketAvailable,
    options.webSerialAvailable,
    options.webBluetoothAvailable,
  ) as TransportDescriptor[];
}

export async function wasmWebSerialFirmwareInstallUpdate(options: {
  portName: string;
  serialAdapter: unknown;
  source: FirmwareInstallSource;
  installOptions?: FirmwareInstallOptions | null;
  onProgress: (phase: string, written: number, total: number) => void;
  isCancelled: () => boolean;
}): Promise<FirmwareInstallResult> {
  const module = await ensureWasmModule();
  return module.webSerialFirmwareInstallUpdate(
    options.portName,
    options.serialAdapter,
    options.source,
    options.installOptions ?? null,
    options.onProgress,
    options.isCancelled,
  ) as Promise<FirmwareInstallResult>;
}
