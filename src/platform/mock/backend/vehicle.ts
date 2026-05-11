import { emitGuidedStateIfLiveActive, liveGuidedStreamEvent, reconcileGuidedAfterLiveVehicleUpdate } from "./guided";
import { demoFixtureForPreset } from "./demo-fixtures";
import { isDemoProfile } from "./profile";
import { clearDemoIntervals, mockState, requireLiveEnvelope, resetGuided } from "./runtime";
import { applyMockMissionState } from "./mission";
import { applyMockParamState } from "./params";
import { normalizeMissionPlan } from "./vehicle-sim/mission";
import {
  createDemoSimulator,
  setDemoSimulatorArmedState,
  setDemoSimulatorHoldTarget,
  setDemoSimulatorLandTarget,
  setDemoSimulatorMission,
  setDemoSimulatorMode,
  setDemoSimulatorRtlTarget,
  telemetryFromSimulator,
  vehicleStateFromSimulator,
} from "./vehicle-sim/simulator";
import type { DemoVehiclePreset } from "../../../transport";
import type {
  CommandArgs,
  MockLiveVehicleState,
  MockMissionState,
  MockParamProgressState,
  MockParamStoreState,
  MockPlatformEvent,
  TransportDescriptor,
} from "./types";

export function requireConnectedVehicle() {
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

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`missing or invalid ${label}`);
  }

  return value;
}

function requireFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`missing or invalid ${label}`);
  }

  return value;
}

export const MOCK_MESSAGE_RATE_CATALOG = [
  { id: 33, name: "Global Position", default_rate_hz: 4.0 },
  { id: 30, name: "Attitude", default_rate_hz: 4.0 },
  { id: 24, name: "GPS Raw", default_rate_hz: 2.0 },
  { id: 1, name: "System Status", default_rate_hz: 1.0 },
  { id: 65, name: "RC Channels", default_rate_hz: 2.0 },
  { id: 36, name: "Servo Output", default_rate_hz: 2.0 },
  { id: 74, name: "VFR HUD", default_rate_hz: 4.0 },
  { id: 62, name: "Nav Controller", default_rate_hz: 2.0 },
] as const;

export const MOCK_MESSAGE_RATE_LIMITS = {
  min: 0.1,
  max: 50.0,
} as const;

export const MOCK_TELEMETRY_RATE_LIMITS = {
  min: 1,
  max: 20,
} as const;

export function availableMessageRates() {
  return MOCK_MESSAGE_RATE_CATALOG.map((entry) => ({ ...entry }));
}

export function validateSetTelemetryRateArgs(args: CommandArgs) {
  const rateHz = requireFiniteInteger(args?.rateHz, "set_telemetry_rate.rateHz");

  if (rateHz < MOCK_TELEMETRY_RATE_LIMITS.min || rateHz > MOCK_TELEMETRY_RATE_LIMITS.max) {
    throw new Error("rate_hz must be between 1 and 20");
  }

  return rateHz;
}

export function validateSetMessageRateArgs(args: CommandArgs) {
  const messageId = requireFiniteInteger(args?.messageId, "set_message_rate.messageId");
  const rateHz = requireFiniteNumber(args?.rateHz, "set_message_rate.rateHz");

  if (messageId < 0) {
    throw new Error(`set_message_rate messageId must be greater than or equal to 0, got ${messageId}`);
  }

  if (rateHz < MOCK_MESSAGE_RATE_LIMITS.min || rateHz > MOCK_MESSAGE_RATE_LIMITS.max) {
    throw new Error("rate_hz must be between 0.1 and 50.0");
  }

  return { messageId, rateHz };
}

export function validateSetServoArgs(args: CommandArgs) {
  const instance = requireFiniteInteger(args?.instance, "set_servo.instance");
  const pwmUs = requireFiniteInteger(args?.pwmUs, "set_servo.pwmUs");

  if (instance < 1 || instance > 16) {
    throw new Error(`set_servo instance must be in 1..=16, got ${instance}`);
  }
  if (pwmUs < 1000 || pwmUs > 2000) {
    throw new Error(`set_servo pwm_us must be in 1000..=2000 microseconds, got ${pwmUs}`);
  }
}

