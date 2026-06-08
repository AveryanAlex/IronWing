import { emitWebEvent } from "./event";
import type { RcOverrideChannel } from "../../calibration";
import type { BootloaderInstallationResult, BootloaderInstallationSource, DfuDeviceInfo, FirmwareBootloaderBoardInfo, FirmwareInstallOptions, FirmwareInstallResult, FirmwareInstallSource } from "../../firmware";
import type { StartGuidedSessionRequest, UpdateGuidedSessionRequest, GuidedCommandResult } from "../../guided";
import type { ChartSeriesPage, ChartSeriesRequest, FlightSummary, LogDataPoint, LogExportRequest, LogExportResult, LogFormat, LogSummary, RawMessagePage, RawMessageQuery } from "../../logs";
import type { FencePlan, MissionDownload, MissionIssue, RallyPlan } from "../../mission";
import type { WireMissionPlan } from "../../lib/mavkit-types";
import type { ParamStore, ParamWriteResult } from "../../params";
import type { FlightPathPoint, TelemetrySnapshot } from "../../playback";
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

function nullableUsec(value: number | null | undefined): bigint | null {
  return value == null ? null : BigInt(Math.trunc(value));
}

export async function wasmLogParseSummary(path: string, format: LogFormat, bytes: Uint8Array): Promise<{
  summary: LogSummary;
  diagnostics: unknown[];
}> {
  const module = await ensureWasmModule();
  return module.logParseSummary(path, format, bytes) as { summary: LogSummary; diagnostics: unknown[] };
}

export async function wasmLogQueryMessages(options: {
  path: string;
  format: LogFormat;
  bytes: Uint8Array;
  msgType: string;
  startUsec?: number | null;
  endUsec?: number | null;
  maxPoints?: number | null;
}): Promise<LogDataPoint[]> {
  const module = await ensureWasmModule();
  return module.logQueryMessages(
    options.path,
    options.format,
    options.bytes,
    options.msgType,
    nullableUsec(options.startUsec),
    nullableUsec(options.endUsec),
    options.maxPoints ?? null,
  ) as LogDataPoint[];
}

export async function wasmLogRawMessagesQuery(path: string, format: LogFormat, bytes: Uint8Array, request: RawMessageQuery): Promise<RawMessagePage> {
  const module = await ensureWasmModule();
  return module.logRawMessagesQuery(path, format, bytes, request) as RawMessagePage;
}

export async function wasmLogChartSeriesQuery(path: string, format: LogFormat, bytes: Uint8Array, request: ChartSeriesRequest): Promise<ChartSeriesPage> {
  const module = await ensureWasmModule();
  return module.logChartSeriesQuery(path, format, bytes, request) as ChartSeriesPage;
}

export async function wasmLogFlightPath(options: {
  path: string;
  format: LogFormat;
  bytes: Uint8Array;
  startUsec?: number | null;
  endUsec?: number | null;
  maxPoints?: number | null;
}): Promise<FlightPathPoint[]> {
  const module = await ensureWasmModule();
  return module.logFlightPath(
    options.path,
    options.format,
    options.bytes,
    nullableUsec(options.startUsec),
    nullableUsec(options.endUsec),
    options.maxPoints ?? null,
  ) as FlightPathPoint[];
}

export async function wasmLogTelemetryTrack(path: string, format: LogFormat, bytes: Uint8Array, maxPoints?: number | null): Promise<TelemetrySnapshot[]> {
  const module = await ensureWasmModule();
  return module.logTelemetryTrack(path, format, bytes, maxPoints ?? null) as TelemetrySnapshot[];
}

export async function wasmLogTelemetryAt(path: string, format: LogFormat, bytes: Uint8Array, cursorUsec?: number | null): Promise<TelemetrySnapshot> {
  const module = await ensureWasmModule();
  return module.logTelemetryAt(path, format, bytes, nullableUsec(cursorUsec)) as TelemetrySnapshot;
}

