type CommandArgs = Record<string, unknown> | undefined;

import type { MissionState, TransferProgress } from "../../mission";
import type { ParamProgress, ParamStore } from "../../params";
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
} from "../../firmware";

type SessionEnvelope = {
  session_id: string;
  source_kind: "live" | "playback";
  seek_epoch: number;
  reset_revision: number;
};

type SessionConnection =
  | { kind: "connecting" }
  | { kind: "connected" }
  | { kind: "disconnected" }
  | { kind: "error"; error: string };

type TransportDescriptor =
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

type MockGuidedBlockingReason =
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

type MockBackendState = {
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

function currentGuidedSourceKind(): "live" | "playback" {
  return mockState.playbackEnvelope
    ? "playback"
    : "live";
}

function resetGuided(reason: "disconnect" | "source_switch", message: string) {
  mockState.guided = null;
  mockState.guidedTermination = {
    reason,
    at_unix_msec: Date.now(),
    message,
  };
}

function normalizedLiveVehicleState(mockVehicleState?: Partial<MockLiveVehicleState> & { modeName?: string } | null): MockLiveVehicleState {
  const modeName = mockVehicleState?.mode_name ?? mockVehicleState?.modeName ?? "Stabilize";
  return {
    armed: mockVehicleState?.armed ?? false,
    custom_mode: mockVehicleState?.custom_mode ?? (modeName.toUpperCase() === "GUIDED" ? 4 : 0),
    mode_name: modeName,
    system_status: mockVehicleState?.system_status ?? "active",
    vehicle_type: mockVehicleState?.vehicle_type ?? "quadrotor",
    autopilot: mockVehicleState?.autopilot ?? "ardu_pilot_mega",
    system_id: mockVehicleState?.system_id ?? 1,
    component_id: mockVehicleState?.component_id ?? 1,
    heartbeat_received: mockVehicleState?.heartbeat_received ?? true,
  };
}

function applyMockLiveVehicleState(mockVehicleState?: Partial<MockLiveVehicleState> & { modeName?: string } | null) {
  const normalized = normalizedLiveVehicleState(mockVehicleState);
  mockState.liveVehicleAvailable = true;
  mockState.liveVehicleState = normalized;
  mockState.liveVehicleArmed = normalized.armed;
  mockState.liveVehicleModeName = normalized.mode_name;
}

function normalizedMissionState(mockMissionState?: Partial<MockMissionState> | null): MockMissionState {
  return {
    plan: mockMissionState?.plan ?? null,
    current_index: mockMissionState?.current_index ?? null,
    sync: mockMissionState?.sync ?? "current",
    active_op: mockMissionState?.active_op ?? null,
  };
}

function applyMockMissionState(mockMissionState?: Partial<MockMissionState> | null) {
  mockState.liveMissionState = normalizedMissionState(mockMissionState);
}

function normalizedParamStore(mockParamStore?: MockParamStoreState | null): MockParamStoreState {
  return structuredClone(mockParamStore ?? {
    params: {},
    expected_count: 0,
  });
}

function normalizedParamProgress(mockParamProgress?: MockParamProgressState | null): MockParamProgressState | null {
  return mockParamProgress ?? null;
}

function applyMockParamState(
  mockParamStore?: MockParamStoreState | null,
  mockParamProgress?: MockParamProgressState | null,
) {
  mockState.liveParamStore = normalizedParamStore(mockParamStore);
  mockState.liveParamProgress = normalizedParamProgress(mockParamProgress);
}

function applyMockGuidedState(guidedState: MockGuidedStateValue) {
  mockState.guidedTermination = guidedState.termination;
  mockState.guidedLastCommand = guidedState.last_command;

  if (guidedState.session) {
    mockState.guided = {
      session: guidedState.session,
      entered_at_unix_msec: guidedState.entered_at_unix_msec ?? 0,
    };
    return;
  }

  mockState.guided = null;
}

function guidedActionsForIdleState() {
  const isGuidedMode = mockState.liveVehicleModeName.toUpperCase() === "GUIDED";
  if (!mockState.liveVehicleArmed) {
    return {
      start: { allowed: false, blocking_reason: "vehicle_disarmed" },
      update: { allowed: false, blocking_reason: "vehicle_disarmed" },
      stop: { allowed: false, blocking_reason: "live_session_required" },
    };
  }

  return {
    start: { allowed: isGuidedMode, blocking_reason: isGuidedMode ? null : "vehicle_mode_incompatible" },
    update: { allowed: false, blocking_reason: "live_session_required" },
    stop: { allowed: false, blocking_reason: "live_session_required" },
  };
}

function guidedBlockingMessage(reason: MockGuidedBlockingReason): string {
  switch (reason) {
    case "vehicle_disarmed":
      return "guided control requires an armed vehicle";
    case "vehicle_mode_incompatible":
      return "guided control requires GUIDED mode";
    case "live_session_required":
    default:
      return "guided control requires a live vehicle session";
  }
}

function rejectGuidedContext(operationId: "start_guided_session" | "update_guided_session" | "stop_guided_session") {
  if (currentGuidedSourceKind() === "playback") {
    return {
      result: "rejected",
      failure: {
        operation_id: operationId,
        reason: { kind: "unavailable", message: "guided control is unavailable in playback" },
        retryable: false,
        fatality_scope: "operation",
        detail: { kind: "source_kind", source_kind: "playback" },
      },
    };
  }

  const guidedState = liveGuidedDomain("stream").value;
  if (!guidedState) {
    return null;
  }

  const action = operationId === "start_guided_session"
    ? guidedState.actions.start
    : operationId === "update_guided_session"
      ? guidedState.actions.update
      : guidedState.actions.stop;

  if (action.allowed) {
    return null;
  }

  if (guidedState.blocking_reason === "vehicle_disarmed") {
    return {
      result: "rejected",
      failure: {
        operation_id: operationId,
        reason: { kind: "conflict", message: guidedBlockingMessage("vehicle_disarmed") },
        retryable: true,
        fatality_scope: "operation",
        detail: { kind: "blocking_reason", blocking_reason: "vehicle_disarmed" },
      },
    };
  }

  if (action.blocking_reason === "live_session_required" && guidedState.status === "unavailable") {
    return {
      result: "rejected",
      failure: {
        operation_id: operationId,
        reason: { kind: "unavailable", message: guidedBlockingMessage(action.blocking_reason) },
        retryable: true,
        fatality_scope: "session",
        detail: { kind: "blocking_reason", blocking_reason: action.blocking_reason },
      },
    };
  }

  if (
    operationId !== "start_guided_session"
    && action.blocking_reason === "live_session_required"
    && guidedState.session === null
    && guidedState.actions.start.blocking_reason === "vehicle_mode_incompatible"
  ) {
    return {
      result: "rejected",
      failure: {
        operation_id: operationId,
        reason: { kind: "conflict", message: guidedBlockingMessage("vehicle_mode_incompatible") },
        retryable: true,
        fatality_scope: "operation",
        detail: { kind: "blocking_reason", blocking_reason: "vehicle_mode_incompatible" },
      },
    };
  }

  if (action.blocking_reason === "vehicle_disarmed" || action.blocking_reason === "vehicle_mode_incompatible") {
    return {
      result: "rejected",
      failure: {
        operation_id: operationId,
        reason: { kind: "conflict", message: guidedBlockingMessage(action.blocking_reason) },
        retryable: true,
        fatality_scope: "operation",
        detail: { kind: "blocking_reason", blocking_reason: action.blocking_reason },
      },
    };
  }

  return null;
}

function takeoffContextError(): string | null {
  if (currentGuidedSourceKind() === "playback") {
    return "guided control is unavailable in playback";
  }

  const guidedState = liveGuidedDomain("stream").value;
  if (!guidedState) {
    return "guided control requires a live vehicle session";
  }

  const blockingReason = guidedState.actions.start.blocking_reason as MockGuidedBlockingReason | null;
  if (!guidedState.actions.start.allowed && blockingReason) {
    return guidedBlockingMessage(blockingReason);
  }

  return null;
}

function requireConnectedVehicle() {
  if (!mockState.liveVehicleAvailable) {
    throw new Error("not connected");
  }
}

function requireFiniteInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`missing or invalid ${label}`);
  }

  return value;
}

