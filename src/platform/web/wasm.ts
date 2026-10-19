import { emitWebEvent } from "./event";
import type { EventPayload, EventPayloadMap } from "../../lib/ipc/event-types";
import type { AccelCalibrationPosition, RcOverrideChannel } from "../../calibration";
import type { BootloaderInstallationResult, BootloaderInstallationSource, DfuDeviceInfo, FirmwareBootloaderBoardInfo, FirmwareInstallOptions, FirmwareInstallResult, FirmwareInstallSource } from "../../firmware";
import type { StartGuidedSessionRequest, UpdateGuidedSessionRequest, GuidedCommandResult } from "../../guided";
import type { ChartSeriesPage, ChartSeriesRequest, FlightSummary, LogDataPoint, LogExportRequest, LogExportResult, LogFormat, LogSummary, RawMessagePage, RawMessageQuery } from "../../logs";
import type { FencePlan, MissionDownload, MissionIssue, RallyPlan } from "../../mission";
import type { WireMissionPlan } from "../../lib/mavkit-types";
import type {
  ParamApplyOutcome,
  ParamStageChange,
  ParamStagingState,
  ParamStore,
  ParamWriteResult,
} from "../../params";
import type { FlightPathPoint, TelemetrySnapshot } from "../../playback";
import type { MessageRateInfo } from "../../telemetry";
import type { TransportDescriptor } from "../../transport";
import type { IronwingWasmRuntime } from "./generated/ironwing_wasm";
import * as wasmFacade from "./generated/ironwing_wasm_facade";

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
  runtime ??= new wasmModule!.IronwingWasmRuntime((event: string, payload: unknown) => {
    emitWebEvent(event as keyof EventPayloadMap, payload as EventPayload<keyof EventPayloadMap>);
  });
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

export type ParsedLogHandle = {
  summary: LogSummary;
  diagnostics: import("../../logs").LogDiagnostic[];
  free(): void;
  queryMessages(msgType: string, startUsec?: number | null, endUsec?: number | null, maxPoints?: number | null): LogDataPoint[];
  rawMessagesQuery(request: RawMessageQuery): RawMessagePage;
  chartSeriesQuery(request: ChartSeriesRequest): ChartSeriesPage;
  flightPath(startUsec?: number | null, endUsec?: number | null, maxPoints?: number | null): FlightPathPoint[];
  telemetryTrack(maxPoints?: number | null): TelemetrySnapshot[];
  flightSummary(): FlightSummary;
  playbackFrame(cursorUsec?: number | null): import("../../lib/generated/ironwing-json").PlaybackFrame;
  exportCsvBytes(request: LogExportRequest): LogExportResult & { bytes: number[] };
};

export async function wasmOpenLog(path: string, format: LogFormat, bytes: Uint8Array): Promise<ParsedLogHandle> {
  const module = await ensureWasmModule();
  const log = new module.WasmLog(path, format, bytes);
  try {
    const parsed = log.parseSummary() as Pick<ParsedLogHandle, "summary" | "diagnostics">;
    return {
      ...parsed,
      free: () => log.free(),
      queryMessages: (type, start, end, max) => log.queryMessages(type, nullableUsec(start), nullableUsec(end), max ?? null),
      rawMessagesQuery: (request) => log.rawMessagesQuery(request),
      chartSeriesQuery: (request) => log.chartSeriesQuery(request),
      flightPath: (start, end, max) => log.flightPath(nullableUsec(start), nullableUsec(end), max ?? null),
      telemetryTrack: (max) => log.telemetryTrack(max ?? null),
      flightSummary: () => log.flightSummary(),
      playbackFrame: (cursor) => log.playbackFrame(nullableUsec(cursor)),
      exportCsvBytes: (request) => log.exportCsvBytes(request),
    };
  } catch (error) {
    log.free();
    throw error;
  }
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
  return wasmFacade.wasmParamDownloadAll(runtime);
}

export async function wasmParamWrite(name: string, value: number): Promise<ParamWriteResult> {
  const runtime = await ensureWasmRuntime();
  return wasmFacade.wasmParamWrite(runtime, { name, value });
}

