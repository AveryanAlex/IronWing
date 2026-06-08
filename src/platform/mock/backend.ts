import {
  applyMockGuidedState,
  liveGuidedStreamEvent,
  startGuidedSession,
  stopGuidedSession,
  updateGuidedSession,
  vehicleTakeoff,
} from "./backend/guided";
import { EVENT_NAMES } from "../../lib/generated/events";
import {
  closeMockLog,
  cancelLogLibraryOperation,
  emitProgressEvent,
  exportLog,
  exportLogCsv,
  getActiveLogSummary,
  getFlightPath,
  getFlightSummary,
  getLogFormatAdapters,
  getLogLibraryCatalog,
  getRecordingSettings,
  getRecordingStatus,
  getSeededLogEntry,
  getSeededLogPickerFile,
  listLogLibrary,
  openMockLogWithProgress,
  playbackStateEvent,
  queryChartSeries,
  queryLogMessages,
  queryRawMessages,
  registerLogLibraryEntry,
  registerLogLibraryEntryFromPicker,
  relinkLogLibraryEntry,
  reindexLogLibraryEntry,
  removeLogLibraryEntry,
  resetLogsMockState,
  seedLogLibrary as seedMockLogLibrary,
  setLogLibraryCatalog as setMockLogLibraryCatalog,
  setRecordingSettings as writeMockRecordingSettings,
  setRecordingStatus as writeMockRecordingStatus,
  setReplayState as writeMockReplayState,
  startRecording,
  stopRecording,
  getTelemetryTrack,
} from "./backend/logs";
import type { RecordingSettings } from "../../recording";
import {
  defaultBootloaderCatalogTargets,
  defaultFirmwareCatalogTargets,
  mockBootloaderInstallationResult,
  mockDfuScanResult,
  mockFirmwareBootloaderBoardInfo,
  mockFirmwareCatalogEntries,
  mockFirmwareInstallPreflightInfo,
  mockFirmwareInstallReadinessResponse,
  mockFirmwareInstallUpdateResult,
  mockFirmwareRebootToBootloaderResult,
  mockInventoryResult,
  validateBootloaderInstallationArgs,
  validateFirmwareCatalogEntriesArgs,
  validateFirmwareInstallReadinessRequest,
  validateFirmwareInstallUpdateArgs,
  validateFirmwarePortArg,
} from "./backend/firmware";
import {
  applyMockMissionState,
  clearMockMissionPlan,
  commitMockMissionPlan,
  currentMissionState,
  fenceDownloadResult,
  liveMissionProgressStreamEvent,
  liveMissionStateStreamEvent,
  missionDownloadResult,
  missionProgressState,
  missionStateWithActiveOperation,
  missionValidateResult,
  rallyDownloadResult,
  setMockMissionCurrentIndex,
  validateMissionPlanArgs,
  validateMissionSetCurrentArgs,
} from "./backend/mission";
import {
  applyMockParamState,
  cancelParamOperation,
  downloadAllParams,
  formatParamFile,
  liveParamProgressStreamEvent,
  liveParamStoreStreamEvent,
  parseParamFile,
  writeParam,
  writeParamBatch,
} from "./backend/params";
import {
  commandBehaviors,
  deferredInvocations,
  invocations,
  mockState,
  mockProfileTiming,
  resetGuided,
  resetMockState,
  ensureMockLiveWriteAllowed,
  requireLiveEnvelope,
} from "./backend/runtime";
import {
  ackSessionSnapshotResult,
  openSessionSnapshotResult,
  playbackPauseResult,
  playbackPlayResult,
  playbackSeekResult,
  playbackSetSpeedResult,
} from "./backend/session";
import {
  applyMockLiveVehicleState,
  availableMessageRates,
  availableTransportDescriptors,
  connectLink,
  disconnectLink,
  emitLiveSessionState as emitLiveSessionStateUpdate,
  getAvailableModes,
  liveSessionStreamEvent,
  requireConnectedVehicle,
  setFlightMode,
  syncLiveVehicleArmedState,
  validateArmDisarmArgs,
  validateMotorTestArgs,
  validateRcOverrideArgs,
  validateSetMessageRateArgs,
  validateSetServoArgs,
  validateSetTelemetryRateArgs,
} from "./backend/vehicle";
import {
  definePlatformCommandHandlers,
  hasPlatformCommandHandler,
  invokePlatformCommand,
  type PlatformCommandHandlers,
} from "../../lib/ipc/platform-handlers";
import type { EventPayload, EventPayloadMap } from "../../lib/ipc/event-types";
import type { InvokeResult } from "../../lib/ipc/command-types";
import type {
  CommandArgs,
  MockCommandBehavior,
  MockGuidedStateValue,
  MockInvocation,
  MockLiveVehicleState,
  MockMissionProgressState,
  MockMissionState,
  MockParamProgressState,
  MockParamStoreState,
  MockPlatformController,
  MockPlatformEvent,
} from "./backend/types";