function validateSetServoArgs(args: CommandArgs) {
  const instance = requireFiniteInteger(args?.instance, "set_servo.instance");
  const pwmUs = requireFiniteInteger(args?.pwmUs, "set_servo.pwmUs");

  if (instance < 1 || instance > 16) {
    throw new Error(`set_servo instance must be in 1..=16, got ${instance}`);
  }
  if (pwmUs < 1000 || pwmUs > 2000) {
    throw new Error(`set_servo pwm_us must be in 1000..=2000 microseconds, got ${pwmUs}`);
  }
}

function validateRcOverrideArgs(args: CommandArgs) {
  if (!Array.isArray(args?.channels)) {
    throw new Error("missing or invalid rc_override.channels");
  }

  for (const [index, entry] of args.channels.entries()) {
    if (!entry || typeof entry !== "object") {
      throw new Error(`missing or invalid rc_override.channels[${index}]`);
    }

    const channel = requireFiniteInteger((entry as { channel?: unknown }).channel, `rc_override.channels[${index}].channel`);
    if (channel < 1 || channel > 18) {
      throw new Error(`rc override channel must be 1..=18, got ${channel}`);
    }

    const value = (entry as { value?: unknown }).value;
    if (!value || typeof value !== "object") {
      throw new Error(`missing or invalid rc_override.channels[${index}].value`);
    }

    const kind = (value as { kind?: unknown }).kind;
    if (kind !== "ignore" && kind !== "release" && kind !== "pwm") {
      throw new Error(`missing or invalid rc_override.channels[${index}].value.kind`);
    }

    if (kind === "pwm") {
      const pwmUs = requireFiniteInteger((value as { pwm_us?: unknown }).pwm_us, `rc_override.channels[${index}].value.pwm_us`);
      if (pwmUs === 0) {
        throw new Error("rc override pwm 0 is reserved for release; use RcOverrideChannelValue::Release or RcOverride::release()");
      }
      if (pwmUs === 65535) {
        throw new Error("rc override pwm 65535 is reserved for ignore; use RcOverrideChannelValue::Ignore or RcOverride::ignore()");
      }
    }
  }
}

function emitGuidedStateIfLiveActive() {
  if (!mockState.liveEnvelope) {
    return;
  }

  emitEvent("guided://state", { envelope: mockState.liveEnvelope, value: liveGuidedDomain("stream") });
}

function requireLiveEnvelope() {
  if (!mockState.liveEnvelope) {
    throw new Error("live envelope is not active");
  }

  return mockState.liveEnvelope;
}

function liveSessionStreamEvent(vehicleState: MockLiveVehicleState): MockPlatformEvent {
  return {
    event: "session://state",
    payload: {
      envelope: requireLiveEnvelope(),
      value: {
        available: true,
        complete: true,
        provenance: "stream",
        value: {
          status: "active",
          connection: { kind: "connected" },
          vehicle_state: vehicleState,
          home_position: null,
        },
      },
    },
  };
}

function liveGuidedStreamEvent(guidedState: MockGuidedStateValue): MockPlatformEvent {
  return {
    event: "guided://state",
    payload: {
      envelope: requireLiveEnvelope(),
      value: {
        available: true,
        complete: true,
        provenance: "stream",
        value: guidedState,
      },
    },
  };
}

function liveMissionStateStreamEvent(missionState: MockMissionState): MockPlatformEvent {
  return {
    event: "mission://state",
    payload: {
      envelope: requireLiveEnvelope(),
      value: missionState,
    },
  };
}

function liveMissionProgressStreamEvent(missionProgress: MockMissionProgressState): MockPlatformEvent {
  return {
    event: "mission://progress",
    payload: {
      envelope: requireLiveEnvelope(),
      value: missionProgress,
    },
  };
}

function liveParamStoreStreamEvent(paramStore: MockParamStoreState): MockPlatformEvent {
  return {
    event: "param://store",
    payload: {
      envelope: requireLiveEnvelope(),
      value: paramStore,
    },
  };
}

function liveParamProgressStreamEvent(paramProgress: MockParamProgressState): MockPlatformEvent {
  return {
    event: "param://progress",
    payload: {
      envelope: requireLiveEnvelope(),
      value: paramProgress,
    },
  };
}

