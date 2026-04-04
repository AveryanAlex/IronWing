import type { MissionState, TransferProgress } from "../../../mission";
import type { ParamProgress, ParamStore } from "../../../params";
import type {
  CatalogEntry,
  CatalogTargetSummary,
  DfuDeviceInfo,
  DfuRecoveryResult,
  DfuScanResult,
  InventoryResult,
  PortInfo,
  SerialFlowResult,
  SerialPreflightInfo,
  SerialReadinessBlockedReason,
  SerialReadinessRequest,
  SerialReadinessResponse,
} from "../../../firmware";

export type CommandArgs = Record<string, unknown> | undefined;

export type SessionEnvelope = {
  session_id: string;
  source_kind: "live" | "playback";
  seek_epoch: number;
  reset_revision: number;
};

export type SessionConnection =
  | { kind: "connecting" }
  | { kind: "connected" }
  | { kind: "disconnected" }
  | { kind: "error"; error: string };

export type TransportDescriptor =
  | {
    kind: "udp";
    label: string;
    available: boolean;
    validation: { bind_addr_required: boolean };
  }
  | {
    kind: "tcp";
    label: string;
    available: boolean;
    validation: { address_required: boolean };
  }
  | {
    kind: "serial";
    label: string;
    available: boolean;
    validation: { port_required: boolean; baud_required: boolean };
    default_baud: number;
  }
  | {
    kind: "bluetooth_ble" | "bluetooth_spp";
    label: string;
    available: boolean;
    validation: { address_required: boolean };
  };

export type MockLiveVehicleState = {
  armed: boolean;
  custom_mode: number;
  mode_name: string;
  system_status: string;
  vehicle_type: string;
  autopilot: string;
  system_id: number;
  component_id: number;
  heartbeat_received: boolean;
};

export type MockMissionState = MissionState;
export type MockMissionProgressState = TransferProgress;
export type MockParamStoreState = ParamStore;
export type MockParamProgressState = ParamProgress;

export type MockGuidedBlockingReason =
  | "live_session_required"
  | "playback"
  | "vehicle_disarmed"
  | "vehicle_mode_incompatible"
  | "operation_in_progress"
  | "stop_unsupported";

export type MockGuidedStateValue = {
  status: "idle" | "active" | "blocked" | "unavailable";
  session: null | { kind: "goto"; latitude_deg: number; longitude_deg: number; altitude_m: number };
  entered_at_unix_msec: number | null;
  blocking_reason: MockGuidedBlockingReason | null;
  termination: null | { reason: "disconnect" | "mode_change" | "source_switch" | "vehicle_missing"; at_unix_msec: number; message: string };
  last_command: null | { operation_id: "start_guided_session" | "update_guided_session" | "stop_guided_session"; session_kind: "goto" | null; at_unix_msec: number };
  actions: {
    start: { allowed: boolean; blocking_reason: MockGuidedBlockingReason | null };
    update: { allowed: boolean; blocking_reason: MockGuidedBlockingReason | null };
    stop: { allowed: boolean; blocking_reason: MockGuidedBlockingReason | null };
  };
};

export type MockBackendState = {
  liveEnvelope: SessionEnvelope | null;
  playbackEnvelope: SessionEnvelope | null;
  pendingLiveEnvelope: { envelope: SessionEnvelope; opened_at_unix_msec: number } | null;
  pendingPlaybackEnvelope: { envelope: SessionEnvelope; opened_at_unix_msec: number } | null;
  nextSessionId: number;
  nextSeekEpoch: number;
  resetRevision: number;
  lastSourceKind: "live" | "playback" | null;
  playbackCursorUsec: number | null;
  logOpen: boolean;
  liveVehicleAvailable: boolean;
  liveVehicleState: MockLiveVehicleState | null;
  liveMissionState: MockMissionState | null;
  liveParamStore: MockParamStoreState | null;
  liveParamProgress: MockParamProgressState | null;
  liveVehicleArmed: boolean;
  liveVehicleModeName: string;
  guidedTermination: null | { reason: "disconnect" | "mode_change" | "source_switch" | "vehicle_missing"; at_unix_msec: number; message: string };
  guidedLastCommand: MockGuidedStateValue["last_command"];
  guided: null | {
    session: { kind: "goto"; latitude_deg: number; longitude_deg: number; altitude_m: number };
    entered_at_unix_msec: number;
  };
};

export type MockPlatformEvent = {
  event: string;
  payload: unknown;
};

export type MockCommandBehavior =
  | {
    type: "resolve";
    result?: unknown;
    emit?: MockPlatformEvent[];
    delayMs?: number;
  }
  | {
    type: "reject";
    error: string;
    emit?: MockPlatformEvent[];
    delayMs?: number;
  }
  | {
    type: "defer";
  };

export type MockInvocation = {
  cmd: string;
  args: CommandArgs;
};

export type DeferredInvocation = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

export type MockPlatformController = {
  reset: () => void;
  setCommandBehavior: (cmd: string, behavior: MockCommandBehavior) => void;
  clearCommandBehavior: (cmd: string) => void;
  resolveDeferred: (cmd: string, result?: unknown, emit?: MockPlatformEvent[]) => boolean;
  rejectDeferred: (cmd: string, error: string, emit?: MockPlatformEvent[]) => boolean;
  emit: (event: string, payload: unknown) => void;
  emitLiveSessionState: (vehicleState: MockLiveVehicleState) => void;
  emitMissionState: (missionState: MockMissionState) => void;
  emitMissionProgress: (missionProgress: MockMissionProgressState) => void;
  emitParamStore: (paramStore: MockParamStoreState) => void;
  emitParamProgress: (paramProgress: MockParamProgressState) => void;
  emitLiveGuidedState: (guidedState: MockGuidedStateValue) => void;
  resolveDeferredConnectLink: (params: {
    vehicleState: MockLiveVehicleState;
    missionState?: MockMissionState;
    paramStore?: MockParamStoreState;
    paramProgress?: MockParamProgressState;
    guidedState: MockGuidedStateValue;
  }) => boolean;
  getInvocations: () => MockInvocation[];
  getLiveEnvelope: () => SessionEnvelope | null;
};

export type FirmwareModuleTypes = {
  CatalogEntry: CatalogEntry;
  CatalogTargetSummary: CatalogTargetSummary;
  DfuDeviceInfo: DfuDeviceInfo;
  DfuRecoveryResult: DfuRecoveryResult;
  DfuScanResult: DfuScanResult;
  InventoryResult: InventoryResult;
  PortInfo: PortInfo;
  SerialFlowResult: SerialFlowResult;
  SerialPreflightInfo: SerialPreflightInfo;
  SerialReadinessBlockedReason: SerialReadinessBlockedReason;
  SerialReadinessRequest: SerialReadinessRequest;
  SerialReadinessResponse: SerialReadinessResponse;
};