export type {
  MockCommandBehavior,
  MockGuidedStateValue,
  MockInvocation,
  MockLiveVehicleState,
  MockMissionProgressState,
  MockMissionState,
  MockParamProgressState,
  MockParamStoreState,
  MockPlatformController,
  MockPlatformEvent,
} from "./backend/types";
export type { MockLogSeedPreset } from "./backend/logs";

declare global {
  interface Window {
    __IRONWING_MOCK_PLATFORM__?: MockPlatformController;
  }
}

const eventTarget = new EventTarget();

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function emitEvent<E extends keyof EventPayloadMap>(event: E, payload: EventPayload<E>): void;
function emitEvent(event: string, payload: unknown): void;
function emitEvent(event: string, payload: unknown) {
  eventTarget.dispatchEvent(new CustomEvent(event, { detail: payload }));
}

function emitMany(events?: MockPlatformEvent[]) {
  for (const entry of events ?? []) {
    emitEvent(entry.event, entry.payload);
  }
}

function rejectAllDeferred(error: string) {
  for (const pending of deferredInvocations.values()) {
    for (const invocation of pending) {
      invocation.reject(error);
    }
  }
  deferredInvocations.clear();
}

function validateNativeSettingsCommand(cmd: string, args: CommandArgs) {
  switch (cmd) {
    case "set_telemetry_rate":
      validateSetTelemetryRateArgs(args);
      return;
    case "set_message_rate":
      ensureMockLiveWriteAllowed("set_message_rate");
      requireConnectedVehicle();
      validateSetMessageRateArgs(args);
      return;
    default:
      return;
  }
}

class MissionTransferCancelledError extends Error {}

class CompassCalibrationCancelledError extends Error {}

type PendingMissionOperation = {
  kind: "download" | "upload" | "clear";
  direction: "download" | "upload";
  totalItems: number;
  completedItems: number;
  cancel: () => void;
  cancelPromise: Promise<never>;
};

let pendingMissionOperation: PendingMissionOperation | null = null;

type PendingCompassCalibration = {
  cancel: () => void;
  cancelPromise: Promise<never>;
  task: Promise<void>;
};

let pendingCompassCalibration: PendingCompassCalibration | null = null;

function publishMissionState(missionState: MockMissionState) {
  applyMockMissionState(missionState);
  if (!mockState.liveEnvelope) {
    return;
  }

  emitEvent(EVENT_NAMES.MISSION_STATE, liveMissionStateStreamEvent(missionState).payload);
}

function publishMissionProgress(missionProgress: MockMissionProgressState) {
  if (!mockState.liveEnvelope) {
    return;
  }

  emitEvent(EVENT_NAMES.MISSION_PROGRESS, liveMissionProgressStreamEvent(missionProgress).payload);
}

function beginMissionOperation(
  kind: PendingMissionOperation["kind"],
  direction: PendingMissionOperation["direction"],
  totalItems: number,
): PendingMissionOperation {
  if (pendingMissionOperation) {
    throw new Error("another mission transfer is already active");
  }

  let cancel!: () => void;
  const cancelPromise = new Promise<never>((_, reject) => {
    cancel = () => reject(new MissionTransferCancelledError(`Mission ${kind} cancelled.`));
  });

  const operation: PendingMissionOperation = {
    kind,
    direction,
    totalItems: Math.max(0, totalItems),
    completedItems: 0,
    cancel,
    cancelPromise,
  };
  pendingMissionOperation = operation;
  return operation;
}

async function waitForMissionOperationStep(
  operation: PendingMissionOperation,
  durationMs = mockProfileTiming().missionStepDelayMs,
) {
  await Promise.race([delay(durationMs), operation.cancelPromise]);
}

function liveTelemetryStreamPayload() {
  return {
    envelope: requireLiveEnvelope(),
    value: structuredClone(mockState.liveTelemetryDomain),
  };
}

function liveDisconnectedSessionPayload(envelope: { session_id: string; source_kind: "live" | "playback"; seek_epoch: number; reset_revision: number }) {
  return {
    envelope,
    value: {
      available: true,
      complete: true,
      provenance: "stream",
      value: {
        status: "pending",
        connection: { kind: "disconnected" },
        vehicle_state: null,
        home_position: null,
      },
    },
  };
}