function guidedModeCompatibilityReason() {
  return mockState.liveVehicleModeName.toUpperCase() === "GUIDED" ? null : "vehicle_mode_incompatible";
}

function reconcileGuidedAfterLiveVehicleUpdate(): MockGuidedStateValue | null {
  if (!mockState.guided) {
    return null;
  }

  if (!mockState.liveVehicleArmed || guidedModeCompatibilityReason() !== null) {
    mockState.guided = null;
    mockState.guidedTermination = {
      reason: "mode_change",
      at_unix_msec: Date.now(),
      message: !mockState.liveVehicleArmed
        ? "vehicle disarmed during guided session"
        : "vehicle left guided mode",
    };
    return liveGuidedDomain("stream").value as MockGuidedStateValue;
  }

  return null;
}

function playbackTelemetryDomain() {
  return {
    available: true,
    complete: true,
    provenance: "playback",
    value: {
      flight: { altitude_m: null, speed_mps: null, climb_rate_mps: null, throttle_pct: null, airspeed_mps: null },
      navigation: { latitude_deg: null, longitude_deg: null, heading_deg: null, wp_dist_m: null, nav_bearing_deg: null, target_bearing_deg: null, xtrack_error_m: null },
      attitude: { roll_deg: null, pitch_deg: null, yaw_deg: null },
      power: { battery_pct: null, battery_voltage_v: null, battery_current_a: null, battery_voltage_cells: null, energy_consumed_wh: null, battery_time_remaining_s: null },
      gps: { fix_type: null, satellites: null, hdop: null },
      terrain: { terrain_height_m: null, height_above_terrain_m: null },
      radio: { rc_channels: null, rc_rssi: null, servo_outputs: null },
    },
  };
}

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

type DeferredInvocation = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

const PENDING_SESSION_TTL_MS = 2_000;

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

declare global {
  interface Window {
    __IRONWING_MOCK_PLATFORM__?: MockPlatformController;
  }
}

const eventTarget = new EventTarget();
const commandBehaviors = new Map<string, MockCommandBehavior>();
const deferredInvocations = new Map<string, DeferredInvocation[]>();
const invocations: MockInvocation[] = [];
const mockState: MockBackendState = {
  liveEnvelope: null,
  playbackEnvelope: null,
  pendingLiveEnvelope: null,
  pendingPlaybackEnvelope: null,
  nextSessionId: 2,
  nextSeekEpoch: 0,
  resetRevision: 0,
  lastSourceKind: null,
  playbackCursorUsec: null,
  logOpen: false,
  liveVehicleAvailable: false,
  liveVehicleState: null,
  liveMissionState: null,
  liveParamStore: null,
  liveParamProgress: null,
  liveVehicleArmed: false,
  liveVehicleModeName: "Stabilize",
  guidedTermination: null,
  guidedLastCommand: null,
  guided: null,
};

const DEFAULT_FIRMWARE_PORTS: PortInfo[] = [
  {
    port_name: "/dev/ttyACM0",
    vid: null,
    pid: null,
    serial_number: null,
    manufacturer: "Hex",
    product: null,
    location: null,
  },
];

const DEFAULT_DFU_DEVICES: DfuDeviceInfo[] = [
  {
    vid: 0x0483,
    pid: 0xdf11,
    unique_id: "mock-dfu-1",
    serial_number: "DFU0001",
    manufacturer: "STMicroelectronics",
    product: "STM32 BOOTLOADER",
  },
];

const DEFAULT_FIRMWARE_CATALOG_ENTRIES: CatalogEntry[] = [
  {
    board_id: 140,
    platform: "CubeOrange",
    vehicle_type: "Copter",
    version: "4.5.0",
    version_type: "stable",
    format: "apj",
    url: "https://example.com/cubeorange-copter.apj",
    image_size: 123_456,
    latest: true,
    git_sha: "abc1234",
    brand_name: "Cube Orange",
    manufacturer: "Hex",
  },
  {
    board_id: 140,
    platform: "CubeOrange",
    vehicle_type: "Plane",
    version: "4.5.0",
    version_type: "stable",
    format: "apj",
    url: "https://example.com/cubeorange-plane.apj",
    image_size: 123_400,
    latest: false,
    git_sha: "abc5678",
    brand_name: "Cube Orange",
    manufacturer: "Hex",
  },
  {
    board_id: 9,
    platform: "fmuv2",
    vehicle_type: "Plane",
    version: "4.4.0",
    version_type: "stable",
    format: "apj",
    url: "https://example.com/fmuv2-plane.apj",
    image_size: 119_500,
    latest: true,
    git_sha: "def1234",
    brand_name: null,
    manufacturer: null,
  },
];

