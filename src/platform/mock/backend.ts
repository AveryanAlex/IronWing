import {
  applyMockGuidedState,
  liveGuidedStreamEvent,
  startGuidedSession,
  stopGuidedSession,
  updateGuidedSession,
  vehicleTakeoff,
} from "./backend/guided";
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
  defaultFirmwareCatalogTargets,
  defaultRecoveryCatalogTargets,
  mockDfuScanResult,
  mockFirmwareCatalogEntries,
  mockFirmwareFlashDfuRecoveryResult,
  mockFirmwareFlashSerialResult,
  mockInventoryResult,
  mockSerialPreflightInfo,
  mockSerialReadinessResponse,
  validateFirmwareCatalogEntriesArgs,
  validateFirmwareFlashDfuRecoveryArgs,
  validateFirmwareFlashSerialArgs,
  validateSerialReadinessRequest,
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
  clearDemoIntervals,
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
  advanceDemoSimulator,
  setDemoSimulatorMission,
  setDemoSimulatorMissionCurrentIndex,
  telemetryFromSimulator,
  vehicleStateFromSimulator,
} from "./backend/vehicle-sim/simulator";
import { normalizeMissionPlan } from "./backend/vehicle-sim/mission";
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

  emitEvent("mission://state", liveMissionStateStreamEvent(missionState).payload);
}

function publishMissionProgress(missionProgress: MockMissionProgressState) {
  if (!mockState.liveEnvelope) {
    return;
  }

  emitEvent("mission://progress", liveMissionProgressStreamEvent(missionProgress).payload);
}

function publishStatusTextState() {
  if (!mockState.liveEnvelope) {
    return;
  }

  emitEvent("status_text://state", {
    envelope: requireLiveEnvelope(),
    value: {
      available: true,
      complete: true,
      provenance: "stream",
      value: structuredClone(mockState.liveStatusText ?? { entries: [] }),
    },
  });
}