async function runCompassCalibration() {
  if (pendingCompassCalibration) {
    pendingCompassCalibration.cancel();
  }

  let cancel!: () => void;
  const cancelPromise = new Promise<never>((_, reject) => {
    cancel = () => reject(new CompassCalibrationCancelledError("Compass calibration cancelled."));
  });

  const calibration: PendingCompassCalibration = {
    cancel,
    cancelPromise,
    task: Promise.resolve(),
  };
  pendingCompassCalibration = calibration;

  const progressSteps = [
    { compass_id: 1, completion_pct: 15, status: "waiting_to_start", attempt: 1 },
    { compass_id: 1, completion_pct: 55, status: "running_step_one", attempt: 1 },
    { compass_id: 1, completion_pct: 100, status: "success", attempt: 1 },
  ] satisfies EventPayload<typeof EVENT_NAMES.COMPASS_CAL_PROGRESS>[];

  calibration.task = (async () => {
    try {
      for (const progress of progressSteps) {
        await Promise.race([delay(mockProfileTiming().compassStepDelayMs), calibration.cancelPromise]);
        if (pendingCompassCalibration !== calibration || !mockState.liveVehicleAvailable) {
          return;
        }
        emitEvent(EVENT_NAMES.COMPASS_CAL_PROGRESS, progress);
      }

      if (pendingCompassCalibration !== calibration || !mockState.liveVehicleAvailable) {
        return;
      }

      emitEvent(EVENT_NAMES.COMPASS_CAL_REPORT, {
        compass_id: 1,
        status: "success",
        fitness: 12.5,
        ofs_x: 24,
        ofs_y: -11,
        ofs_z: 7,
        autosaved: true,
      });
    } catch (error) {
      if (!(error instanceof CompassCalibrationCancelledError)) {
        throw error;
      }
    } finally {
      if (pendingCompassCalibration === calibration) {
        pendingCompassCalibration = null;
      }
    }
  })();

  void calibration.task;
}

function cancelCompassCalibration() {
  if (!pendingCompassCalibration) {
    return false;
  }

  const calibration = pendingCompassCalibration;
  pendingCompassCalibration = null;
  calibration.cancel();
  return true;
}

function finalizeMissionOperation(operation: PendingMissionOperation) {
  if (pendingMissionOperation === operation) {
    pendingMissionOperation = null;
  }
}

function cancelPendingMissionOperation() {
  const activeOperation = pendingMissionOperation;
  if (!activeOperation) {
    return false;
  }

  pendingMissionOperation = null;
  activeOperation.cancel();
  return true;
}

function missionProgressForPhase(
  operation: PendingMissionOperation,
  phase: MockMissionProgressState["phase"],
  completedItems: number,
): MockMissionProgressState {
  const boundedCompletedItems = Math.max(0, Math.min(completedItems, operation.totalItems));
  operation.completedItems = boundedCompletedItems;
  return missionProgressState(
    operation.direction,
    phase,
    boundedCompletedItems,
    operation.totalItems,
  );
}

async function runMissionTransfer<T>(params: {
  kind: PendingMissionOperation["kind"];
  direction: PendingMissionOperation["direction"];
  totalItems: number;
  complete: () => T;
}): Promise<T> {
  requireConnectedVehicle();

  const operation = beginMissionOperation(params.kind, params.direction, params.totalItems);
  publishMissionState(missionStateWithActiveOperation(params.kind));

  try {
    publishMissionProgress(missionProgressForPhase(operation, "request_count", 0));
    await waitForMissionOperationStep(operation);

    if (operation.totalItems > 0) {
      publishMissionProgress(
        missionProgressForPhase(
          operation,
          "transfer_items",
          Math.max(1, Math.min(operation.totalItems, Math.ceil(operation.totalItems / 2))),
        ),
      );
      await waitForMissionOperationStep(operation);
    }

    publishMissionProgress(missionProgressForPhase(operation, "await_ack", operation.totalItems));
    await waitForMissionOperationStep(operation);

    const result = params.complete();
    publishMissionState(currentMissionState());
    publishMissionProgress(missionProgressForPhase(operation, "completed", operation.totalItems));
    return result;
  } catch (error) {
    publishMissionState({
      ...currentMissionState(),
      active_op: null,
    });

    if (error instanceof MissionTransferCancelledError) {
      publishMissionProgress(missionProgressForPhase(operation, "cancelled", operation.completedItems));
      throw error;
    }

    publishMissionProgress(missionProgressForPhase(operation, "failed", operation.completedItems));
    throw error;
  } finally {
    finalizeMissionOperation(operation);
  }
}

function validateUploadPlanArg(args: CommandArgs, label: string) {
  return validateMissionPlanArgs(args, label);
}

function validateStructuredPlanArg<T>(args: CommandArgs, label: string): T {
  const plan = args?.plan;
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    throw new Error(`missing or invalid ${label}`);
  }

  return structuredClone(plan as T);
}

