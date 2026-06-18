/* tslint:disable */
/* eslint-disable */

export class IronwingWasmRuntime {
    free(): void;
    [Symbol.dispose](): void;
    ackSessionSnapshot(session_id: string, seek_epoch: number, reset_revision: number): any;
    armVehicle(force: boolean): Promise<void>;
    beginConnect(): WasmByteBridge;
    calibrateAccel(): Promise<void>;
    calibrateCompassAccept(_compass_mask: number): Promise<void>;
    calibrateCompassCancel(_compass_mask: number): Promise<void>;
    calibrateCompassStart(compass_mask: number): Promise<void>;
    calibrateGyro(): Promise<void>;
    connectDemo(vehicle_preset: string): Promise<void>;
    disarmVehicle(force: boolean): Promise<void>;
    disconnectLink(): Promise<void>;
    fenceClear(): Promise<void>;
    fenceDownload(): Promise<any>;
    fenceUpload(plan: any): Promise<void>;
    getAvailableModes(): any;
    missionCancel(): void;
    missionClear(): Promise<void>;
    missionDownload(): Promise<any>;
    missionSetCurrent(seq: number): Promise<void>;
    missionUpload(plan: any): Promise<void>;
    missionValidate(plan: any): any;
    motorTest(motor_instance: number, throttle_pct: number, duration_s: number): Promise<void>;
    constructor(event_sink: Function);
    openSessionSnapshot(source_kind: string): any;
    paramCancel(): void;
    paramDownloadAll(): void;
    paramFormatFile(store: any): string;
    paramParseFile(contents: string): any;
    paramWrite(name: string, value: number): Promise<any>;
    paramWriteBatch(params: any): Promise<any>;
    rallyClear(): Promise<void>;
    rallyDownload(): Promise<any>;
    rallyUpload(plan: any): Promise<void>;
    rcOverride(channels: any): Promise<void>;
    rebootToBootloader(): Promise<void>;
    rebootVehicle(): Promise<void>;
    requestPrearmChecks(): Promise<void>;
    setFlightMode(custom_mode: number): Promise<void>;
    setMessageRate(message_id: number, rate_hz: number): Promise<void>;
    setServo(instance: number, pwm_us: number): Promise<void>;
    setTelemetryRate(rate_hz: number): void;
    startGuidedSession(request: any): Promise<any>;
    stopGuidedSession(): any;
    updateGuidedSession(request: any): Promise<any>;
    vehicleTakeoff(altitude_m: number): Promise<void>;
    waitConnect(): Promise<void>;
}

export class WasmByteBridge {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    close(): void;
    isClosed(): boolean;
    nextOutbound(): Promise<any>;
    pushInbound(bytes: Uint8Array): Promise<void>;
}

export function availableMessageRates(): any;

export function logChartSeriesQuery(path: string, format: string, bytes: Uint8Array, request: any): any;

export function logExportCsvBytes(path: string, format: string, bytes: Uint8Array, request: any): any;

export function logFlightPath(path: string, format: string, bytes: Uint8Array, start_usec?: bigint | null, end_usec?: bigint | null, max_points?: number | null): any;

export function logFlightSummary(path: string, format: string, bytes: Uint8Array): any;

export function logParseSummary(path: string, format: string, bytes: Uint8Array): any;

export function logQueryMessages(path: string, format: string, bytes: Uint8Array, msg_type: string, start_usec?: bigint | null, end_usec?: bigint | null, max_points?: number | null): any;

export function logRawMessagesQuery(path: string, format: string, bytes: Uint8Array, request: any): any;

export function logTelemetryAt(path: string, format: string, bytes: Uint8Array, cursor_usec?: bigint | null): any;

export function logTelemetryTrack(path: string, format: string, bytes: Uint8Array, max_points?: number | null): any;

export function start(): void;

export function webSerialDetectBootloaderBoard(port_name: string, serial_adapter: any, is_cancelled: Function): Promise<any>;

export function webSerialFirmwareInstallUpdate(port_name: string, serial_adapter: any, source: any, options: any, progress_sink: Function, is_cancelled: Function): Promise<any>;

export function webTransportDescriptors(websocket_available: boolean, web_serial_available: boolean, web_bluetooth_available: boolean): any;