export function validateMotorTestArgs(args: CommandArgs) {
  const motorInstance = requireFiniteInteger(args?.motorInstance, "motor_test.motorInstance");
  const throttlePct = args?.throttlePct;
  const durationS = args?.durationS;

  if (motorInstance < 1 || motorInstance > 8) {
    throw new Error(`motor_test motorInstance must be in 1..=8, got ${motorInstance}`);
  }
  if (typeof throttlePct !== "number" || !Number.isFinite(throttlePct)) {
    throw new Error("missing or invalid motor_test.throttlePct");
  }
  if (throttlePct < 0 || throttlePct > 100) {
    throw new Error(`motor_test throttlePct must be in 0..=100, got ${throttlePct}`);
  }
  if (typeof durationS !== "number" || !Number.isFinite(durationS)) {
    throw new Error("missing or invalid motor_test.durationS");
  }
  if (durationS <= 0) {
    throw new Error(`motor_test durationS must be greater than 0, got ${durationS}`);
  }
}

export function validateRcOverrideArgs(args: CommandArgs) {
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

export function validateArmDisarmArgs(args: CommandArgs, cmd: "arm_vehicle" | "disarm_vehicle") {
  requireBoolean(args?.force, `${cmd}.force`);
}

export function normalizedLiveVehicleState(mockVehicleState?: Partial<MockLiveVehicleState> & { modeName?: string } | null): MockLiveVehicleState {
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

export function applyMockLiveVehicleState(mockVehicleState?: Partial<MockLiveVehicleState> & { modeName?: string } | null) {
  const normalized = normalizedLiveVehicleState(mockVehicleState);
  mockState.liveVehicleAvailable = true;
  mockState.liveVehicleState = normalized;
  mockState.liveVehicleArmed = normalized.armed;
  mockState.liveVehicleModeName = normalized.mode_name;
}

function seededDemoTransportDescriptor(): TransportDescriptor {
  return {
    kind: "demo",
    label: "Demo vehicle",
    available: true,
    validation: {},
  };
}

function setDemoSeedState(preset: DemoVehiclePreset) {
  const fixture = demoFixtureForPreset(preset);
  const simulator = setDemoSimulatorMission(
    createDemoSimulator(preset),
    normalizeMissionPlan(fixture.missionState.plan),
    fixture.missionState.current_index,
  );
  mockState.liveSimulator = simulator;
  applyMockLiveVehicleState(vehicleStateFromSimulator(simulator, fixture.vehicleState));
  mockState.liveMissionHome = fixture.homePosition;
  applyMockMissionState(fixture.missionState);
  mockState.liveFencePlan = fixture.fencePlan;
  mockState.liveRallyPlan = fixture.rallyPlan;
  applyMockParamState(fixture.paramStore, null);
  mockState.liveTelemetryDomain = telemetryFromSimulator(simulator, "bootstrap");
  mockState.liveAvailableModes = fixture.availableModes;
  mockState.liveStatusText = fixture.statusText;
  mockState.liveSupportDomain = fixture.supportDomain;
  mockState.liveSensorHealthDomain = fixture.sensorHealthDomain;
  mockState.liveConfigurationFactsDomain = fixture.configurationFactsDomain;
}

export function clearLiveVehicleState() {
  clearDemoIntervals();
  mockState.liveVehicleAvailable = false;
  mockState.liveVehicleState = null;
  mockState.liveMissionState = null;
  mockState.liveMissionHome = null;
  mockState.liveFencePlan = null;
  mockState.liveRallyPlan = null;
  mockState.liveTelemetryDomain = null;
  mockState.liveParamStore = null;
  mockState.liveParamProgress = null;
  mockState.liveAvailableModes = null;
  mockState.liveStatusText = null;
  mockState.liveSupportDomain = null;
  mockState.liveSensorHealthDomain = null;
  mockState.liveConfigurationFactsDomain = null;
  mockState.liveSimulator = null;
  mockState.liveVehicleArmed = false;
  mockState.liveVehicleModeName = "Stabilize";
}

export function connectLink(args: CommandArgs) {
  resetGuided("source_switch", "live source switched");
  if (args?.request && typeof args.request === "object") {
    const request = args.request as ConnectLinkRequest;
    if (request.transport?.kind === "demo") {
      setDemoSeedState(request.transport.vehicle_preset);
      return;
    }

    applyMockLiveVehicleState(request.mockVehicleState);
    applyMockMissionState(request.mockMissionState);
    applyMockParamState(request.mockParamStore, request.mockParamProgress);
    mockState.liveTelemetryDomain = null;
    mockState.liveAvailableModes = null;
    mockState.liveStatusText = null;
    mockState.liveSupportDomain = null;
    mockState.liveSensorHealthDomain = null;
    mockState.liveConfigurationFactsDomain = null;
    mockState.liveSimulator = null;
    return;
  }

  applyMockLiveVehicleState();
  applyMockMissionState();
  applyMockParamState();
  mockState.liveTelemetryDomain = null;
  mockState.liveAvailableModes = null;
  mockState.liveStatusText = null;
  mockState.liveSupportDomain = null;
  mockState.liveSensorHealthDomain = null;
  mockState.liveConfigurationFactsDomain = null;
  mockState.liveSimulator = null;
}

export function disconnectLink(args: CommandArgs) {
  if (args?.request && typeof args.request === "object") {
    const requestedSessionId = (args.request as { session_id?: string }).session_id;
    if (requestedSessionId) {
      if (!mockState.liveEnvelope) {
        throw new Error(`session_id mismatch: no active session for ${requestedSessionId}`);
      }
      if (mockState.liveEnvelope.session_id !== requestedSessionId) {
        throw new Error(`session_id mismatch: expected ${mockState.liveEnvelope.session_id}, got ${requestedSessionId}`);
      }
    }
  }

  clearLiveVehicleState();
  resetGuided("disconnect", "live vehicle disconnected");
}

export function emitLiveSessionState(vehicleState: MockLiveVehicleState, emitEvent: (event: string, payload: unknown) => void) {
  applyMockLiveVehicleState(vehicleState);
  emitEvent("session://state", liveSessionStreamEvent(vehicleState).payload);
  const reconciledGuided = reconcileGuidedAfterLiveVehicleUpdate();
  if (reconciledGuided) {
    emitEvent("guided://state", liveGuidedStreamEvent(reconciledGuided).payload);
  }
}

export function syncLiveVehicleArmedState(armed: boolean, emitEvent: (event: string, payload: unknown) => void) {
  if (mockState.liveSimulator) {
    mockState.liveSimulator = setDemoSimulatorArmedState(mockState.liveSimulator, armed);
    mockState.liveTelemetryDomain = telemetryFromSimulator(mockState.liveSimulator, "stream");
  }

  mockState.liveVehicleArmed = armed;
  if (mockState.liveVehicleState) {
    mockState.liveVehicleState = mockState.liveSimulator
      ? vehicleStateFromSimulator(mockState.liveSimulator, mockState.liveVehicleState)
      : { ...mockState.liveVehicleState, armed };
  }

  if (!mockState.liveEnvelope || !mockState.liveVehicleState) {
    return;
  }

  emitEvent("session://state", liveSessionStreamEvent(mockState.liveVehicleState).payload);
  if (mockState.liveTelemetryDomain) {
    emitEvent("telemetry://state", {
      envelope: requireLiveEnvelope(),
      value: structuredClone(mockState.liveTelemetryDomain),
    });
  }
  const reconciledGuided = reconcileGuidedAfterLiveVehicleUpdate();
  if (reconciledGuided) {
    emitEvent("guided://state", liveGuidedStreamEvent(reconciledGuided).payload);
    return;
  }

  emitGuidedStateIfLiveActive(emitEvent);
}

export function liveSessionStreamEvent(vehicleState: MockLiveVehicleState): MockPlatformEvent {
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
          home_position: structuredClone(mockState.liveMissionHome),
        },
      },
    },
  };
}