export async function wasmParamWriteBatch(params: [string, number][]): Promise<ParamWriteResult[]> {
  const runtime = await ensureWasmRuntime();
  return wasmFacade.wasmParamWriteBatch(runtime, { params });
}

export async function wasmParamStagingSnapshot(): Promise<ParamStagingState> {
  const runtime = await ensureWasmRuntime();
  return wasmFacade.wasmParamStagingSnapshot(runtime);
}

export async function wasmParamStage(
  changes: ParamStageChange[],
  expectedRevision: number | null,
): Promise<ParamStagingState> {
  const runtime = await ensureWasmRuntime();
  return wasmFacade.wasmParamStage(runtime, { changes, expectedRevision });
}

export async function wasmParamDiscardStaged(
  names: string[],
  expectedRevision: number | null,
): Promise<ParamStagingState> {
  const runtime = await ensureWasmRuntime();
  return wasmFacade.wasmParamDiscardStaged(runtime, { names, expectedRevision });
}

export async function wasmParamClearStaged(expectedRevision: number | null): Promise<ParamStagingState> {
  const runtime = await ensureWasmRuntime();
  return wasmFacade.wasmParamClearStaged(runtime, { expectedRevision });
}

export async function wasmParamApplyStaged(
  names: string[] | null,
  expectedRevision: number | null,
): Promise<ParamApplyOutcome> {
  const runtime = await ensureWasmRuntime();
  return wasmFacade.wasmParamApplyStaged(runtime, { names, expectedRevision });
}

export async function wasmParamResetRebootCheckpoint(): Promise<ParamStagingState> {
  const runtime = await ensureWasmRuntime();
  return wasmFacade.wasmParamResetRebootCheckpoint(runtime);
}

export async function wasmParamCancel(): Promise<void> {
  const runtime = await ensureWasmRuntime();
  return wasmFacade.wasmParamCancel(runtime);
}

export async function wasmParamParseFile(contents: string): Promise<Record<string, number>> {
  const runtime = await ensureWasmRuntime();
  return wasmFacade.wasmParamParseFile(runtime, { contents });
}

export async function wasmParamFormatFile(store: ParamStore): Promise<string> {
  const runtime = await ensureWasmRuntime();
  return wasmFacade.wasmParamFormatFile(runtime, { store });
}

export async function wasmMissionValidate(plan: WireMissionPlan): Promise<MissionIssue[]> {
  const runtime = await ensureWasmRuntime();
  return wasmFacade.wasmMissionValidate(runtime, { plan });
}

export async function wasmMissionUpload(plan: WireMissionPlan): Promise<void> {
  const runtime = await ensureWasmRuntime();
  return wasmFacade.wasmMissionUpload(runtime, { plan });
}

export async function wasmMissionDownload(): Promise<MissionDownload> {
  const runtime = await ensureWasmRuntime();
  return wasmFacade.wasmMissionDownload(runtime);
}

export async function wasmMissionClear(): Promise<void> {
  const runtime = await ensureWasmRuntime();
  return wasmFacade.wasmMissionClear(runtime);
}

export async function wasmMissionSetCurrent(seq: number): Promise<void> {
  const runtime = await ensureWasmRuntime();
  return wasmFacade.wasmMissionSetCurrent(runtime, { seq });
}

export async function wasmMissionCancel(): Promise<void> {
  const runtime = await ensureWasmRuntime();
  return wasmFacade.wasmMissionCancel(runtime);
}

export async function wasmFenceUpload(plan: FencePlan): Promise<void> {
  const runtime = await ensureWasmRuntime();
  return wasmFacade.wasmFenceUpload(runtime, { plan });
}

export async function wasmFenceDownload(): Promise<FencePlan> {
  const runtime = await ensureWasmRuntime();
  return wasmFacade.wasmFenceDownload(runtime);
}

export async function wasmFenceClear(): Promise<void> {
  const runtime = await ensureWasmRuntime();
  return wasmFacade.wasmFenceClear(runtime);
}

export async function wasmRallyUpload(plan: RallyPlan): Promise<void> {
  const runtime = await ensureWasmRuntime();
  return wasmFacade.wasmRallyUpload(runtime, { plan });
}