export async function wasmLogFlightSummary(path: string, format: LogFormat, bytes: Uint8Array): Promise<FlightSummary> {
  const module = await ensureWasmModule();
  return module.logFlightSummary(path, format, bytes) as FlightSummary;
}

export async function wasmLogExportCsvBytes(path: string, format: LogFormat, bytes: Uint8Array, request: LogExportRequest): Promise<LogExportResult & { bytes: number[] }> {
  const module = await ensureWasmModule();
  return module.logExportCsvBytes(path, format, bytes, request) as LogExportResult & { bytes: number[] };
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

export async function wasmWebSerialDetectBootloaderBoard(options: {
  portName: string;
  serialAdapter: unknown;
  isCancelled: () => boolean;
}): Promise<FirmwareBootloaderBoardInfo> {
  const module = await ensureWasmModule();
  const webSerialDetectBootloaderBoard = (module as unknown as {
    webSerialDetectBootloaderBoard(
      portName: string,
      serialAdapter: unknown,
      isCancelled: () => boolean,
    ): Promise<FirmwareBootloaderBoardInfo>;
  }).webSerialDetectBootloaderBoard;
  return webSerialDetectBootloaderBoard(
    options.portName,
    options.serialAdapter,
    options.isCancelled,
  );
}

export async function wasmWebUsbBootloaderInstallation(options: {
  usbDevice: unknown;
  deviceInfo: DfuDeviceInfo;
  source: BootloaderInstallationSource;
  onProgress: (phase: string, written: number, total: number) => void;
  isCancelled: () => boolean;
}): Promise<BootloaderInstallationResult> {
  const module = await ensureWasmModule();
  return module.webUsbBootloaderInstallation(
    options.usbDevice,
    options.deviceInfo,
    options.source,
    options.onProgress,
    options.isCancelled,
  ) as Promise<BootloaderInstallationResult>;
}

export async function wasmParamDownloadAll(): Promise<void> {
  const runtime = await ensureWasmRuntime();
  return runtime.paramDownloadAll();
}

export async function wasmParamWrite(name: string, value: number): Promise<ParamWriteResult> {
  const runtime = await ensureWasmRuntime();
  return runtime.paramWrite(name, value) as Promise<ParamWriteResult>;
}

export async function wasmParamWriteBatch(params: [string, number][]): Promise<ParamWriteResult[]> {
  const runtime = await ensureWasmRuntime();
  return runtime.paramWriteBatch(params) as Promise<ParamWriteResult[]>;
}

export async function wasmParamCancel(): Promise<void> {
  const runtime = await ensureWasmRuntime();
  return runtime.paramCancel();
}

export async function wasmParamParseFile(contents: string): Promise<Record<string, number>> {
  const runtime = await ensureWasmRuntime();
  return runtime.paramParseFile(contents) as Record<string, number>;
}

export async function wasmParamFormatFile(store: ParamStore): Promise<string> {
  const runtime = await ensureWasmRuntime();
  return runtime.paramFormatFile(store);
}

export async function wasmMissionValidate(plan: WireMissionPlan): Promise<MissionIssue[]> {
  const runtime = await ensureWasmRuntime();
  return runtime.missionValidate(plan) as MissionIssue[];
}

export async function wasmMissionUpload(plan: WireMissionPlan): Promise<void> {
  const runtime = await ensureWasmRuntime();
  return runtime.missionUpload(plan);
}

export async function wasmMissionDownload(): Promise<MissionDownload> {
  const runtime = await ensureWasmRuntime();
  return runtime.missionDownload() as Promise<MissionDownload>;
}

export async function wasmMissionClear(): Promise<void> {
  const runtime = await ensureWasmRuntime();
  return runtime.missionClear();
}

export async function wasmMissionSetCurrent(seq: number): Promise<void> {
  const runtime = await ensureWasmRuntime();
  return runtime.missionSetCurrent(seq);
}

export async function wasmMissionCancel(): Promise<void> {
  const runtime = await ensureWasmRuntime();
  return runtime.missionCancel();
}

export async function wasmFenceUpload(plan: FencePlan): Promise<void> {
  const runtime = await ensureWasmRuntime();
  return runtime.fenceUpload(plan);
}

export async function wasmFenceDownload(): Promise<FencePlan> {
  const runtime = await ensureWasmRuntime();
  return runtime.fenceDownload() as Promise<FencePlan>;
}

export async function wasmFenceClear(): Promise<void> {
  const runtime = await ensureWasmRuntime();
  return runtime.fenceClear();
}

export async function wasmRallyUpload(plan: RallyPlan): Promise<void> {
  const runtime = await ensureWasmRuntime();
  return runtime.rallyUpload(plan);
}

export async function wasmRallyDownload(): Promise<RallyPlan> {
  const runtime = await ensureWasmRuntime();
  return runtime.rallyDownload() as Promise<RallyPlan>;
}

export async function wasmRallyClear(): Promise<void> {
  const runtime = await ensureWasmRuntime();
  return runtime.rallyClear();
}

export async function wasmStartGuidedSession(request: StartGuidedSessionRequest): Promise<GuidedCommandResult> {
  const runtime = await ensureWasmRuntime();
  return runtime.startGuidedSession(request) as Promise<GuidedCommandResult>;
}

export async function wasmUpdateGuidedSession(request: UpdateGuidedSessionRequest): Promise<GuidedCommandResult> {
  const runtime = await ensureWasmRuntime();
  return runtime.updateGuidedSession(request) as Promise<GuidedCommandResult>;
}

export async function wasmStopGuidedSession(): Promise<GuidedCommandResult> {
  const runtime = await ensureWasmRuntime();
  return runtime.stopGuidedSession() as GuidedCommandResult;
}

export async function wasmCalibrateAccel(): Promise<void> {
  const runtime = await ensureWasmRuntime();
  return runtime.calibrateAccel();
}

export async function wasmCalibrateGyro(): Promise<void> {
  const runtime = await ensureWasmRuntime();
  return runtime.calibrateGyro();
}

export async function wasmCalibrateCompassStart(compassMask: number): Promise<void> {
  const runtime = await ensureWasmRuntime();
  return runtime.calibrateCompassStart(compassMask);
}

export async function wasmCalibrateCompassAccept(compassMask: number): Promise<void> {
  const runtime = await ensureWasmRuntime();
  return runtime.calibrateCompassAccept(compassMask);
}

export async function wasmCalibrateCompassCancel(compassMask: number): Promise<void> {
  const runtime = await ensureWasmRuntime();
  return runtime.calibrateCompassCancel(compassMask);
}

export async function wasmRebootVehicle(): Promise<void> {
  const runtime = await ensureWasmRuntime();
  return runtime.rebootVehicle();
}

export async function wasmRebootToBootloader(): Promise<void> {
  const runtime = await ensureWasmRuntime();
  return runtime.rebootToBootloader();
}

export async function wasmDisconnectLink(): Promise<void> {
  const runtime = await ensureWasmRuntime();
  return runtime.disconnectLink();
}

export async function wasmMotorTest(motorInstance: number, throttlePct: number, durationS: number): Promise<void> {
  const runtime = await ensureWasmRuntime();
  return runtime.motorTest(motorInstance, throttlePct, durationS);
}

export async function wasmSetServo(instance: number, pwmUs: number): Promise<void> {
  const runtime = await ensureWasmRuntime();
  return runtime.setServo(instance, pwmUs);
}

export async function wasmRcOverride(channels: RcOverrideChannel[]): Promise<void> {
  const runtime = await ensureWasmRuntime();
  return runtime.rcOverride(channels);
}

export async function wasmRequestPrearmChecks(): Promise<void> {
  const runtime = await ensureWasmRuntime();
  return runtime.requestPrearmChecks();
}