export function availableTransportDescriptors(): TransportDescriptor[] {
  if (isDemoProfile()) {
    return [seededDemoTransportDescriptor()];
  }

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
    {
      kind: "bluetooth_spp",
      label: "SPP",
      available: true,
      validation: { address_required: true },
    },
  ];
}

export function getAvailableModes() {
  return structuredClone(mockState.liveAvailableModes ?? []);
}

export function setFlightMode(args: CommandArgs, emitEvent: (event: string, payload: unknown) => void) {
  requireConnectedVehicle();
  const customMode = requireFiniteInteger(args?.customMode, "set_flight_mode.customMode");
  const nextMode = mockState.liveAvailableModes?.find((mode) => mode.custom_mode === customMode);
  if (!nextMode) {
    throw new Error(`unknown flight mode custom_mode ${customMode}`);
  }

  if (mockState.liveVehicleState) {
    if (mockState.liveSimulator) {
      const enteringGuided = mockState.liveVehicleState.mode_name !== "Guided" && nextMode.name === "Guided";
      mockState.liveSimulator = setDemoSimulatorMode(mockState.liveSimulator, {
        custom_mode: nextMode.custom_mode,
        mode_name: nextMode.name,
      });
      if (nextMode.name === "Land") {
        mockState.liveSimulator = setDemoSimulatorLandTarget(mockState.liveSimulator);
      } else if (nextMode.name === "RTL" || nextMode.name === "QRTL") {
        mockState.liveSimulator = setDemoSimulatorRtlTarget(mockState.liveSimulator);
      } else if (enteringGuided) {
        mockState.liveSimulator = setDemoSimulatorHoldTarget(mockState.liveSimulator);
      } else if (
        nextMode.name === "Loiter"
        || nextMode.name === "QLOITER"
        || nextMode.name === "Stabilize"
        || nextMode.name === "Alt Hold"
        || nextMode.name === "Circle"
      ) {
        mockState.liveSimulator = setDemoSimulatorHoldTarget(mockState.liveSimulator);
      } else if (nextMode.name !== "Guided") {
        mockState.liveSimulator = setDemoSimulatorHoldTarget(mockState.liveSimulator);
      }
      mockState.liveTelemetryDomain = telemetryFromSimulator(mockState.liveSimulator, "stream");
      mockState.liveVehicleState = vehicleStateFromSimulator(mockState.liveSimulator, mockState.liveVehicleState);
    } else {
      mockState.liveVehicleState = {
        ...mockState.liveVehicleState,
        custom_mode: nextMode.custom_mode,
        mode_name: nextMode.name,
      };
    }
    mockState.liveVehicleModeName = nextMode.name;
  }

  if (!mockState.liveEnvelope || !mockState.liveVehicleState) {
    return;
  }

  emitEvent("session://state", liveSessionStreamEvent(mockState.liveVehicleState).payload);
  if (mockState.liveTelemetryDomain) {
    emitEvent("telemetry://state", {
      envelope: requireLiveEnvelope(),
      value: structuredClone(mockState.liveTelemetryDomain),
    });
  }
  const reconciledGuided = reconcileGuidedAfterLiveVehicleUpdate();
  if (reconciledGuided) {
    emitEvent("guided://state", liveGuidedStreamEvent(reconciledGuided).payload);
    return;
  }

  emitGuidedStateIfLiveActive(emitEvent);
}

export type ConnectLinkRequest = {
  transport?:
    | { kind: "udp"; bind_addr: string }
    | { kind: "tcp"; address: string }
    | { kind: "serial"; port: string; baud: number }
    | { kind: "bluetooth_ble"; address: string }
    | { kind: "bluetooth_spp"; address: string }
    | { kind: "demo"; vehicle_preset: DemoVehiclePreset };
  mockVehicleState?: Partial<MockLiveVehicleState> & { modeName?: string };
  mockMissionState?: Partial<MockMissionState>;
  mockParamStore?: MockParamStoreState;
  mockParamProgress?: MockParamProgressState;
};