export async function wasmRallyDownload(): Promise<RallyPlan> {
  const runtime = await ensureWasmRuntime();
  return wasmFacade.wasmRallyDownload(runtime);
}

export async function wasmRallyClear(): Promise<void> {
  const runtime = await ensureWasmRuntime();
  return wasmFacade.wasmRallyClear(runtime);
}

export async function wasmStartGuidedSession(request: StartGuidedSessionRequest): Promise<GuidedCommandResult> {
  const runtime = await ensureWasmRuntime();
  return wasmFacade.wasmStartGuidedSession(runtime, { request });
}

export async function wasmUpdateGuidedSession(request: UpdateGuidedSessionRequest): Promise<GuidedCommandResult> {
  const runtime = await ensureWasmRuntime();
  return wasmFacade.wasmUpdateGuidedSession(runtime, { request });
}

export async function wasmStopGuidedSession(): Promise<GuidedCommandResult> {
  const runtime = await ensureWasmRuntime();
  return wasmFacade.wasmStopGuidedSession(runtime);
}

export async function wasmCalibrateAccel(): Promise<void> {
  const runtime = await ensureWasmRuntime();
  return wasmFacade.wasmCalibrateAccel(runtime);
}

export async function wasmCalibrateAccelConfirm(position: AccelCalibrationPosition): Promise<void> {
  const runtime = await ensureWasmRuntime();
  return wasmFacade.wasmCalibrateAccelConfirm(runtime, { position });
}

export async function wasmCalibrateGyro(): Promise<void> {
  const runtime = await ensureWasmRuntime();
  return wasmFacade.wasmCalibrateGyro(runtime);
}

export async function wasmCalibrateCompassStart(compassMask: number): Promise<void> {
  const runtime = await ensureWasmRuntime();
  return wasmFacade.wasmCalibrateCompassStart(runtime, { compassMask });
}

export async function wasmCalibrateCompassAccept(compassMask: number): Promise<void> {
  const runtime = await ensureWasmRuntime();
  return wasmFacade.wasmCalibrateCompassAccept(runtime, { compassMask });
}

export async function wasmCalibrateCompassCancel(compassMask: number): Promise<void> {
  const runtime = await ensureWasmRuntime();
  return wasmFacade.wasmCalibrateCompassCancel(runtime, { compassMask });
}

export async function wasmRebootVehicle(): Promise<void> {
  const runtime = await ensureWasmRuntime();
  return wasmFacade.wasmRebootVehicle(runtime);
}

export async function wasmRebootToBootloader(): Promise<void> {
  const runtime = await ensureWasmRuntime();
  return runtime.rebootToBootloader();
}

export async function wasmDisconnectLink(): Promise<void> {
  const runtime = await ensureWasmRuntime();
  return runtime.disconnectLink();
}

export async function wasmMotorTest(motorSequence: number, throttlePct: number, durationS: number): Promise<void> {
  const runtime = await ensureWasmRuntime();
  return wasmFacade.wasmMotorTest(runtime, { motorSequence, throttlePct, durationS });
}

export async function wasmSetServo(instance: number, pwmUs: number): Promise<void> {
  const runtime = await ensureWasmRuntime();
  return wasmFacade.wasmSetServo(runtime, { instance, pwmUs });
}

export async function wasmRcOverride(channels: RcOverrideChannel[]): Promise<void> {
  const runtime = await ensureWasmRuntime();
  return wasmFacade.wasmRcOverride(runtime, { channels });
}

export async function wasmRequestPrearmChecks(): Promise<void> {
  const runtime = await ensureWasmRuntime();
  return wasmFacade.wasmRequestPrearmChecks(runtime);
}

export async function wasmMissionCommandsDecode(commands: import("../../lib/generated/mavkit-json").RawMissionCommand[]): Promise<import("../../lib/generated/mavkit-json").MissionCommand[]> {
  return wasmFacade.wasmMissionCommandsDecode(await ensureWasmRuntime(), { commands });
}
export async function wasmMissionCommandsEncode(commands: import("../../lib/generated/mavkit-json").MissionCommand[]): Promise<import("../../lib/generated/mavkit-json").RawMissionCommand[]> {
  return wasmFacade.wasmMissionCommandsEncode(await ensureWasmRuntime(), { commands });
}