function mockRuntimeCapabilities() {
  return {
    transports: availableTransportDescriptors(),
    firmware_install_update: { kind: "supported" },
    log_library_filesystem: { kind: "supported" },
    recording_filesystem: { kind: "supported" },
    mission_transfer: { kind: "supported" },
    parameter_transfer: { kind: "supported" },
  };
}

type MockOnlyCommandHandler = (args?: CommandArgs) => Promise<unknown> | unknown;
type MockOnlyCommandHandlers = Record<string, MockOnlyCommandHandler>;

const mockSerialPortCommandHandlers = definePlatformCommandHandlers({
  list_serial_port_inventory: () => mockInventoryResult(),
  request_web_serial_port: () => null,
});

const mockSessionCommandHandlers = definePlatformCommandHandlers({
  bt_request_permissions: () => undefined,
  bt_stop_scan_ble: () => undefined,
  bt_scan_ble: () => [
    { name: "Demo BLE Radio", address: "AA:BB:CC:DD:EE:FF", device_type: "ble" as const, profile: "nordic_uart" as const },
  ],
  bt_get_bonded_devices: () => [
    { name: "Demo SPP Radio", address: "11:22:33:44:55:66", device_type: "classic" as const },
  ],
  available_transports: () => availableTransportDescriptors(),
  open_session_snapshot: (args) => openSessionSnapshotResult(((args?.sourceKind as "live" | "playback" | undefined) ?? "live")) as InvokeResult<"open_session_snapshot">,
  ack_session_snapshot: (args) => ackSessionSnapshotResult(args as CommandArgs) as InvokeResult<"ack_session_snapshot">,
  connect_link: (args) => {
    connectLink(args as CommandArgs);
  },
  disconnect_link: (args) => {
    cancelPendingMissionOperation();
    cancelParamOperation();
    cancelCompassCalibration();
    const liveEnvelope = mockState.liveEnvelope;
    disconnectLink(args as CommandArgs);
    if (liveEnvelope) {
      emitEvent(EVENT_NAMES.SESSION_STATE, liveDisconnectedSessionPayload(liveEnvelope));
    }
  },
});

const mockPlaybackCommandHandlers = definePlatformCommandHandlers({
  playback_seek: (args) => {
    const { events, ...result } = playbackSeekResult(args as CommandArgs);
    emitMany(events);
    return result;
  },
  playback_play: () => {
    const { state, events } = playbackPlayResult();
    emitMany(events);
    return state;
  },
  playback_pause: () => {
    const { state, events } = playbackPauseResult();
    emitMany(events);
    return state;
  },
  playback_set_speed: (args) => {
    const { state, events } = playbackSetSpeedResult(args as CommandArgs);
    emitMany(events);
    return state;
  },
  playback_stop: () => {
    if (!mockState.logOpen) {
      throw new Error("no log open");
    }
    if (!mockState.playbackEnvelope) {
      throw new Error("playback session is not active");
    }
    const playbackEnvelope = mockState.playbackEnvelope;
    mockState.logOpen = false;
    mockState.playbackEnvelope = null;
    mockState.pendingPlaybackEnvelope = null;
    mockState.playbackCursorUsec = null;
    const idleState = closeMockLog();
    emitEvent(EVENT_NAMES.PLAYBACK_STATE, { envelope: playbackEnvelope, value: idleState });
    if (mockState.liveEnvelope && mockState.liveVehicleState) {
      emitEvent(EVENT_NAMES.SESSION_STATE, liveSessionStreamEvent(mockState.liveVehicleState).payload);
    }
    return idleState;
  },
});

