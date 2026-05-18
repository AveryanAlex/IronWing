/* tslint:disable */
/* eslint-disable */

export class IronwingWasmRuntime {
    free(): void;
    [Symbol.dispose](): void;
    ackSessionSnapshot(session_id: string, seek_epoch: number, reset_revision: number): any;
    beginConnect(): WasmByteBridge;
    disconnectLink(): Promise<void>;
    constructor(event_sink: Function);
    openSessionSnapshot(source_kind: string): any;
    waitConnect(): Promise<void>;
}

export class WasmByteBridge {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    close(): void;
    isClosed(): boolean;
    nextOutbound(): Promise<any>;
    pushInbound(_bytes: Uint8Array): Promise<void>;
}

export function start(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_ironwingwasmruntime_free: (a: number, b: number) => void;
    readonly ironwingwasmruntime_ackSessionSnapshot: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly ironwingwasmruntime_beginConnect: (a: number) => [number, number, number];
    readonly ironwingwasmruntime_disconnectLink: (a: number) => any;
    readonly ironwingwasmruntime_new: (a: any) => number;
    readonly ironwingwasmruntime_openSessionSnapshot: (a: number, b: number, c: number) => [number, number, number];
    readonly ironwingwasmruntime_waitConnect: (a: number) => any;
    readonly __wbg_wasmbytebridge_free: (a: number, b: number) => void;
    readonly wasmbytebridge_close: (a: number) => void;
    readonly wasmbytebridge_isClosed: (a: number) => number;
    readonly wasmbytebridge_nextOutbound: (a: number) => any;
    readonly wasmbytebridge_pushInbound: (a: number, b: any) => any;
    readonly start: () => void;
    readonly wasm_bindgen__convert__closures_____invoke__h157532a21e05ac18: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen__convert__closures_____invoke__h831f6e81e7b0bf6f: (a: number, b: number, c: any, d: any) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_destroy_closure: (a: number, b: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