function appendSimulatorStatusNotes(notes: string[], nowMsec = Date.now()) {
  if (notes.length === 0) {
    return;
  }

  const existingEntries = mockState.liveStatusText?.entries ?? [];
  let nextSequence = (existingEntries[existingEntries.length - 1]?.sequence ?? 0) + 1;
  mockState.liveStatusText = {
    entries: [
      ...existingEntries,
      ...notes.map((text) => ({
        sequence: nextSequence++,
        text,
        severity: "warning",
        timestamp_usec: nowMsec * 1_000,
      })),
    ],
  };
  publishStatusTextState();
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

function isDemoConnectRequest(args: CommandArgs) {
  return args?.request
    && typeof args.request === "object"
    && (args.request as { transport?: { kind?: string } }).transport?.kind === "demo";
}

function tickDemoSimulator(nowMsec = Date.now()) {
  if (!mockState.liveSimulator || !mockState.liveEnvelope || !mockState.liveVehicleState) {
    return;
  }

  const { simulator, mission_current_changed, status_notes } = advanceDemoSimulator(mockState.liveSimulator, nowMsec);
  mockState.liveSimulator = simulator;
  mockState.liveTelemetryDomain = telemetryFromSimulator(simulator, "stream");
  mockState.liveVehicleState = vehicleStateFromSimulator(simulator, mockState.liveVehicleState);
  if (mission_current_changed) {
    publishMissionState({
      ...currentMissionState(),
      current_index: simulator.state.mission.current_index,
    });
  }
  appendSimulatorStatusNotes(status_notes, nowMsec);
  emitEvent("telemetry://state", liveTelemetryStreamPayload());
}

function startDemoTimers() {
  clearDemoIntervals();

  const { demoTelemetryIntervalMs, demoSessionIntervalMs } = mockProfileTiming();
  mockState.demoTelemetryIntervalId = window.setInterval(() => {
    tickDemoSimulator();
  }, demoTelemetryIntervalMs);

  mockState.demoStatusIntervalId = window.setInterval(() => {
    if (!mockState.liveEnvelope || !mockState.liveVehicleState) {
      return;
    }

    emitEvent("session://state", liveSessionStreamEvent(mockState.liveVehicleState).payload);
  }, demoSessionIntervalMs);
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
  ];

  calibration.task = (async () => {
    try {
      for (const progress of progressSteps) {
        await Promise.race([delay(mockProfileTiming().compassStepDelayMs), calibration.cancelPromise]);
        if (pendingCompassCalibration !== calibration || !mockState.liveVehicleAvailable) {
          return;
        }
        emitEvent("compass://cal_progress", progress);
      }

      if (pendingCompassCalibration !== calibration || !mockState.liveVehicleAvailable) {
        return;
      }

      emitEvent("compass://cal_report", {
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

async function defaultCommandResult(cmd: string, args: CommandArgs): Promise<unknown> {
  switch (cmd) {
    case "list_serial_ports_cmd":
      return ["/dev/ttyUSB0", "/dev/ttyACM0"];
    case "bt_request_permissions":
    case "bt_stop_scan_ble":
      return undefined;
    case "bt_scan_ble":
      return [
        { name: "Demo BLE Radio", address: "AA:BB:CC:DD:EE:FF", device_type: "ble" },
      ];
    case "bt_get_bonded_devices":
      return [
        { name: "Demo SPP Radio", address: "11:22:33:44:55:66", device_type: "classic" },
      ];
    case "available_transports":
      return availableTransportDescriptors();
    case "open_session_snapshot":
      return openSessionSnapshotResult(((args?.sourceKind as "live" | "playback" | undefined) ?? "live"));
    case "ack_session_snapshot":
      return ackSessionSnapshotResult(args);
    case "playback_seek": {
      const { events, ...result } = playbackSeekResult(args);
      emitMany(events);
      return result;
    }
    case "playback_play": {
      const { state, events } = playbackPlayResult();
      emitMany(events);
      return state;
    }
    case "playback_pause": {
      const { state, events } = playbackPauseResult();
      emitMany(events);
      return state;
    }
    case "playback_set_speed": {
      const { state, events } = playbackSetSpeedResult(args);
      emitMany(events);
      return state;
    }
    case "playback_stop": {
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
      emitEvent("playback://state", { envelope: playbackEnvelope, value: idleState });
      if (mockState.liveEnvelope && mockState.liveVehicleState) {
        emitEvent("session://state", liveSessionStreamEvent(mockState.liveVehicleState).payload);
      }
      return idleState;
    }
    case "log_format_adapters":
      return getLogFormatAdapters();
    case "log_library_list":
      return listLogLibrary();
    case "log_library_register": {
      const path = typeof args?.path === "string" ? args.path : null;
      if (!path) {
        throw new Error("missing or invalid log_library_register.path");
      }
      const { entry, events } = registerLogLibraryEntry(path);
      emitMany(events);
      return entry;
    }
    case "log_library_register_open_file": {
      return registerLogLibraryEntryFromPicker().then((result: Awaited<ReturnType<typeof registerLogLibraryEntryFromPicker>>) => {
        if (!result) {
          return null;
        }
        emitMany(result.events);
        return result.entry;
      });
    }
    case "log_library_remove": {
      const entryId = typeof args?.entryId === "string" ? args.entryId : null;
      if (!entryId) {
        throw new Error("missing or invalid log_library_remove.entryId");
      }
      return removeLogLibraryEntry(entryId);
    }
    case "log_library_relink": {
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
    }
    case "log_library_reindex": {
      const entryId = typeof args?.entryId === "string" ? args.entryId : null;
      if (!entryId) {
        throw new Error("missing or invalid log_library_reindex.entryId");
      }
      const { entry, events } = reindexLogLibraryEntry(entryId);
      emitMany(events);
      return entry;
    }
    case "log_library_cancel":
      return cancelLogLibraryOperation();
    case "log_raw_messages_query":
      return queryRawMessages(args);
    case "log_chart_series_query":
      return queryChartSeries(args);
    case "log_export": {
      const { events, result } = exportLog(args);
      emitMany(events);
      return result;
    }
    case "log_get_summary":
      return getActiveLogSummary();
    case "log_query":
      return queryLogMessages(args);
    case "log_get_flight_path":
      return getFlightPath(args);
    case "log_get_telemetry_track":
      return getTelemetryTrack(args);
    case "log_get_flight_summary":
      return getFlightSummary();
    case "log_export_csv": {
      const { events, rowsWritten } = exportLogCsv(args);
      emitMany(events);
      return rowsWritten;
    }
    case "recording_status":
      return getRecordingStatus();
    case "recording_settings_read":
      return getRecordingSettings();
    case "recording_settings_write":
      return writeMockRecordingSettings(args?.settings as RecordingSettings);
    case "recording_start":
      return startRecording(args);
    case "recording_stop":
      stopRecording();
      return undefined;
    case "firmware_session_status":
      return { kind: "idle" };
    case "firmware_session_clear_completed":
      return undefined;
    case "firmware_serial_preflight":
      return mockSerialPreflightInfo();
    case "firmware_list_ports":
      return mockInventoryResult();
    case "firmware_list_dfu_devices":
      return mockDfuScanResult();
    case "firmware_catalog_targets":
      return defaultFirmwareCatalogTargets();
    case "firmware_recovery_catalog_targets":
      return defaultRecoveryCatalogTargets();
    case "firmware_catalog_entries": {
      const { boardId, platform } = validateFirmwareCatalogEntriesArgs(args);
      return mockFirmwareCatalogEntries(boardId, platform);
    }
    case "firmware_serial_readiness": {
      const request = validateSerialReadinessRequest(args);
      return mockSerialReadinessResponse(request);
    }
    case "firmware_flash_serial": {
      ensureMockLiveWriteAllowed("firmware_flash_serial");
      const request = validateFirmwareFlashSerialArgs(args);
      return mockFirmwareFlashSerialResult(request);
    }
    case "firmware_flash_dfu_recovery": {
      ensureMockLiveWriteAllowed("firmware_flash_dfu_recovery");
      const request = validateFirmwareFlashDfuRecoveryArgs(args);
      return mockFirmwareFlashDfuRecoveryResult(request);
    }
    case "connect_link":
      connectLink(args);
      if (isDemoConnectRequest(args)) {
        startDemoTimers();
      } else {
        clearDemoIntervals();
      }
      return undefined;
    case "log_open":
      {
        const { summary, events } = openMockLogWithProgress(args);
        mockState.logOpen = true;
        emitMany(events);
        return summary;
      }
    case "set_telemetry_rate":
      case "firmware_session_cancel":
      return undefined;
    case "set_message_rate":
      ensureMockLiveWriteAllowed("set_message_rate");
      return undefined;
    case "get_available_message_rates":
      return availableMessageRates();
    case "get_available_modes":
      return getAvailableModes();
    case "disconnect_link":
      cancelPendingMissionOperation();
      cancelParamOperation();
      cancelCompassCalibration();
      {
        const liveEnvelope = mockState.liveEnvelope;
        disconnectLink(args);
        if (liveEnvelope) {
          emitEvent("session://state", liveDisconnectedSessionPayload(liveEnvelope));
        }
      }
      return undefined;
    case "set_flight_mode":
      ensureMockLiveWriteAllowed("set_flight_mode");
      setFlightMode(args, emitEvent);
      return undefined;
    case "set_servo":
      ensureMockLiveWriteAllowed("set_servo");
      requireConnectedVehicle();
      validateSetServoArgs(args);
      return undefined;
    case "motor_test":
      ensureMockLiveWriteAllowed("motor_test");
      requireConnectedVehicle();
      validateMotorTestArgs(args);
      return undefined;
    case "rc_override":
      ensureMockLiveWriteAllowed("rc_override");
      requireConnectedVehicle();
      validateRcOverrideArgs(args);
      return undefined;
    case "arm_vehicle":
      ensureMockLiveWriteAllowed("arm_vehicle");
      requireConnectedVehicle();
      validateArmDisarmArgs(args, "arm_vehicle");
      syncLiveVehicleArmedState(true, emitEvent);
      return undefined;
    case "disarm_vehicle":
      ensureMockLiveWriteAllowed("disarm_vehicle");
      requireConnectedVehicle();
      validateArmDisarmArgs(args, "disarm_vehicle");
      syncLiveVehicleArmedState(false, emitEvent);
      return undefined;
    case "calibrate_accel":
    case "calibrate_gyro":
    case "calibrate_compass_accept":
    case "reboot_vehicle":
    case "request_prearm_checks": {
      ensureMockLiveWriteAllowed(cmd as
        | "calibrate_accel"
        | "calibrate_gyro"
        | "calibrate_compass_start"
        | "calibrate_compass_accept"
        | "calibrate_compass_cancel"
        | "reboot_vehicle"
        | "request_prearm_checks");
      requireConnectedVehicle();
      return undefined;
    }
    case "calibrate_compass_start":
      ensureMockLiveWriteAllowed("calibrate_compass_start");
      requireConnectedVehicle();
      await runCompassCalibration();
      return undefined;
    case "calibrate_compass_cancel":
      ensureMockLiveWriteAllowed("calibrate_compass_cancel");
      requireConnectedVehicle();
      cancelCompassCalibration();
      return undefined;
    case "param_download_all":
      requireConnectedVehicle();
      return downloadAllParams(emitEvent);
    case "param_cancel":
      requireConnectedVehicle();
      cancelParamOperation();
      return undefined;
    case "param_write":
      ensureMockLiveWriteAllowed("param_write");
      requireConnectedVehicle();
      return writeParam(args, emitEvent);
    case "param_write_batch":
      ensureMockLiveWriteAllowed("param_write_batch");
      requireConnectedVehicle();
      return writeParamBatch(args, emitEvent);
    case "param_parse_file":
      return parseParamFile(args);
    case "param_format_file":
      return formatParamFile(args);
    case "vehicle_takeoff":
      ensureMockLiveWriteAllowed("vehicle_takeoff");
      vehicleTakeoff(args);
      return undefined;
    case "start_guided_session":
      return startGuidedSession(args, emitEvent);
    case "update_guided_session":
      return updateGuidedSession(args, emitEvent);
    case "stop_guided_session":
      return stopGuidedSession();
    case "mission_upload": {
      ensureMockLiveWriteAllowed("mission_upload");
      const plan = validateUploadPlanArg(args, "mission_upload.plan");
      return runMissionTransfer({
        kind: "upload",
        direction: "upload",
        totalItems: plan.items.length,
        complete: () => {
          commitMockMissionPlan(plan);
          if (mockState.liveSimulator) {
            const missionState = currentMissionState();
            mockState.liveSimulator = setDemoSimulatorMission(
              mockState.liveSimulator,
              normalizeMissionPlan(plan),
              missionState.current_index,
            );
          }
          return undefined;
        },
      });
    }
    case "mission_clear":
      ensureMockLiveWriteAllowed("mission_clear");
      return runMissionTransfer({
        kind: "clear",
        direction: "upload",
        totalItems: currentMissionState().plan?.items.length ?? 0,
        complete: () => {
          clearMockMissionPlan();
          if (mockState.liveSimulator) {
            mockState.liveSimulator = setDemoSimulatorMission(mockState.liveSimulator, normalizeMissionPlan({ items: [] }), null);
          }
          return undefined;
        },
      });
    case "mission_set_current": {
      ensureMockLiveWriteAllowed("mission_set_current");
      requireConnectedVehicle();
      const seq = validateMissionSetCurrentArgs(args);
      const plan = currentMissionState().plan;
      if (plan && seq >= plan.items.length) {
        throw new Error(`mission_set_current.seq must be less than ${plan.items.length}`);
      }

      setMockMissionCurrentIndex(seq);
      if (mockState.liveSimulator) {
        mockState.liveSimulator = setDemoSimulatorMissionCurrentIndex(mockState.liveSimulator, seq);
      }
      publishMissionState(currentMissionState());
      return undefined;
    }
    case "mission_cancel":
      requireConnectedVehicle();
      cancelPendingMissionOperation();
      return undefined;
    case "fence_upload":
      ensureMockLiveWriteAllowed("fence_upload");
      requireConnectedVehicle();
      mockState.liveFencePlan = validateStructuredPlanArg(args, "fence_upload.plan");
      return undefined;
    case "fence_clear":
      ensureMockLiveWriteAllowed("fence_clear");
      requireConnectedVehicle();
      mockState.liveFencePlan = { return_point: null, regions: [] };
      return undefined;
    case "rally_upload":
      ensureMockLiveWriteAllowed("rally_upload");
      requireConnectedVehicle();
      mockState.liveRallyPlan = validateStructuredPlanArg(args, "rally_upload.plan");
      return undefined;
    case "rally_clear":
      ensureMockLiveWriteAllowed("rally_clear");
      requireConnectedVehicle();
      mockState.liveRallyPlan = { points: [] };
      return undefined;
    case "mission_download": {
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
    }
    case "mission_validate":
      requireConnectedVehicle();
      return missionValidateResult(args);
    case "fence_download":
      ensureMockLiveWriteAllowed("fence_download");
      return fenceDownloadResult();
    case "rally_download":
      ensureMockLiveWriteAllowed("rally_download");
      return rallyDownloadResult();
    case "log_close":
      mockState.logOpen = false;
      mockState.playbackEnvelope = null;
      mockState.pendingPlaybackEnvelope = null;
      mockState.playbackCursorUsec = null;
      closeMockLog();
      return undefined;
    default:
      throw new Error(`Unmocked command: ${cmd}`);
  }
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

      emitEvent("mission://progress", liveMissionProgressStreamEvent(missionProgress).payload);
    },
    emitParamStore(paramStore) {
      mockState.liveParamStore = structuredClone(paramStore);
      if (!mockState.liveEnvelope) {
        return;
      }

      emitEvent("param://store", liveParamStoreStreamEvent(paramStore).payload);
    },
    emitParamProgress(paramProgress) {
      mockState.liveParamProgress = structuredClone(paramProgress);
      if (!mockState.liveEnvelope) {
        return;
      }

      emitEvent("param://progress", liveParamProgressStreamEvent(paramProgress).payload);
    },
    emitLiveGuidedState(guidedState) {
      applyMockGuidedState(guidedState);
      emitEvent("guided://state", liveGuidedStreamEvent(guidedState).payload);
    },
    emitLogProgress(progress) {
      emitEvent("log://progress", emitProgressEvent(progress).payload);
    },
    emitPlaybackState(playbackState) {
      writeMockReplayState(playbackState);
      if (!mockState.playbackEnvelope) {
        return;
      }

      emitEvent("playback://state", playbackStateEvent(mockState.playbackEnvelope).payload);
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