export function webUsbBootloaderInstallation(usb_device: any, device_info: any, source: any, progress_sink: Function, is_cancelled: Function): Promise<any>;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_ironwingwasmruntime_free: (a: number, b: number) => void;
    readonly __wbg_wasmbytebridge_free: (a: number, b: number) => void;
    readonly availableMessageRates: () => [number, number, number];
    readonly ironwingwasmruntime_ackSessionSnapshot: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly ironwingwasmruntime_armVehicle: (a: number, b: number) => any;
    readonly ironwingwasmruntime_beginConnect: (a: number) => [number, number, number];
    readonly ironwingwasmruntime_calibrateAccel: (a: number) => any;
    readonly ironwingwasmruntime_calibrateCompassAccept: (a: number, b: number) => any;
    readonly ironwingwasmruntime_calibrateCompassCancel: (a: number, b: number) => any;
    readonly ironwingwasmruntime_calibrateCompassStart: (a: number, b: number) => any;
    readonly ironwingwasmruntime_calibrateGyro: (a: number) => any;
    readonly ironwingwasmruntime_connectDemo: (a: number, b: number, c: number) => any;
    readonly ironwingwasmruntime_disarmVehicle: (a: number, b: number) => any;
    readonly ironwingwasmruntime_disconnectLink: (a: number) => any;
    readonly ironwingwasmruntime_fenceClear: (a: number) => any;
    readonly ironwingwasmruntime_fenceDownload: (a: number) => any;
    readonly ironwingwasmruntime_fenceUpload: (a: number, b: any) => any;
    readonly ironwingwasmruntime_getAvailableModes: (a: number) => [number, number, number];
    readonly ironwingwasmruntime_missionCancel: (a: number) => [number, number];
    readonly ironwingwasmruntime_missionClear: (a: number) => any;
    readonly ironwingwasmruntime_missionDownload: (a: number) => any;
    readonly ironwingwasmruntime_missionSetCurrent: (a: number, b: number) => any;
    readonly ironwingwasmruntime_missionUpload: (a: number, b: any) => any;
    readonly ironwingwasmruntime_missionValidate: (a: number, b: any) => [number, number, number];
    readonly ironwingwasmruntime_motorTest: (a: number, b: number, c: number, d: number) => any;
    readonly ironwingwasmruntime_new: (a: any) => number;
    readonly ironwingwasmruntime_openSessionSnapshot: (a: number, b: number, c: number) => [number, number, number];
    readonly ironwingwasmruntime_paramCancel: (a: number) => [number, number];
    readonly ironwingwasmruntime_paramDownloadAll: (a: number) => [number, number];
    readonly ironwingwasmruntime_paramFormatFile: (a: number, b: any) => [number, number, number, number];
    readonly ironwingwasmruntime_paramParseFile: (a: number, b: number, c: number) => [number, number, number];
    readonly ironwingwasmruntime_paramWrite: (a: number, b: number, c: number, d: number) => any;
    readonly ironwingwasmruntime_paramWriteBatch: (a: number, b: any) => any;
    readonly ironwingwasmruntime_rallyClear: (a: number) => any;
    readonly ironwingwasmruntime_rallyDownload: (a: number) => any;
    readonly ironwingwasmruntime_rallyUpload: (a: number, b: any) => any;
    readonly ironwingwasmruntime_rcOverride: (a: number, b: any) => any;
    readonly ironwingwasmruntime_rebootToBootloader: (a: number) => any;
    readonly ironwingwasmruntime_rebootVehicle: (a: number) => any;
    readonly ironwingwasmruntime_requestPrearmChecks: (a: number) => any;
    readonly ironwingwasmruntime_setFlightMode: (a: number, b: number) => any;
    readonly ironwingwasmruntime_setMessageRate: (a: number, b: number, c: number) => any;
    readonly ironwingwasmruntime_setServo: (a: number, b: number, c: number) => any;
    readonly ironwingwasmruntime_setTelemetryRate: (a: number, b: number) => [number, number];
    readonly ironwingwasmruntime_startGuidedSession: (a: number, b: any) => any;
    readonly ironwingwasmruntime_stopGuidedSession: (a: number) => [number, number, number];
    readonly ironwingwasmruntime_updateGuidedSession: (a: number, b: any) => any;
    readonly ironwingwasmruntime_vehicleTakeoff: (a: number, b: number) => any;
    readonly ironwingwasmruntime_waitConnect: (a: number) => any;
    readonly logChartSeriesQuery: (a: number, b: number, c: number, d: number, e: number, f: number, g: any) => [number, number, number];
    readonly logExportCsvBytes: (a: number, b: number, c: number, d: number, e: number, f: number, g: any) => [number, number, number];
    readonly logFlightPath: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: bigint, i: number, j: bigint, k: number) => [number, number, number];
    readonly logFlightSummary: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly logParseSummary: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly logQueryMessages: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: bigint, k: number, l: bigint, m: number) => [number, number, number];
    readonly logRawMessagesQuery: (a: number, b: number, c: number, d: number, e: number, f: number, g: any) => [number, number, number];
    readonly logTelemetryAt: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: bigint) => [number, number, number];
    readonly logTelemetryTrack: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number];
    readonly start: () => void;
    readonly wasmbytebridge_close: (a: number) => void;
    readonly wasmbytebridge_isClosed: (a: number) => number;
    readonly wasmbytebridge_nextOutbound: (a: number) => any;
    readonly wasmbytebridge_pushInbound: (a: number, b: any) => any;
    readonly webSerialDetectBootloaderBoard: (a: number, b: number, c: any, d: any) => any;
    readonly webSerialFirmwareInstallUpdate: (a: number, b: number, c: any, d: any, e: any, f: any, g: any) => any;
    readonly webTransportDescriptors: (a: number, b: number, c: number) => [number, number, number];
    readonly webUsbBootloaderInstallation: (a: any, b: any, c: any, d: any, e: any) => any;
    readonly wasm_bindgen_869e20c53a5d58a8___convert__closures_____invoke___wasm_bindgen_869e20c53a5d58a8___JsValue__core_d6bbbae82bd85f10___result__Result_____wasm_bindgen_869e20c53a5d58a8___JsError___true_: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen_869e20c53a5d58a8___convert__closures_____invoke___js_sys_d55ee152de269ac3___Array_web_sys_2d6d01a7e379a37d___features__gen_UsbDevice__UsbDevice___core_d6bbbae82bd85f10___result__Result_____wasm_bindgen_869e20c53a5d58a8___JsError___true_: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen_869e20c53a5d58a8___convert__closures_____invoke___js_sys_d55ee152de269ac3___Array_web_sys_2d6d01a7e379a37d___features__gen_UsbDevice__UsbDevice___core_d6bbbae82bd85f10___result__Result_____wasm_bindgen_869e20c53a5d58a8___JsError___true__3: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen_869e20c53a5d58a8___convert__closures_____invoke___js_sys_d55ee152de269ac3___Array_web_sys_2d6d01a7e379a37d___features__gen_UsbDevice__UsbDevice___core_d6bbbae82bd85f10___result__Result_____wasm_bindgen_869e20c53a5d58a8___JsError___true__4: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen_869e20c53a5d58a8___convert__closures_____invoke___wasm_bindgen_869e20c53a5d58a8___sys__Undefined__core_d6bbbae82bd85f10___result__Result_____wasm_bindgen_869e20c53a5d58a8___JsError___true_: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen_869e20c53a5d58a8___convert__closures_____invoke___js_sys_d55ee152de269ac3___Function_fn_wasm_bindgen_869e20c53a5d58a8___JsValue_____wasm_bindgen_869e20c53a5d58a8___sys__Undefined___js_sys_d55ee152de269ac3___Function_fn_wasm_bindgen_869e20c53a5d58a8___JsValue_____wasm_bindgen_869e20c53a5d58a8___sys__Undefined_______true_: (a: number, b: number, c: any, d: any) => void;
    readonly wasm_bindgen_869e20c53a5d58a8___convert__closures_____invoke___wasm_bindgen_869e20c53a5d58a8___JsValue______true_: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen_869e20c53a5d58a8___convert__closures_____invoke_______true_: (a: number, b: number) => void;
    readonly wasm_bindgen_869e20c53a5d58a8___convert__closures_____invoke_______true__1_: (a: number, b: number) => void;
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
