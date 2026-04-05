import {
  applyMockGuidedState,
  liveGuidedStreamEvent,
  startGuidedSession,
  stopGuidedSession,
  updateGuidedSession,
  vehicleTakeoff,
} from "./backend/guided";
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
  liveMissionProgressStreamEvent,
  liveMissionStateStreamEvent,
  missionDownloadResult,
} from "./backend/mission";
import {
  applyMockParamState,
  formatParamFile,
  liveParamProgressStreamEvent,
  liveParamStoreStreamEvent,
  parseParamFile,
  writeParamBatch,
} from "./backend/params";
import {
  commandBehaviors,
  deferredInvocations,
  invocations,
  mockState,
  resetGuided,
  resetMockState,
} from "./backend/runtime";
import { ackSessionSnapshotResult, openSessionSnapshotResult, playbackSeekResult } from "./backend/session";
import {
  applyMockLiveVehicleState,
  availableTransportDescriptors,
  connectLink,
  disconnectLink,
  emitLiveSessionState as emitLiveSessionStateUpdate,
  liveSessionStreamEvent,
  requireConnectedVehicle,
  syncLiveVehicleArmedState,
  validateArmDisarmArgs,
  validateMotorTestArgs,
  validateRcOverrideArgs,
  validateSetServoArgs,
} from "./backend/vehicle";
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

function defaultCommandResult(cmd: string, args: CommandArgs): unknown {
  switch (cmd) {
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
    case "recording_status":
      return "idle";
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
      const request = validateFirmwareFlashSerialArgs(args);
      return mockFirmwareFlashSerialResult(request);
    }
    case "firmware_flash_dfu_recovery": {
      const request = validateFirmwareFlashDfuRecoveryArgs(args);
      return mockFirmwareFlashDfuRecoveryResult(request);
    }
    case "connect_link":
      connectLink(args);
      return undefined;
    case "log_open":
      mockState.logOpen = true;
      return {
        file_name: "mock.tlog",
        start_usec: 0,
        end_usec: 0,
        duration_secs: 0,
        total_entries: 0,
        message_types: [],
        log_type: "tlog",
      };
    case "set_telemetry_rate":
    case "set_message_rate":
    case "firmware_session_cancel":
      return undefined;
    case "get_available_message_rates":
      return [
        { id: 33, name: "Global Position", default_rate_hz: 4.0 },
        { id: 30, name: "Attitude", default_rate_hz: 4.0 },
        { id: 24, name: "GPS Raw", default_rate_hz: 2.0 },
        { id: 1, name: "System Status", default_rate_hz: 1.0 },
        { id: 65, name: "RC Channels", default_rate_hz: 2.0 },
        { id: 36, name: "Servo Output", default_rate_hz: 2.0 },
        { id: 74, name: "VFR HUD", default_rate_hz: 4.0 },
        { id: 62, name: "Nav Controller", default_rate_hz: 2.0 },
      ];
    case "get_available_modes":
      return [];
    case "disconnect_link":
      disconnectLink(args);
      return undefined;
    case "set_servo":
      requireConnectedVehicle();
      validateSetServoArgs(args);
      return undefined;
    case "motor_test":
      requireConnectedVehicle();
      validateMotorTestArgs(args);
      return undefined;
    case "rc_override":
      requireConnectedVehicle();
      validateRcOverrideArgs(args);
      return undefined;
    case "arm_vehicle":
      requireConnectedVehicle();
      validateArmDisarmArgs(args, "arm_vehicle");
      syncLiveVehicleArmedState(true, emitEvent);
      return undefined;
    case "disarm_vehicle":
      requireConnectedVehicle();
      validateArmDisarmArgs(args, "disarm_vehicle");
      syncLiveVehicleArmedState(false, emitEvent);
      return undefined;
    case "calibrate_accel":
    case "calibrate_gyro":
    case "calibrate_compass_start":
    case "calibrate_compass_accept":
    case "calibrate_compass_cancel":
    case "reboot_vehicle":
    case "request_prearm_checks":
      requireConnectedVehicle();
      return undefined;
    case "param_write_batch":
      requireConnectedVehicle();
      return writeParamBatch(args, emitEvent);
    case "param_parse_file":
      return parseParamFile(args);
    case "param_format_file":
      return formatParamFile(args);
    case "vehicle_takeoff":
      vehicleTakeoff(args);
      return undefined;
    case "start_guided_session":
      return startGuidedSession(args, emitEvent);
    case "update_guided_session":
      return updateGuidedSession(args, emitEvent);
    case "stop_guided_session":
      return stopGuidedSession();
    case "mission_upload":
    case "mission_clear":
    case "mission_set_current":
    case "mission_cancel":
    case "fence_upload":
    case "fence_clear":
    case "rally_upload":
    case "rally_clear":
      return undefined;
    case "mission_download":
      return missionDownloadResult();
    case "mission_validate":
      return [];
    case "fence_download":
      return {
        return_point: { latitude_deg: 47.397, longitude_deg: 8.545 },
        regions: [
          {
            inclusion_polygon: {
              vertices: [
                { latitude_deg: 47.39, longitude_deg: 8.53 },
                { latitude_deg: 47.41, longitude_deg: 8.53 },
                { latitude_deg: 47.41, longitude_deg: 8.56 },
                { latitude_deg: 47.39, longitude_deg: 8.56 },
              ],
              inclusion_group: 0,
            },
          },
        ],
      };
    case "rally_download":
      return {
        points: [
          { RelHome: { latitude_deg: 47.397, longitude_deg: 8.545, relative_alt_m: 30 } },
        ],
      };
    case "log_close":
      mockState.logOpen = false;
      mockState.playbackEnvelope = null;
      mockState.pendingPlaybackEnvelope = null;
      mockState.playbackCursorUsec = null;
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

  const behavior = commandBehaviors.get(cmd);
  if (behavior) {
    return runBehavior<T>(cmd, behavior);
  }

  return defaultCommandResult(cmd, args) as T;
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
      rejectAllDeferred("Mock platform reset");
      resetMockState();
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
      applyMockMissionState(missionState);
      if (!mockState.liveEnvelope) {
        return;
      }

      emitEvent("mission://state", liveMissionStateStreamEvent(missionState).payload);
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