const mockLogCommandHandlers = definePlatformCommandHandlers({
  log_format_adapters: () => getLogFormatAdapters(),
  log_library_list: () => listLogLibrary(),
  log_library_register: (args) => {
    const path = typeof args?.path === "string" ? args.path : null;
    if (!path) {
      throw new Error("missing or invalid log_library_register.path");
    }
    const { entry, events } = registerLogLibraryEntry(path);
    emitMany(events);
    return entry;
  },
  log_library_register_open_file: async () => {
    const result = await registerLogLibraryEntryFromPicker();
    if (!result) {
      return null;
    }
    emitMany(result.events);
    return result.entry;
  },
  log_library_remove: (args) => {
    const entryId = typeof args?.entryId === "string" ? args.entryId : null;
    if (!entryId) {
      throw new Error("missing or invalid log_library_remove.entryId");
    }
    return removeLogLibraryEntry(entryId);
  },
  log_library_relink: (args) => {
    const entryId = typeof args?.entryId === "string" ? args.entryId : null;
    const path = typeof args?.path === "string" ? args.path : null;
    if (!entryId) {
      throw new Error("missing or invalid log_library_relink.entryId");
    }
    if (!path) {
      throw new Error("missing or invalid log_library_relink.path");
    }
    const { entry, events } = relinkLogLibraryEntry(entryId, path);
    emitMany(events);
    return entry;
  },
  log_library_reindex: (args) => {
    const entryId = typeof args?.entryId === "string" ? args.entryId : null;
    if (!entryId) {
      throw new Error("missing or invalid log_library_reindex.entryId");
    }
    const { entry, events } = reindexLogLibraryEntry(entryId);
    emitMany(events);
    return entry;
  },
  log_library_cancel: () => cancelLogLibraryOperation(),
  log_raw_messages_query: (args) => queryRawMessages(args as CommandArgs),
  log_chart_series_query: (args) => queryChartSeries(args as CommandArgs),
  log_export: (args) => {
    const { events, result } = exportLog(args as CommandArgs);
    emitMany(events);
    return result;
  },
  log_get_summary: () => getActiveLogSummary(),
  log_query: (args) => queryLogMessages(args as CommandArgs),
  log_get_flight_path: (args) => getFlightPath(args as CommandArgs),
  log_get_telemetry_track: (args) => getTelemetryTrack(args as CommandArgs),
  log_get_flight_summary: () => getFlightSummary(),
  log_export_csv: (args) => {
    const { events, rowsWritten } = exportLogCsv(args as CommandArgs);
    emitMany(events);
    return rowsWritten;
  },
  log_open: (args) => {
    const { summary, events } = openMockLogWithProgress(args as CommandArgs);
    mockState.logOpen = true;
    emitMany(events);
    return summary;
  },
  log_close: () => {
    mockState.logOpen = false;
    mockState.playbackEnvelope = null;
    mockState.pendingPlaybackEnvelope = null;
    mockState.playbackCursorUsec = null;
    closeMockLog();
  },
});

const mockRecordingCommandHandlers = definePlatformCommandHandlers({
  recording_status: () => getRecordingStatus(),
  recording_settings_read: () => getRecordingSettings(),
  recording_settings_write: (args) => writeMockRecordingSettings(args?.settings as RecordingSettings),
  recording_start: (args) => startRecording(args as CommandArgs),
  recording_stop: () => {
    stopRecording();
  },
});

const mockFirmwareCommandHandlers = definePlatformCommandHandlers({
  firmware_session_status: () => ({ kind: "idle" as const }),
  firmware_session_clear_completed: () => undefined,
  firmware_session_cancel: () => undefined,
  firmware_install_update_preflight: () => mockFirmwareInstallPreflightInfo(),
  firmware_list_dfu_devices: () => mockDfuScanResult(),
  firmware_install_update_readiness: (args) => {
    const request = validateFirmwareInstallReadinessRequest(args as CommandArgs);
    return mockFirmwareInstallReadinessResponse(request);
  },
  firmware_reboot_to_bootloader: (args) => {
    const port = validateFirmwarePortArg(args as CommandArgs, "firmware_reboot_to_bootloader");
    return mockFirmwareRebootToBootloaderResult(port);
  },
  firmware_detect_bootloader_board: (args) => {
    const port = validateFirmwarePortArg(args as CommandArgs, "firmware_detect_bootloader_board");
    return mockFirmwareBootloaderBoardInfo(port);
  },
  firmware_install_update: (args) => {
    ensureMockLiveWriteAllowed("firmware_install_update");
    const request = validateFirmwareInstallUpdateArgs(args as CommandArgs);
    return mockFirmwareInstallUpdateResult(request);
  },
  firmware_bootloader_installation: (args) => {
    ensureMockLiveWriteAllowed("firmware_bootloader_installation");
    const request = validateBootloaderInstallationArgs(args as CommandArgs);
    return mockBootloaderInstallationResult(request);
  },
});

const mockVehicleControlCommandHandlers = definePlatformCommandHandlers({
  set_telemetry_rate: () => undefined,
  set_message_rate: () => {
    ensureMockLiveWriteAllowed("set_message_rate");
  },
  get_available_message_rates: () => availableMessageRates(),
  get_available_modes: () => getAvailableModes(),
  set_flight_mode: (args) => {
    ensureMockLiveWriteAllowed("set_flight_mode");
    setFlightMode(args as CommandArgs, emitEvent);
  },
  set_servo: (args) => {
    ensureMockLiveWriteAllowed("set_servo");
    requireConnectedVehicle();
    validateSetServoArgs(args as CommandArgs);
  },
  motor_test: (args) => {
    ensureMockLiveWriteAllowed("motor_test");
    requireConnectedVehicle();
    validateMotorTestArgs(args as CommandArgs);
  },
  rc_override: (args) => {
    ensureMockLiveWriteAllowed("rc_override");
    requireConnectedVehicle();
    validateRcOverrideArgs(args as CommandArgs);
  },
  arm_vehicle: (args) => {
    ensureMockLiveWriteAllowed("arm_vehicle");
    requireConnectedVehicle();
    validateArmDisarmArgs(args as CommandArgs, "arm_vehicle");
    syncLiveVehicleArmedState(true, emitEvent);
  },
  disarm_vehicle: (args) => {
    ensureMockLiveWriteAllowed("disarm_vehicle");
    requireConnectedVehicle();
    validateArmDisarmArgs(args as CommandArgs, "disarm_vehicle");
    syncLiveVehicleArmedState(false, emitEvent);
  },
  vehicle_takeoff: (args) => {
    ensureMockLiveWriteAllowed("vehicle_takeoff");
    vehicleTakeoff(args as CommandArgs);
  },
});