function firmwareCatalogTargetsFromEntries(entries: CatalogEntry[]): CatalogTargetSummary[] {
  const grouped = new Map<string, CatalogTargetSummary>();

  for (const entry of entries) {
    const key = `${entry.board_id}:${entry.platform}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        board_id: entry.board_id,
        platform: entry.platform,
        brand_name: entry.brand_name,
        manufacturer: entry.manufacturer,
        vehicle_types: [entry.vehicle_type],
        latest_version: entry.latest ? entry.version : entry.version ?? null,
      });
      continue;
    }

    if (!existing.vehicle_types.includes(entry.vehicle_type)) {
      existing.vehicle_types.push(entry.vehicle_type);
      existing.vehicle_types.sort((left, right) => left.localeCompare(right));
    }
    if (entry.latest) {
      existing.latest_version = entry.version;
    }
    if (existing.brand_name === null && entry.brand_name !== null) {
      existing.brand_name = entry.brand_name;
    }
    if (existing.manufacturer === null && entry.manufacturer !== null) {
      existing.manufacturer = entry.manufacturer;
    }
  }

  return Array.from(grouped.values()).sort((left, right) => left.platform.localeCompare(right.platform));
}

const DEFAULT_FIRMWARE_CATALOG_TARGETS = firmwareCatalogTargetsFromEntries(DEFAULT_FIRMWARE_CATALOG_ENTRIES);
const DEFAULT_RECOVERY_CATALOG_TARGETS = DEFAULT_FIRMWARE_CATALOG_TARGETS.filter((target) => target.platform === "CubeOrange");

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function defaultFirmwarePorts(): PortInfo[] {
  return cloneValue(DEFAULT_FIRMWARE_PORTS);
}

function defaultDfuDevices(): DfuDeviceInfo[] {
  return cloneValue(DEFAULT_DFU_DEVICES);
}

function defaultFirmwareCatalogEntries(): CatalogEntry[] {
  return cloneValue(DEFAULT_FIRMWARE_CATALOG_ENTRIES);
}

function defaultFirmwareCatalogTargets(): CatalogTargetSummary[] {
  return cloneValue(DEFAULT_FIRMWARE_CATALOG_TARGETS);
}

function defaultRecoveryCatalogTargets(): CatalogTargetSummary[] {
  return cloneValue(DEFAULT_RECOVERY_CATALOG_TARGETS);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`missing or invalid ${label}`);
  }

  return value as Record<string, unknown>;
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`missing or invalid ${label}`);
  }

  return value;
}

function requireByteArray(value: unknown, label: string): number[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "number" || !Number.isFinite(entry) || !Number.isInteger(entry))) {
    throw new Error(`missing or invalid ${label}`);
  }

  return value as number[];
}

function mockSerialPreflightInfo(): SerialPreflightInfo {
  const availablePorts = defaultFirmwarePorts();
  const paramCount = mockState.liveParamStore
    ? Object.keys(mockState.liveParamStore.params).length
    : 0;

  return {
    vehicle_connected: mockState.liveVehicleAvailable,
    param_count: paramCount,
    has_params_to_backup: paramCount > 0,
    available_ports: availablePorts,
    detected_board_id: null,
    session_ready: true,
    session_status: { kind: "idle" },
  };
}

function mockInventoryResult(): InventoryResult {
  return { kind: "available", ports: defaultFirmwarePorts() };
}

function mockDfuScanResult(): DfuScanResult {
  return { kind: "available", devices: defaultDfuDevices() };
}

function validateFirmwareCatalogEntriesArgs(args: CommandArgs): { boardId: number; platform: string | undefined } {
  const boardId = requireFiniteInteger(args?.boardId, "firmware_catalog_entries.boardId");
  if (boardId <= 0) {
    throw new Error("firmware_catalog_entries.boardId must be greater than 0");
  }

  const rawPlatform = args?.platform;
  if (rawPlatform !== undefined && rawPlatform !== null && typeof rawPlatform !== "string") {
    throw new Error("missing or invalid firmware_catalog_entries.platform");
  }

  return { boardId, platform: rawPlatform ?? undefined };
}

function validateSerialReadinessRequest(args: CommandArgs): SerialReadinessRequest {
  const request = requireRecord(args?.request, "firmware_serial_readiness.request");
  if (typeof request.port !== "string") {
    throw new Error("missing or invalid firmware_serial_readiness.request.port");
  }
  const source = requireRecord(request.source, "firmware_serial_readiness.request.source");
  const kind = requireNonEmptyString(source.kind, "firmware_serial_readiness.request.source.kind");

  let normalizedSource: SerialReadinessRequest["source"];
  if (kind === "catalog_url") {
    if (typeof source.url !== "string") {
      throw new Error("missing or invalid firmware_serial_readiness.request.source.url");
    }
    normalizedSource = {
      kind,
      url: source.url,
    };
  } else if (kind === "local_apj_bytes") {
    normalizedSource = {
      kind,
      data: requireByteArray(source.data, "firmware_serial_readiness.request.source.data"),
    };
  } else {
    throw new Error("missing or invalid firmware_serial_readiness.request.source.kind");
  }

  const rawOptions = request.options;
  let options: SerialReadinessRequest["options"] | undefined;
  if (rawOptions !== undefined && rawOptions !== null) {
    const optionsRecord = requireRecord(rawOptions, "firmware_serial_readiness.request.options");
    if (typeof optionsRecord.full_chip_erase !== "boolean") {
      throw new Error("missing or invalid firmware_serial_readiness.request.options.full_chip_erase");
    }
    options = { full_chip_erase: optionsRecord.full_chip_erase };
  }

  return { port: request.port, source: normalizedSource, options };
}

function validateFirmwareFlashSerialArgs(args: CommandArgs): {
  port: string;
  baud: number;
  source: { kind: "catalog_url"; url: string } | { kind: "local_apj_bytes"; data: number[] };
  options: { full_chip_erase: boolean } | null;
} {
  const request = requireRecord(args?.request, "firmware_flash_serial.request");
  const port = requireNonEmptyString(request.port, "firmware_flash_serial.request.port");
  const baud = requireFiniteInteger(request.baud, "firmware_flash_serial.request.baud");
  if (baud <= 0) {
    throw new Error("firmware_flash_serial.request.baud must be greater than 0");
  }

  const source = requireRecord(request.source, "firmware_flash_serial.request.source");
  const kind = requireNonEmptyString(source.kind, "firmware_flash_serial.request.source.kind");
  let normalizedSource: { kind: "catalog_url"; url: string } | { kind: "local_apj_bytes"; data: number[] };
  if (kind === "catalog_url") {
    normalizedSource = {
      kind: "catalog_url",
      url: requireNonEmptyString(source.url, "firmware_flash_serial.request.source.url"),
    };
  } else if (kind === "local_apj_bytes") {
    normalizedSource = {
      kind: "local_apj_bytes",
      data: requireByteArray(source.data, "firmware_flash_serial.request.source.data"),
    };
  } else {
    throw new Error("missing or invalid firmware_flash_serial.request.source.kind");
  }

  let options: { full_chip_erase: boolean } | null = null;
  if (request.options !== undefined && request.options !== null) {
    const optionsRecord = requireRecord(request.options, "firmware_flash_serial.request.options");
    if (typeof optionsRecord.full_chip_erase !== "boolean") {
      throw new Error("missing or invalid firmware_flash_serial.request.options.full_chip_erase");
    }
    options = { full_chip_erase: optionsRecord.full_chip_erase };
  }

  return { port, baud, source: normalizedSource, options };
}

function validateFirmwareFlashDfuRecoveryArgs(args: CommandArgs): {
  device: DfuDeviceInfo;
  source:
    | { kind: "official_bootloader"; board_target: string }
    | { kind: "local_apj_bytes"; data: number[] }
    | { kind: "local_bin_bytes"; data: number[] };
} {
  const request = requireRecord(args?.request, "firmware_flash_dfu_recovery.request");
  const deviceRecord = requireRecord(request.device, "firmware_flash_dfu_recovery.request.device");
  const device: DfuDeviceInfo = {
    vid: requireFiniteInteger(deviceRecord.vid, "firmware_flash_dfu_recovery.request.device.vid"),
    pid: requireFiniteInteger(deviceRecord.pid, "firmware_flash_dfu_recovery.request.device.pid"),
    unique_id: requireNonEmptyString(deviceRecord.unique_id, "firmware_flash_dfu_recovery.request.device.unique_id"),
    serial_number: deviceRecord.serial_number === null || typeof deviceRecord.serial_number === "string"
      ? (deviceRecord.serial_number as string | null)
      : (() => { throw new Error("missing or invalid firmware_flash_dfu_recovery.request.device.serial_number"); })(),
    manufacturer: deviceRecord.manufacturer === null || typeof deviceRecord.manufacturer === "string"
      ? (deviceRecord.manufacturer as string | null)
      : (() => { throw new Error("missing or invalid firmware_flash_dfu_recovery.request.device.manufacturer"); })(),
    product: deviceRecord.product === null || typeof deviceRecord.product === "string"
      ? (deviceRecord.product as string | null)
      : (() => { throw new Error("missing or invalid firmware_flash_dfu_recovery.request.device.product"); })(),
  };

  const sourceRecord = requireRecord(request.source, "firmware_flash_dfu_recovery.request.source");
  const kind = requireNonEmptyString(sourceRecord.kind, "firmware_flash_dfu_recovery.request.source.kind");
  let source:
    | { kind: "official_bootloader"; board_target: string }
    | { kind: "local_apj_bytes"; data: number[] }
    | { kind: "local_bin_bytes"; data: number[] };
  if (kind === "official_bootloader") {
    source = {
      kind: "official_bootloader",
      board_target: requireNonEmptyString(sourceRecord.board_target, "firmware_flash_dfu_recovery.request.source.board_target"),
    };
  } else if (kind === "local_apj_bytes") {
    source = {
      kind: "local_apj_bytes",
      data: requireByteArray(sourceRecord.data, "firmware_flash_dfu_recovery.request.source.data"),
    };
  } else if (kind === "local_bin_bytes") {
    source = {
      kind: "local_bin_bytes",
      data: requireByteArray(sourceRecord.data, "firmware_flash_dfu_recovery.request.source.data"),
    };
  } else {
    throw new Error("missing or invalid firmware_flash_dfu_recovery.request.source.kind");
  }

  return { device, source };
}

function fnv1a64Digest(bytes: number[]): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

function mockSerialReadinessRequestToken(request: SerialReadinessRequest): string {
  const encoder = new TextEncoder();
  const sourceIdentity = request.source.kind === "catalog_url"
    ? `${request.source.url.length}-${fnv1a64Digest([...encoder.encode(request.source.url)])}`
    : `${request.source.data.length}-${fnv1a64Digest(request.source.data)}`;

  return `serial-readiness:port=${request.port}:source_kind=${request.source.kind}:source_identity=${sourceIdentity}:full_chip_erase=${request.options?.full_chip_erase ? 1 : 0}`;
}

function mockSerialReadinessBlockedReason(
  request: SerialReadinessRequest,
  ports: PortInfo[],
): SerialReadinessBlockedReason | null {
  if (request.port.trim().length === 0) {
    return "port_unselected";
  }
  if (!ports.some((port) => port.port_name === request.port)) {
    return "port_unavailable";
  }
  if (request.source.kind === "catalog_url" && request.source.url.trim().length === 0) {
    return "source_missing";
  }
  if (request.source.kind === "local_apj_bytes" && request.source.data.length === 0) {
    return "source_missing";
  }
  return null;
}

function mockSerialReadinessResponse(request: SerialReadinessRequest): SerialReadinessResponse {
  const ports = defaultFirmwarePorts();
  const blockedReason = mockSerialReadinessBlockedReason(request, ports);

  return {
    request_token: mockSerialReadinessRequestToken(request),
    session_status: { kind: "idle" },
    readiness: blockedReason === null ? { kind: "advisory" } : { kind: "blocked", reason: blockedReason },
    target_hint: null,
    validation_pending: blockedReason === null,
    bootloader_transition: { kind: "manual_bootloader_entry_required" },
  };
}

function mockFirmwareCatalogEntries(boardId: number, platform?: string): CatalogEntry[] {
  return defaultFirmwareCatalogEntries().filter((entry) => entry.board_id === boardId && (platform === undefined || entry.platform === platform));
}

function mockFirmwareFlashSerialResult(args: ReturnType<typeof validateFirmwareFlashSerialArgs>): SerialFlowResult {
  const sourceUrl = (args.source as { url?: string }).url ?? null;
  const matchedEntry = sourceUrl === null
    ? null
    : defaultFirmwareCatalogEntries().find((entry) => entry.url === sourceUrl) ?? null;

  return {
    result: "verified",
    board_id: matchedEntry?.board_id ?? 140,
    bootloader_rev: 5,
    port: args.port,
  };
}

function mockFirmwareFlashDfuRecoveryResult(_args: ReturnType<typeof validateFirmwareFlashDfuRecoveryArgs>): DfuRecoveryResult {
  return { result: "verified" };
}

function sweepExpiredPending(nowUnixMsec = Date.now()) {
  for (const key of ["pendingLiveEnvelope", "pendingPlaybackEnvelope"] as const) {
    const pending = mockState[key];
    if (pending && nowUnixMsec - pending.opened_at_unix_msec >= PENDING_SESSION_TTL_MS) {
      mockState[key] = null;
    }
  }
}

function liveGuidedDomain(provenance: "bootstrap" | "stream" = "bootstrap") {
  if (!mockState.liveVehicleAvailable) {
    return {
      available: true,
      complete: true,
      provenance,
      value: {
        status: "unavailable",
        session: null,
        entered_at_unix_msec: null,
        blocking_reason: "live_session_required",
        termination: mockState.guidedTermination,
        last_command: mockState.guidedLastCommand,
        actions: {
          start: { allowed: false, blocking_reason: "live_session_required" },
          update: { allowed: false, blocking_reason: "live_session_required" },
          stop: { allowed: false, blocking_reason: "live_session_required" },
        },
      },
    };
  }

  if (!mockState.guided) {
    const blockingReason = !mockState.liveVehicleArmed ? "vehicle_disarmed" : null;
    const actions = guidedActionsForIdleState();
    return {
      available: true,
      complete: true,
      provenance,
      value: {
        status: blockingReason ? "blocked" : "idle",
        session: null,
        entered_at_unix_msec: null,
        blocking_reason: blockingReason,
        termination: mockState.guidedTermination,
        last_command: mockState.guidedLastCommand,
        actions,
      },
    };
  }

  return {
    available: true,
    complete: true,
    provenance,
    value: {
      status: "active",
      session: mockState.guided.session,
      entered_at_unix_msec: mockState.guided.entered_at_unix_msec,
      blocking_reason: null,
      termination: mockState.guidedTermination,
      last_command: mockState.guidedLastCommand,
      actions: {
        start: { allowed: false, blocking_reason: "operation_in_progress" },
        update: { allowed: true, blocking_reason: null },
        stop: { allowed: false, blocking_reason: "stop_unsupported" },
      },
    },
  };
}

function nextEnvelope(sourceKind: "live" | "playback"): SessionEnvelope {
  if (mockState.lastSourceKind && mockState.lastSourceKind !== sourceKind) {
    mockState.resetRevision += 1;
  }

  const envelope = {
    session_id: `session-${mockState.nextSessionId}`,
    source_kind: sourceKind,
    seek_epoch: mockState.nextSeekEpoch,
    reset_revision: mockState.resetRevision,
  };
  mockState.nextSessionId += 1;
  mockState.nextSeekEpoch += 1;
  mockState.lastSourceKind = sourceKind;
  return envelope;
}

function missingDomainValue() {
  return {
    available: false,
    complete: false,
    provenance: "bootstrap",
    value: null,
  };
}

function liveBootstrapTelemetryDomain() {
  return {
    available: true,
    complete: false,
    provenance: "bootstrap",
    value: {
      flight: { altitude_m: null, speed_mps: null, climb_rate_mps: null, throttle_pct: null, airspeed_mps: null },
      navigation: { latitude_deg: null, longitude_deg: null, heading_deg: null, wp_dist_m: null, nav_bearing_deg: null, target_bearing_deg: null, xtrack_error_m: null },
      attitude: { roll_deg: null, pitch_deg: null, yaw_deg: null },
      power: { battery_pct: null, battery_voltage_v: null, battery_current_a: null, battery_voltage_cells: null, energy_consumed_wh: null, battery_time_remaining_s: null },
      gps: { fix_type: null, satellites: null, hdop: null },
      terrain: { terrain_height_m: null, height_above_terrain_m: null },
      radio: { rc_channels: null, rc_rssi: null, servo_outputs: null },
    },
  };
}

function liveBootstrapNullDomain() {
  return { available: true, complete: false, provenance: "bootstrap", value: null };
}

function openSessionSnapshotResult(sourceKind: "live" | "playback") {
  if (sourceKind === "playback" && !mockState.logOpen) {
    throw new Error("no log open");
  }

  if (sourceKind === "playback") {
    resetGuided("source_switch", "playback source switched");
  }

  const envelope = nextEnvelope(sourceKind);
  if (sourceKind === "playback") {
    mockState.pendingPlaybackEnvelope = { envelope, opened_at_unix_msec: Date.now() };
  } else {
    mockState.pendingLiveEnvelope = { envelope, opened_at_unix_msec: Date.now() };
  }

  return {
    envelope,
    session: {
      available: true,
      complete: true,
      provenance: sourceKind === "playback" ? "playback" : "bootstrap",
      value: {
        status: sourceKind === "playback" ? "active" : mockState.liveVehicleAvailable ? "active" : "pending",
        connection: (sourceKind === "playback"
          ? { kind: "disconnected" }
          : mockState.liveVehicleAvailable
            ? { kind: "connected" }
            : { kind: "disconnected" }) satisfies SessionConnection,
        vehicle_state: sourceKind === "playback" || !mockState.liveVehicleAvailable
          ? null
          : mockState.liveVehicleState,
        home_position: null,
      },
    },
    telemetry: sourceKind === "playback" ? playbackTelemetryDomain() : mockState.liveVehicleAvailable ? liveBootstrapTelemetryDomain() : missingDomainValue(),
    mission_state: sourceKind === "playback"
      ? null
      : mockState.liveVehicleAvailable ? structuredClone(mockState.liveMissionState) : null,
    param_store: sourceKind === "playback"
      ? null
      : mockState.liveVehicleAvailable ? structuredClone(mockState.liveParamStore) : null,
    param_progress: sourceKind === "playback"
      ? null
      : mockState.liveVehicleAvailable ? structuredClone(mockState.liveParamProgress) : null,
    support: sourceKind === "playback"
      ? { available: false, complete: false, provenance: "playback", value: null }
      : mockState.liveVehicleAvailable ? liveBootstrapNullDomain() : missingDomainValue(),
    sensor_health: sourceKind === "playback"
      ? { available: false, complete: false, provenance: "playback", value: null }
      : mockState.liveVehicleAvailable ? liveBootstrapNullDomain() : missingDomainValue(),
    configuration_facts: sourceKind === "playback"
      ? { available: false, complete: false, provenance: "playback", value: null }
      : mockState.liveVehicleAvailable ? liveBootstrapNullDomain() : missingDomainValue(),
    calibration: sourceKind === "playback"
      ? { available: false, complete: false, provenance: "playback", value: null }
      : mockState.liveVehicleAvailable ? liveBootstrapNullDomain() : missingDomainValue(),
    guided: sourceKind === "playback"
      ? { available: false, complete: false, provenance: "playback", value: null }
      : liveGuidedDomain(),
    status_text: {
      available: true,
      complete: true,
      provenance: sourceKind === "playback" ? "playback" : "bootstrap",
      value: { entries: [] },
    },
    playback: { cursor_usec: sourceKind === "playback" ? mockState.playbackCursorUsec : null },
  };
}

function playbackStreamEvents(envelope: SessionEnvelope, cursorUsec: number | null): MockPlatformEvent[] {
  return [
    {
      event: "session://state",
      payload: {
        envelope,
        value: {
          available: true,
          complete: true,
          provenance: "playback",
          value: {
            status: "active",
            connection: { kind: "disconnected" },
            vehicle_state: null,
            home_position: null,
          },
        },
      },
    },
    {
      event: "telemetry://state",
      payload: {
        envelope,
        value: playbackTelemetryDomain(),
      },
    },
    {
      event: "support://state",
      payload: {
        envelope,
        value: { available: false, complete: false, provenance: "playback", value: null },
      },
    },
    {
      event: "status_text://state",
      payload: {
        envelope,
        value: { available: true, complete: true, provenance: "playback", value: { entries: [] } },
      },
    },
    {
      event: "playback://state",
      payload: {
        envelope,
        value: { cursor_usec: cursorUsec, barrier_ready: true },
      },
    },
  ];
}

function availableTransportDescriptors(): TransportDescriptor[] {
  return [
    {
      kind: "udp",
      label: "UDP",
      available: true,
      validation: { bind_addr_required: true },
    },
    {
      kind: "tcp",
      label: "TCP",
      available: true,
      validation: { address_required: true },
    },
    {
      kind: "serial",
      label: "Serial",
      available: true,
      validation: { port_required: true, baud_required: true },
      default_baud: 57600,
    },
    {
      kind: "bluetooth_ble",
      label: "BLE",
      available: true,
      validation: { address_required: true },
    },
  ];
}

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

function defaultCommandResult(cmd: string, _args: CommandArgs): unknown {
  switch (cmd) {
    case "available_transports":
      return availableTransportDescriptors();
    case "open_session_snapshot":
      return openSessionSnapshotResult(((_args?.sourceKind as "live" | "playback" | undefined) ?? "live"));
    case "ack_session_snapshot":
      sweepExpiredPending();
      if (!mockState.pendingLiveEnvelope && !mockState.pendingPlaybackEnvelope) {
        return {
          result: "rejected",
          failure: {
            operation_id: "ack_session_snapshot",
            reason: { kind: "timeout", message: "pending session expired or missing" },
          },
        };
      }
      const pending = [mockState.pendingLiveEnvelope, mockState.pendingPlaybackEnvelope].find((entry) => entry
        && _args?.sessionId === entry.envelope.session_id
        && _args?.seekEpoch === entry.envelope.seek_epoch
        && _args?.resetRevision === entry.envelope.reset_revision) ?? null;
      if (!pending) {
        if (!mockState.pendingLiveEnvelope && !mockState.pendingPlaybackEnvelope) {
          return {
            result: "rejected",
            failure: {
              operation_id: "ack_session_snapshot",
              reason: { kind: "timeout", message: "pending session expired or missing" },
            },
          };
        }
        return {
          result: "rejected",
          failure: {
            operation_id: "ack_session_snapshot",
            reason: { kind: "conflict", message: "session snapshot mismatch" },
          },
        };
      }
      if (pending.envelope.source_kind === "playback") {
        mockState.playbackEnvelope = pending.envelope;
        mockState.pendingPlaybackEnvelope = null;
      } else {
        mockState.liveEnvelope = pending.envelope;
        mockState.pendingLiveEnvelope = null;
      }
      return { result: "accepted", envelope: pending.envelope };
    case "playback_seek": {
      if (!mockState.logOpen) {
        throw new Error("no log open");
      }
      if (!mockState.playbackEnvelope) {
        throw new Error("playback session is not active");
      }
      resetGuided("source_switch", "playback source switched");
      mockState.playbackEnvelope = {
        ...mockState.playbackEnvelope,
        seek_epoch: mockState.playbackEnvelope.seek_epoch + 1,
        reset_revision: mockState.playbackEnvelope.reset_revision + 1,
      };
      mockState.playbackCursorUsec = (_args?.cursorUsec as number | undefined) ?? null;
      emitMany(playbackStreamEvents(mockState.playbackEnvelope, mockState.playbackCursorUsec));
      return {
        envelope: mockState.playbackEnvelope,
        cursor_usec: mockState.playbackCursorUsec,
      };
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
      const { boardId, platform } = validateFirmwareCatalogEntriesArgs(_args);
      return mockFirmwareCatalogEntries(boardId, platform);
    }
    case "firmware_serial_readiness": {
      const request = validateSerialReadinessRequest(_args);
      return mockSerialReadinessResponse(request);
    }
    case "firmware_flash_serial": {
      const request = validateFirmwareFlashSerialArgs(_args);
      return mockFirmwareFlashSerialResult(request);
    }
    case "firmware_flash_dfu_recovery": {
      const request = validateFirmwareFlashDfuRecoveryArgs(_args);
      return mockFirmwareFlashDfuRecoveryResult(request);
    }
    case "connect_link":
      resetGuided("source_switch", "live source switched");
      if (_args?.request && typeof _args.request === "object") {
        const request = _args.request as {
          mockVehicleState?: Partial<MockLiveVehicleState> & { modeName?: string };
          mockMissionState?: Partial<MockMissionState>;
          mockParamStore?: MockParamStoreState;
          mockParamProgress?: MockParamProgressState;
        };
        const mockVehicleState = request.mockVehicleState;
        applyMockLiveVehicleState(mockVehicleState);
        applyMockMissionState(request.mockMissionState);
        applyMockParamState(request.mockParamStore, request.mockParamProgress);
      } else {
        applyMockLiveVehicleState();
        applyMockMissionState();
        applyMockParamState();
      }
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
    case "disconnect_link":
      if (_args?.request && typeof _args.request === "object") {
        const requestedSessionId = (_args.request as { session_id?: string }).session_id;
        if (requestedSessionId) {
          if (!mockState.liveEnvelope) {
            throw new Error(`session_id mismatch: no active session for ${requestedSessionId}`);
          }
          if (mockState.liveEnvelope.session_id !== requestedSessionId) {
            throw new Error(`session_id mismatch: expected ${mockState.liveEnvelope.session_id}, got ${requestedSessionId}`);
          }
        }
      }
      mockState.liveVehicleAvailable = false;
      mockState.liveVehicleState = null;
      mockState.liveMissionState = null;
      mockState.liveParamStore = null;
      mockState.liveParamProgress = null;
      mockState.liveVehicleArmed = false;
      mockState.liveVehicleModeName = "Stabilize";
      resetGuided("disconnect", "live vehicle disconnected");
      return undefined;
    case "set_servo":
      requireConnectedVehicle();
      validateSetServoArgs(_args);
      return undefined;
    case "rc_override":
      requireConnectedVehicle();
      validateRcOverrideArgs(_args);
      return undefined;
    case "vehicle_takeoff": {
      const contextError = takeoffContextError();
      if (contextError) {
        throw new Error(contextError);
      }
      const altitudeM = _args?.altitudeM;
      if (typeof altitudeM !== "number" || !Number.isFinite(altitudeM) || altitudeM <= 0) {
        throw new Error("takeoff altitude must be greater than 0 m");
      }
      return undefined;
    }
    case "start_guided_session": {
      const session = _args?.request && typeof _args.request === "object"
        ? (_args.request as { session: { kind: "goto"; latitude_deg: number; longitude_deg: number; altitude_m: number } }).session
        : null;
      if (!session) {
        return { result: "rejected", failure: { operation_id: "start_guided_session", reason: { kind: "invalid_input", message: "missing guided session" }, retryable: false, fatality_scope: "operation", detail: null } };
      }
      const contextRejection = rejectGuidedContext("start_guided_session");
      if (contextRejection) {
        return contextRejection;
      }
      if (mockState.guided) {
        return { result: "rejected", failure: { operation_id: "start_guided_session", reason: { kind: "conflict", message: "guided session already active; use update_guided_session" }, retryable: true, fatality_scope: "operation", detail: null } };
      }
      const now = Date.now();
      mockState.guidedTermination = null;
      mockState.guidedLastCommand = { operation_id: "start_guided_session", session_kind: "goto", at_unix_msec: now };
      mockState.guided = { session, entered_at_unix_msec: now };
      emitGuidedStateIfLiveActive();
      return { result: "accepted", state: liveGuidedDomain("stream") };
    }
    case "update_guided_session": {
      const session = _args?.request && typeof _args.request === "object"
        ? (_args.request as { session: { kind: "goto"; latitude_deg: number; longitude_deg: number; altitude_m: number } }).session
        : null;
      const contextRejection = rejectGuidedContext("update_guided_session");
      if (contextRejection) {
        return contextRejection;
      }
      if (!mockState.guided) {
        return { result: "rejected", failure: { operation_id: "update_guided_session", reason: { kind: "conflict", message: "no active guided session to update" }, retryable: true, fatality_scope: "operation", detail: null } };
      }
      if (!session) {
        return { result: "rejected", failure: { operation_id: "update_guided_session", reason: { kind: "invalid_input", message: "missing guided session" }, retryable: false, fatality_scope: "operation", detail: null } };
      }
      mockState.guidedTermination = null;
      mockState.guidedLastCommand = { operation_id: "update_guided_session", session_kind: "goto", at_unix_msec: Date.now() };
      mockState.guided = { ...mockState.guided, session };
      emitGuidedStateIfLiveActive();
      return { result: "accepted", state: liveGuidedDomain("stream") };
    }
    case "stop_guided_session": {
      const contextRejection = rejectGuidedContext("stop_guided_session");
      if (contextRejection) {
        return contextRejection;
      }
      return !mockState.guided ? {
        result: "rejected",
        failure: {
          operation_id: "stop_guided_session",
          reason: { kind: "conflict", message: "no active guided session to stop" },
          retryable: true,
          fatality_scope: "operation",
          detail: null,
        },
      } : {
        result: "rejected",
        failure: {
          operation_id: "stop_guided_session",
          reason: { kind: "unsupported", message: "explicit guided stop is not supported by the active vehicle backend" },
          retryable: false,
          fatality_scope: "operation",
          detail: { kind: "session_kind", session_kind: "goto" },
        },
      };
    }
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
      return {
        plan: {
          items: [
            {
              command: { Nav: { Takeoff: { position: { RelHome: { latitude_deg: 47.397742, longitude_deg: 8.545594, relative_alt_m: 25 } }, pitch_deg: 15 } } },
              current: true,
              autocontinue: true,
            },
            {
              command: { Nav: { Waypoint: { position: { RelHome: { latitude_deg: 47.4, longitude_deg: 8.55, relative_alt_m: 30 } }, hold_time_s: 0, acceptance_radius_m: 1, pass_radius_m: 0, yaw_deg: 0 } } },
              current: false,
              autocontinue: true,
            },
          ],
        },
        home: null,
      };
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
      mockState.liveEnvelope = null;
      mockState.playbackEnvelope = null;
      mockState.pendingLiveEnvelope = null;
      mockState.pendingPlaybackEnvelope = null;
      mockState.nextSessionId = 2;
      mockState.nextSeekEpoch = 0;
      mockState.resetRevision = 0;
      mockState.lastSourceKind = null;
      mockState.playbackCursorUsec = null;
      mockState.logOpen = false;
      mockState.liveVehicleAvailable = false;
      mockState.liveVehicleState = null;
      mockState.liveMissionState = null;
      mockState.liveParamStore = null;
      mockState.liveParamProgress = null;
      mockState.liveVehicleArmed = false;
      mockState.liveVehicleModeName = "Stabilize";
      mockState.guidedTermination = null;
      mockState.guidedLastCommand = null;
      mockState.guided = null;
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
      mockState.liveVehicleAvailable = true;
      mockState.liveVehicleState = structuredClone(vehicleState);
      mockState.liveVehicleArmed = vehicleState.armed;
      mockState.liveVehicleModeName = vehicleState.mode_name;
      emitEvent("session://state", liveSessionStreamEvent(vehicleState).payload);
      const reconciledGuided = reconcileGuidedAfterLiveVehicleUpdate();
      if (reconciledGuided) {
        emitEvent("guided://state", liveGuidedStreamEvent(reconciledGuided).payload);
      }
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
      return invocations.slice();
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