const mockSetupActionCommandHandlers = definePlatformCommandHandlers({
  calibrate_accel: () => {
    ensureMockLiveWriteAllowed("calibrate_accel");
    requireConnectedVehicle();
  },
  calibrate_gyro: () => {
    ensureMockLiveWriteAllowed("calibrate_gyro");
    requireConnectedVehicle();
  },
  calibrate_compass_accept: () => {
    ensureMockLiveWriteAllowed("calibrate_compass_accept");
    requireConnectedVehicle();
  },
  reboot_vehicle: () => {
    ensureMockLiveWriteAllowed("reboot_vehicle");
    requireConnectedVehicle();
  },
  request_prearm_checks: () => {
    ensureMockLiveWriteAllowed("request_prearm_checks");
    requireConnectedVehicle();
  },
  calibrate_compass_start: async () => {
    ensureMockLiveWriteAllowed("calibrate_compass_start");
    requireConnectedVehicle();
    await runCompassCalibration();
  },
  calibrate_compass_cancel: () => {
    ensureMockLiveWriteAllowed("calibrate_compass_cancel");
    requireConnectedVehicle();
    cancelCompassCalibration();
  },
});

const mockParamCommandHandlers = definePlatformCommandHandlers({
  param_download_all: () => {
    requireConnectedVehicle();
    return downloadAllParams(emitEvent);
  },
  param_cancel: () => {
    requireConnectedVehicle();
    cancelParamOperation();
  },
  param_write: (args) => {
    ensureMockLiveWriteAllowed("param_write");
    requireConnectedVehicle();
    return writeParam(args as CommandArgs, emitEvent);
  },
  param_write_batch: (args) => {
    ensureMockLiveWriteAllowed("param_write_batch");
    requireConnectedVehicle();
    return writeParamBatch(args as CommandArgs, emitEvent);
  },
  param_parse_file: (args) => parseParamFile(args as CommandArgs),
  param_format_file: (args) => formatParamFile(args as CommandArgs),
});

const mockGuidedCommandHandlers = definePlatformCommandHandlers({
  start_guided_session: (args) => startGuidedSession(args as CommandArgs, emitEvent) as InvokeResult<"start_guided_session">,
  update_guided_session: (args) => updateGuidedSession(args as CommandArgs, emitEvent) as InvokeResult<"update_guided_session">,
  stop_guided_session: () => stopGuidedSession() as InvokeResult<"stop_guided_session">,
});

const mockMissionCommandHandlers = definePlatformCommandHandlers({
  mission_upload: (args) => {
    ensureMockLiveWriteAllowed("mission_upload");
    const plan = validateUploadPlanArg(args as CommandArgs, "mission_upload.plan");
    return runMissionTransfer({
      kind: "upload",
      direction: "upload",
      totalItems: plan.items.length,
      complete: () => {
        commitMockMissionPlan(plan);
      },
    });
  },
  mission_clear: () => {
    ensureMockLiveWriteAllowed("mission_clear");
    return runMissionTransfer({
      kind: "clear",
      direction: "upload",
      totalItems: currentMissionState().plan?.items.length ?? 0,
      complete: () => {
        clearMockMissionPlan();
      },
    });
  },
  mission_set_current: (args) => {
    ensureMockLiveWriteAllowed("mission_set_current");
    requireConnectedVehicle();
    const seq = validateMissionSetCurrentArgs(args as CommandArgs);
    const plan = currentMissionState().plan;
    if (plan && seq >= plan.items.length) {
      throw new Error(`mission_set_current.seq must be less than ${plan.items.length}`);
    }

    setMockMissionCurrentIndex(seq);
    publishMissionState(currentMissionState());
  },
  mission_cancel: () => {
    requireConnectedVehicle();
    cancelPendingMissionOperation();
  },
  fence_upload: (args) => {
    ensureMockLiveWriteAllowed("fence_upload");
    requireConnectedVehicle();
    mockState.liveFencePlan = validateStructuredPlanArg(args as CommandArgs, "fence_upload.plan");
  },
  fence_clear: () => {
    ensureMockLiveWriteAllowed("fence_clear");
    requireConnectedVehicle();
    mockState.liveFencePlan = { return_point: null, regions: [] };
  },
  rally_upload: (args) => {
    ensureMockLiveWriteAllowed("rally_upload");
    requireConnectedVehicle();
    mockState.liveRallyPlan = validateStructuredPlanArg(args as CommandArgs, "rally_upload.plan");
  },
  rally_clear: () => {
    ensureMockLiveWriteAllowed("rally_clear");
    requireConnectedVehicle();
    mockState.liveRallyPlan = { points: [] };
  },
  mission_download: () => {
    ensureMockLiveWriteAllowed("mission_download");
    const result = missionDownloadResult();
    return runMissionTransfer({
      kind: "download",
      direction: "download",
      totalItems: result.plan.items.length,
      complete: () => {
        applyMockMissionState({
          ...currentMissionState(),
          active_op: null,
        });
        return result;
      },
    });
  },
  mission_validate: (args) => {
    requireConnectedVehicle();
    return missionValidateResult(args as CommandArgs);
  },
  fence_download: () => {
    ensureMockLiveWriteAllowed("fence_download");
    return fenceDownloadResult();
  },
  rally_download: () => {
    ensureMockLiveWriteAllowed("rally_download");
    return rallyDownloadResult();
  },
});

const mockCommandHandlers: PlatformCommandHandlers = Object.assign(
  {},
  mockSerialPortCommandHandlers,
  mockSessionCommandHandlers,
  mockPlaybackCommandHandlers,
  mockLogCommandHandlers,
  mockRecordingCommandHandlers,
  mockFirmwareCommandHandlers,
  mockVehicleControlCommandHandlers,
  mockSetupActionCommandHandlers,
  mockParamCommandHandlers,
  mockGuidedCommandHandlers,
  mockMissionCommandHandlers,
);

const mockOnlyCommandHandlers: MockOnlyCommandHandlers = {
  runtime_capabilities: () => mockRuntimeCapabilities(),
  firmware_catalog_targets: () => defaultFirmwareCatalogTargets(),
  firmware_bootloader_catalog_targets: () => defaultBootloaderCatalogTargets(),
  firmware_catalog_entries: (args) => {
    const { boardId, platform } = validateFirmwareCatalogEntriesArgs(args);
    return mockFirmwareCatalogEntries(boardId, platform);
  },
};

async function defaultCommandResult(cmd: string, args: CommandArgs): Promise<unknown> {
  if (hasPlatformCommandHandler(mockCommandHandlers, cmd)) {
    return invokePlatformCommand(mockCommandHandlers, cmd as never, args as never);
  }

  const mockOnlyHandler = mockOnlyCommandHandlers[cmd];
  if (mockOnlyHandler) {
    return mockOnlyHandler(args);
  }

  throw new Error(`Unmocked command: ${cmd}`);
}

async function runBehavior<T>(cmd: string, behavior: MockCommandBehavior): Promise<T> {
  if (behavior.type === "defer") {
    return new Promise<T>((resolve, reject) => {
      const pending = deferredInvocations.get(cmd) ?? [];
      pending.push({
        resolve: (value) => resolve(value as T),
        reject,
      });
      deferredInvocations.set(cmd, pending);
    });
  }

  if (behavior.delayMs) {
    await delay(behavior.delayMs);
  }

  emitMany(behavior.emit);

  if (behavior.type === "reject") {
    throw behavior.error;
  }

  return behavior.result as T;
}

export async function invokeMockCommand<T>(cmd: string, args?: CommandArgs): Promise<T> {
  invocations.push({ cmd, args });
  validateNativeSettingsCommand(cmd, args);

  const behavior = commandBehaviors.get(cmd);
  if (behavior) {
    return runBehavior<T>(cmd, behavior);
  }

  return await defaultCommandResult(cmd, args) as T;
}

export function listenMockEvent<E extends keyof EventPayloadMap>(event: E, handler: (payload: EventPayload<E>) => void): () => void;
export function listenMockEvent<T>(event: string, handler: (payload: T) => void): () => void;
export function listenMockEvent<T>(event: string, handler: (payload: T) => void): () => void {
  const listener: EventListener = ((customEvent: CustomEvent<T>) => {
    handler(customEvent.detail);
  }) as EventListener;

  eventTarget.addEventListener(event, listener);
  return () => eventTarget.removeEventListener(event, listener);
}

function createController(): MockPlatformController {
  return {
    reset() {
      commandBehaviors.clear();
      invocations.length = 0;
      cancelPendingMissionOperation();
      cancelParamOperation();
      cancelCompassCalibration();
      rejectAllDeferred("Mock platform reset");
      resetMockState();
      resetLogsMockState();
    },
    setCommandBehavior(cmd, behavior) {
      commandBehaviors.set(cmd, behavior);
    },
    clearCommandBehavior(cmd) {
      commandBehaviors.delete(cmd);
    },
    resolveDeferred(cmd, result, emit = []) {
      const pending = deferredInvocations.get(cmd);
      if (!pending || pending.length === 0) {
        return false;
      }

      const invocation = pending.shift();
      if (!pending.length) {
        deferredInvocations.delete(cmd);
      }

      emitMany(emit);
      invocation?.resolve(result);
      return true;
    },
    rejectDeferred(cmd, error, emit = []) {
      const pending = deferredInvocations.get(cmd);
      if (!pending || pending.length === 0) {
        return false;
      }

      const invocation = pending.shift();
      if (!pending.length) {
        deferredInvocations.delete(cmd);
      }

      emitMany(emit);
      invocation?.reject(error);
      return true;
    },
    emit(event, payload) {
      emitEvent(event, payload);
    },
    emitLiveSessionState(vehicleState) {
      emitLiveSessionStateUpdate(vehicleState, emitEvent);
    },
    emitMissionState(missionState) {
      publishMissionState(missionState);
    },
    emitMissionProgress(missionProgress) {
      if (!mockState.liveEnvelope) {
        return;
      }

      emitEvent(EVENT_NAMES.MISSION_PROGRESS, liveMissionProgressStreamEvent(missionProgress).payload);
    },
    emitParamStore(paramStore) {
      mockState.liveParamStore = structuredClone(paramStore);
      if (!mockState.liveEnvelope) {
        return;
      }

      emitEvent(EVENT_NAMES.PARAM_STORE, liveParamStoreStreamEvent(paramStore).payload);
    },
    emitParamProgress(paramProgress) {
      mockState.liveParamProgress = structuredClone(paramProgress);
      if (!mockState.liveEnvelope) {
        return;
      }

      emitEvent(EVENT_NAMES.PARAM_PROGRESS, liveParamProgressStreamEvent(paramProgress).payload);
    },
    emitLiveGuidedState(guidedState) {
      applyMockGuidedState(guidedState);
      emitEvent(EVENT_NAMES.GUIDED_STATE, liveGuidedStreamEvent(guidedState).payload);
    },
    emitLogProgress(progress) {
      emitEvent(EVENT_NAMES.LOG_PROGRESS, emitProgressEvent(progress).payload);
    },
    emitPlaybackState(playbackState) {
      writeMockReplayState(playbackState);
      if (!mockState.playbackEnvelope) {
        return;
      }

      emitEvent(EVENT_NAMES.PLAYBACK_STATE, playbackStateEvent(mockState.playbackEnvelope).payload);
    },
    setLogLibraryCatalog(catalog) {
      return setMockLogLibraryCatalog(catalog);
    },
    seedLogLibrary(presets) {
      return seedMockLogLibrary(presets);
    },
    getLogLibraryCatalog() {
      return getLogLibraryCatalog();
    },
    getSeededLogEntry(preset) {
      return getSeededLogEntry(preset);
    },
    getSeededLogPickerFile(preset) {
      return getSeededLogPickerFile(preset);
    },
    setRecordingStatus(status) {
      return writeMockRecordingStatus(status);
    },
    setRecordingSettings(settings) {
      return writeMockRecordingSettings(settings);
    },
    resolveDeferredConnectLink({ vehicleState, missionState, paramStore, paramProgress, guidedState }) {
      const pending = deferredInvocations.get("connect_link");
      if (!pending || pending.length === 0) {
        return false;
      }

      const invocation = pending.shift();
      if (!pending.length) {
        deferredInvocations.delete("connect_link");
      }

      resetGuided("source_switch", "live source switched");
      applyMockLiveVehicleState(vehicleState);
      applyMockMissionState(missionState);
      applyMockParamState(paramStore, paramProgress);
      applyMockGuidedState(guidedState);

      emitMany([
        liveSessionStreamEvent(vehicleState),
        liveGuidedStreamEvent(guidedState),
      ]);
      invocation?.resolve(undefined);
      return true;
    },
    getInvocations() {
      return invocations.slice() as MockInvocation[];
    },
    getLiveEnvelope() {
      return mockState.liveEnvelope;
    },
  };
}

export function getMockPlatformController(): MockPlatformController {
  if (!window.__IRONWING_MOCK_PLATFORM__) {
    window.__IRONWING_MOCK_PLATFORM__ = createController();
  }

  return window.__IRONWING_MOCK_PLATFORM__;
}

getMockPlatformController();
