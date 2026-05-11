import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { DomainValue, DomainProvenance } from "../lib/domain-status";
import type { FencePlan, FenceRegion } from "../fence";
import type { GuidedAction, GuidedDomain, GuidedSession, GuidedState } from "../guided";
import type {
  ChartPoint,
  ChartSeries,
  ChartSeriesPage,
  ChartSeriesSelector,
  JsonFieldValue,
  LogCatalogMigrationError,
  LogDiagnostic,
  LogExportRequest,
  LogExportResult,
  LogFormatAdapter,
  LogLibraryCatalog,
  LogLibraryEntry,
  LogLibraryEntryStatus,
  LogProgress,
  ChartSeriesRequest,
  RawMessageFieldFilter,
  RawMessageQuery,
  RawMessagePage,
  RawMessageRecord,
  ReferencedFileFingerprint,
  ReferencedFileStatus,
} from "../logs";
import type { GeoPoint2d, GeoPoint3d, HomePosition, MissionPlan, MissionItem } from "../lib/mavkit-types";
import type { MissionState } from "../mission";
import type { ParamProgress, ParamStore } from "../params";
import type { PlaybackStateSnapshot } from "../playback";
import type { RallyPlan } from "../rally";
import type { RecordingFailure, RecordingMode, RecordingSettings, RecordingSettingsResult, RecordingStartRequest, RecordingStatus } from "../recording";
import { OPERATION_IDS, type OperationFailure, type OperationId, type PlaybackSnapshot, type ReasonKind, type SessionConnection, type SessionDomain, type SessionEnvelope, type SessionState, type SourceKind } from "../session";
import type { StatusMessage, StatusTextDomain, StatusTextState } from "../statustext";
import type { TelemetryState, VehicleState } from "../telemetry";

type ContractSupportState = {
  can_request_prearm_checks: boolean;
  can_calibrate_accel: boolean;
  can_calibrate_compass: boolean;
  can_calibrate_radio: boolean;
};

type ContractConfigurationFlag = {
  configured: boolean;
};

type ContractConfigurationFactsState = {
  frame: ContractConfigurationFlag | null;
  gps: ContractConfigurationFlag | null;
  battery_monitor: ContractConfigurationFlag | null;
  motors_esc: ContractConfigurationFlag | null;
};

type ContractSensorHealthState = {
  gyro: string;
  accel: string;
  mag: string;
  baro: string;
  gps: string;
  airspeed: string;
  rc_receiver: string;
  battery: string;
  terrain: string;
  geofence: string;
};

type ContractCalibrationProgress = {
  compass_id: number;
  completion_pct: number;
  status: string;
  attempt: number;
};

type ContractCalibrationReport = {
  compass_id: number;
  status: string;
  fitness: number;
  ofs_x: number;
  ofs_y: number;
  ofs_z: number;
  autosaved: boolean;
};

type ContractCalibrationStep = {
  lifecycle: "not_started" | "running" | "complete" | "failed";
  progress: ContractCalibrationProgress | null;
  report: ContractCalibrationReport | null;
};

type ContractCalibrationState = {
  accel: ContractCalibrationStep | null;
  compass: ContractCalibrationStep | null;
  radio: ContractCalibrationStep | null;
};

type ContractOpenSessionSnapshot = {
  envelope: SessionEnvelope;
  session: SessionDomain;
  telemetry: DomainValue<TelemetryState>;
  mission_state: MissionState | null;
  param_store: ParamStore | null;
  param_progress: ParamProgress | null;
  support: DomainValue<ContractSupportState>;
  sensor_health: DomainValue<ContractSensorHealthState>;
  configuration_facts: DomainValue<ContractConfigurationFactsState>;
  calibration: DomainValue<ContractCalibrationState>;
  guided: GuidedDomain;
  status_text: StatusTextDomain;
  playback: PlaybackSnapshot;
};

function expectGuidedSession(value: unknown, label: string): GuidedSession {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["kind", "latitude_deg", "longitude_deg", "altitude_m"]);
  expect(object.kind).toBe("goto");
  return {
    kind: "goto",
    latitude_deg: expectNumber(object.latitude_deg, `${label}.latitude_deg`),
    longitude_deg: expectNumber(object.longitude_deg, `${label}.longitude_deg`),
    altitude_m: expectNumber(object.altitude_m, `${label}.altitude_m`),
  };
}

function expectGuidedAction(value: unknown, label: string): GuidedAction {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["allowed", "blocking_reason"]);
  return {
    allowed: expectBoolean(object.allowed, `${label}.allowed`),
    blocking_reason: object.blocking_reason === null ? null : expectString(object.blocking_reason, `${label}.blocking_reason`) as GuidedAction["blocking_reason"],
  };
}

function expectGuidedState(value: unknown, label: string): GuidedState {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["status", "session", "entered_at_unix_msec", "blocking_reason", "termination", "last_command", "actions"]);
  const actions = expectRecord(object.actions, `${label}.actions`);
  expectExactKeys(actions, `${label}.actions`, ["start", "update", "stop"]);
  const termination = object.termination === null ? null : expectRecord(object.termination, `${label}.termination`);
  if (termination) {
    expectExactKeys(termination, `${label}.termination`, ["reason", "at_unix_msec", "message"]);
  }
  const lastCommand = object.last_command === null ? null : expectRecord(object.last_command, `${label}.last_command`);
  if (lastCommand) {
    expectExactKeys(lastCommand, `${label}.last_command`, ["operation_id", "session_kind", "at_unix_msec"]);
  }
  return {
    status: expectString(object.status, `${label}.status`) as GuidedState["status"],
    session: object.session === null ? null : expectGuidedSession(object.session, `${label}.session`),
    entered_at_unix_msec: object.entered_at_unix_msec === null ? null : expectNumber(object.entered_at_unix_msec, `${label}.entered_at_unix_msec`),
    blocking_reason: object.blocking_reason === null ? null : expectString(object.blocking_reason, `${label}.blocking_reason`) as GuidedState["blocking_reason"],
    termination: termination === null ? null : {
      reason: expectString(termination.reason, `${label}.termination.reason`) as GuidedState["termination"] extends infer T ? T extends { reason: infer U } ? U : never : never,
      at_unix_msec: expectNumber(termination.at_unix_msec, `${label}.termination.at_unix_msec`),
      message: expectString(termination.message, `${label}.termination.message`),
    },
    last_command: lastCommand === null ? null : {
      operation_id: expectString(lastCommand.operation_id, `${label}.last_command.operation_id`) as GuidedState["last_command"] extends infer T ? T extends { operation_id: infer U } ? U : never : never,
      session_kind: lastCommand.session_kind === null ? null : expectString(lastCommand.session_kind, `${label}.last_command.session_kind`) as GuidedSession["kind"],
      at_unix_msec: expectNumber(lastCommand.at_unix_msec, `${label}.last_command.at_unix_msec`),
    },
    actions: {
      start: expectGuidedAction(actions.start, `${label}.actions.start`),
      update: expectGuidedAction(actions.update, `${label}.actions.update`),
      stop: expectGuidedAction(actions.stop, `${label}.actions.stop`),
    },
  };
}

function expectGuidedFailureDetail(value: unknown, label: string) {
  if (value === null) {
    return null;
  }

  const object = expectRecord(value, label);
  const kind = expectString(object.kind, `${label}.kind`);
  if (kind === "blocking_reason") {
    expectExactKeys(object, label, ["kind", "blocking_reason"]);
    return {
      kind,
      blocking_reason: expectString(object.blocking_reason, `${label}.blocking_reason`),
    };
  }
  if (kind === "source_kind") {
    expectExactKeys(object, label, ["kind", "source_kind"]);
    return {
      kind,
      source_kind: expectString(object.source_kind, `${label}.source_kind`),
    };
  }

  expectExactKeys(object, label, ["kind", "session_kind"]);
  return {
    kind,
    session_kind: expectString(object.session_kind, `${label}.session_kind`),
  };
}

describe("guided failure contract", () => {
  it("validates typed guided failure detail payloads", () => {
    expectGuidedFailureDetail(
      { kind: "session_kind", session_kind: "goto" },
      "guided_failure.detail",
    );
    expectGuidedFailureDetail(
      { kind: "blocking_reason", blocking_reason: "live_session_required" },
      "guided_failure.detail",
    );
  });
});

function fixturePath(name: string): string {
  return fileURLToPath(new URL(`../../tests/contracts/${name}`, import.meta.url));
}

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(fixturePath(name), "utf8")) as unknown;
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  expect(value, `${label} should be an object`).not.toBeNull();
  expect(typeof value, `${label} should be an object`).toBe("object");
  return value as Record<string, unknown>;
}

function expectExactKeys(value: Record<string, unknown>, label: string, keys: readonly string[]): void {
  expect(Object.keys(value).sort(), `${label} should have exact keys`).toEqual([...keys].sort());
}

function expectString(value: unknown, label: string): string {
  expect(typeof value, `${label} should be a string`).toBe("string");
  return value as string;
}

function expectNumber(value: unknown, label: string): number {
  expect(typeof value, `${label} should be a number`).toBe("number");
  return value as number;
}

function expectBoolean(value: unknown, label: string): boolean {
  expect(typeof value, `${label} should be a boolean`).toBe("boolean");
  return value as boolean;
}

function expectStringArray(value: unknown, label: string): string[] {
  expect(Array.isArray(value), `${label} should be an array`).toBe(true);
  return (value as unknown[]).map((entry, index) => expectString(entry, `${label}[${index}]`));
}

function expectNumberArray(value: unknown, label: string): number[] {
  expect(Array.isArray(value), `${label} should be an array`).toBe(true);
  return (value as unknown[]).map((entry, index) => expectNumber(entry, `${label}[${index}]`));
}

function expectOperationId(value: unknown, label: string): OperationId {
  const actual = expectString(value, label);
  expect(OPERATION_IDS).toContain(actual);
  return actual as OperationId;
}

function expectReason(value: unknown, label: string): OperationFailure["reason"] {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["kind", "message"]);
  const kind = expectString(object.kind, `${label}.kind`);
  expect(["unsupported", "unavailable", "conflict", "invalid_input", "cancelled", "failed", "timeout", "permission_denied"]).toContain(kind);
  return {
    kind: kind as ReasonKind,
    message: expectString(object.message, `${label}.message`),
  };
}

function expectOperationFailure(value: unknown, label: string): OperationFailure {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["operation_id", "reason"]);
  return {
    operation_id: expectOperationId(object.operation_id, `${label}.operation_id`),
    reason: expectReason(object.reason, `${label}.reason`),
  };
}

function expectJsonFieldValue(value: unknown, label: string): JsonFieldValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => expectJsonFieldValue(entry, `${label}[${index}]`));
  }
  const object = expectRecord(value, label);
  const parsed: Record<string, JsonFieldValue> = {};
  for (const [key, entry] of Object.entries(object)) {
    parsed[key] = expectJsonFieldValue(entry, `${label}.${key}`);
  }
  return parsed;
}

function expectProvenance(value: unknown, label: string): DomainProvenance {
  const actual = expectString(value, label);
  expect(["bootstrap", "stream", "playback"]).toContain(actual);
  return actual as DomainProvenance;
}

function expectNullable<T>(
  value: unknown,
  label: string,
  readValue: (inner: unknown, innerLabel: string) => T,
): T | null {
  return value === null ? null : readValue(value, label);
}

function expectSessionEnvelope(value: unknown, label: string): SessionEnvelope {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["session_id", "source_kind", "seek_epoch", "reset_revision"]);
  const sourceKind = expectString(object.source_kind, `${label}.source_kind`);
  expect(["live", "playback"]).toContain(sourceKind);
  return {
    session_id: expectString(object.session_id, `${label}.session_id`),
    source_kind: sourceKind as SourceKind,
    seek_epoch: expectNumber(object.seek_epoch, `${label}.seek_epoch`),
    reset_revision: expectNumber(object.reset_revision, `${label}.reset_revision`),
  };
}

function expectSessionConnection(value: unknown, label: string): SessionConnection {
  const object = expectRecord(value, label);
  const kind = expectString(object.kind, `${label}.kind`);
  if (kind === "error") {
    expectExactKeys(object, label, ["kind", "error"]);
    return { kind, error: expectString(object.error, `${label}.error`) };
  }
  expectExactKeys(object, label, ["kind"]);
  expect(["connecting", "connected", "disconnected"]).toContain(kind);
  return { kind: kind as Exclude<SessionConnection["kind"], "error"> };
}

function expectVehicleState(value: unknown, label: string): VehicleState {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, [
    "armed",
    "custom_mode",
    "mode_name",
    "system_status",
    "vehicle_type",
    "autopilot",
    "system_id",
    "component_id",
    "heartbeat_received",
  ]);
  return {
    armed: expectBoolean(object.armed, `${label}.armed`),
    custom_mode: expectNumber(object.custom_mode, `${label}.custom_mode`),
    mode_name: expectString(object.mode_name, `${label}.mode_name`),
    system_status: expectString(object.system_status, `${label}.system_status`),
    vehicle_type: expectString(object.vehicle_type, `${label}.vehicle_type`),
    autopilot: expectString(object.autopilot, `${label}.autopilot`),
    system_id: expectNumber(object.system_id, `${label}.system_id`),
    component_id: expectNumber(object.component_id, `${label}.component_id`),
    heartbeat_received: expectBoolean(object.heartbeat_received, `${label}.heartbeat_received`),
  };
}

function expectHomePosition(value: unknown, label: string): HomePosition {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["latitude_deg", "longitude_deg", "altitude_m"]);
  return {
    latitude_deg: expectNumber(object.latitude_deg, `${label}.latitude_deg`),
    longitude_deg: expectNumber(object.longitude_deg, `${label}.longitude_deg`),
    altitude_m: expectNumber(object.altitude_m, `${label}.altitude_m`),
  };
}

function expectSessionState(value: unknown, label: string): SessionState {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["status", "connection", "vehicle_state", "home_position"]);
  const status = expectString(object.status, `${label}.status`);
  expect(["pending", "active"]).toContain(status);
  expect(object).toHaveProperty("vehicle_state");
  expect(object).toHaveProperty("home_position");
  return {
    status: status as SessionState["status"],
    connection: expectSessionConnection(object.connection, `${label}.connection`),
    vehicle_state: expectNullable(object.vehicle_state ?? null, `${label}.vehicle_state`, expectVehicleState),
    home_position: expectNullable(object.home_position ?? null, `${label}.home_position`, expectHomePosition),
  };
}

function expectNullableNumber(value: unknown, label: string): number | null {
  return value === null ? null : expectNumber(value, label);
}

function expectNullableNumberArray(value: unknown, label: string): number[] | null {
  return value === null ? null : expectNumberArray(value, label);
}

function expectTelemetryState(value: unknown, label: string, options?: { nullable?: boolean }): TelemetryState {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["flight", "navigation", "attitude", "power", "gps", "terrain", "radio"]);

  const flight = expectRecord(object.flight, `${label}.flight`);
  const navigation = expectRecord(object.navigation, `${label}.navigation`);
  const attitude = expectRecord(object.attitude, `${label}.attitude`);
  const power = expectRecord(object.power, `${label}.power`);
  const gps = expectRecord(object.gps, `${label}.gps`);
  const terrain = expectRecord(object.terrain, `${label}.terrain`);
  const radio = expectRecord(object.radio, `${label}.radio`);

  expectExactKeys(flight, `${label}.flight`, ["altitude_m", "speed_mps", "climb_rate_mps", "throttle_pct", "airspeed_mps"]);
  expectExactKeys(navigation, `${label}.navigation`, ["latitude_deg", "longitude_deg", "heading_deg", "wp_dist_m", "nav_bearing_deg", "target_bearing_deg", "xtrack_error_m"]);
  expectExactKeys(attitude, `${label}.attitude`, ["roll_deg", "pitch_deg", "yaw_deg"]);
  expectExactKeys(power, `${label}.power`, ["battery_pct", "battery_voltage_v", "battery_current_a", "battery_voltage_cells", "energy_consumed_wh", "battery_time_remaining_s"]);
  expectExactKeys(gps, `${label}.gps`, ["fix_type", "satellites", "hdop"]);
  expectExactKeys(terrain, `${label}.terrain`, ["terrain_height_m", "height_above_terrain_m"]);
  expectExactKeys(radio, `${label}.radio`, ["rc_channels", "rc_rssi", "servo_outputs"]);

  return {
    flight: {
      altitude_m: options?.nullable ? expectNullableNumber(flight.altitude_m, `${label}.flight.altitude_m`) : expectNumber(flight.altitude_m, `${label}.flight.altitude_m`),
      speed_mps: options?.nullable ? expectNullableNumber(flight.speed_mps, `${label}.flight.speed_mps`) : expectNumber(flight.speed_mps, `${label}.flight.speed_mps`),
      climb_rate_mps: options?.nullable ? expectNullableNumber(flight.climb_rate_mps, `${label}.flight.climb_rate_mps`) : expectNumber(flight.climb_rate_mps, `${label}.flight.climb_rate_mps`),
      throttle_pct: options?.nullable ? expectNullableNumber(flight.throttle_pct, `${label}.flight.throttle_pct`) : expectNumber(flight.throttle_pct, `${label}.flight.throttle_pct`),
      airspeed_mps: options?.nullable ? expectNullableNumber(flight.airspeed_mps, `${label}.flight.airspeed_mps`) : expectNumber(flight.airspeed_mps, `${label}.flight.airspeed_mps`),
    },
    navigation: {
      latitude_deg: options?.nullable ? expectNullableNumber(navigation.latitude_deg, `${label}.navigation.latitude_deg`) : expectNumber(navigation.latitude_deg, `${label}.navigation.latitude_deg`),
      longitude_deg: options?.nullable ? expectNullableNumber(navigation.longitude_deg, `${label}.navigation.longitude_deg`) : expectNumber(navigation.longitude_deg, `${label}.navigation.longitude_deg`),
      heading_deg: options?.nullable ? expectNullableNumber(navigation.heading_deg, `${label}.navigation.heading_deg`) : expectNumber(navigation.heading_deg, `${label}.navigation.heading_deg`),
      wp_dist_m: options?.nullable ? expectNullableNumber(navigation.wp_dist_m, `${label}.navigation.wp_dist_m`) : expectNumber(navigation.wp_dist_m, `${label}.navigation.wp_dist_m`),
      nav_bearing_deg: options?.nullable ? expectNullableNumber(navigation.nav_bearing_deg, `${label}.navigation.nav_bearing_deg`) : expectNumber(navigation.nav_bearing_deg, `${label}.navigation.nav_bearing_deg`),
      target_bearing_deg: options?.nullable ? expectNullableNumber(navigation.target_bearing_deg, `${label}.navigation.target_bearing_deg`) : expectNumber(navigation.target_bearing_deg, `${label}.navigation.target_bearing_deg`),
      xtrack_error_m: options?.nullable ? expectNullableNumber(navigation.xtrack_error_m, `${label}.navigation.xtrack_error_m`) : expectNumber(navigation.xtrack_error_m, `${label}.navigation.xtrack_error_m`),
    },
    attitude: {
      roll_deg: options?.nullable ? expectNullableNumber(attitude.roll_deg, `${label}.attitude.roll_deg`) : expectNumber(attitude.roll_deg, `${label}.attitude.roll_deg`),
      pitch_deg: options?.nullable ? expectNullableNumber(attitude.pitch_deg, `${label}.attitude.pitch_deg`) : expectNumber(attitude.pitch_deg, `${label}.attitude.pitch_deg`),
      yaw_deg: options?.nullable ? expectNullableNumber(attitude.yaw_deg, `${label}.attitude.yaw_deg`) : expectNumber(attitude.yaw_deg, `${label}.attitude.yaw_deg`),
    },
    power: {
      battery_pct: options?.nullable ? expectNullableNumber(power.battery_pct, `${label}.power.battery_pct`) : expectNumber(power.battery_pct, `${label}.power.battery_pct`),
      battery_voltage_v: options?.nullable ? expectNullableNumber(power.battery_voltage_v, `${label}.power.battery_voltage_v`) : expectNumber(power.battery_voltage_v, `${label}.power.battery_voltage_v`),
      battery_current_a: options?.nullable ? expectNullableNumber(power.battery_current_a, `${label}.power.battery_current_a`) : expectNumber(power.battery_current_a, `${label}.power.battery_current_a`),
      battery_voltage_cells: options?.nullable ? expectNullableNumberArray(power.battery_voltage_cells, `${label}.power.battery_voltage_cells`) : expectNumberArray(power.battery_voltage_cells, `${label}.power.battery_voltage_cells`),
      energy_consumed_wh: options?.nullable ? expectNullableNumber(power.energy_consumed_wh, `${label}.power.energy_consumed_wh`) : expectNumber(power.energy_consumed_wh, `${label}.power.energy_consumed_wh`),
      battery_time_remaining_s: options?.nullable ? expectNullableNumber(power.battery_time_remaining_s, `${label}.power.battery_time_remaining_s`) : expectNumber(power.battery_time_remaining_s, `${label}.power.battery_time_remaining_s`),
    },
    gps: {
      fix_type: gps.fix_type === null ? null : expectString(gps.fix_type, `${label}.gps.fix_type`),
      satellites: options?.nullable ? expectNullableNumber(gps.satellites, `${label}.gps.satellites`) : expectNumber(gps.satellites, `${label}.gps.satellites`),
      hdop: options?.nullable ? expectNullableNumber(gps.hdop, `${label}.gps.hdop`) : expectNumber(gps.hdop, `${label}.gps.hdop`),
    },
    terrain: {
      terrain_height_m: options?.nullable ? expectNullableNumber(terrain.terrain_height_m, `${label}.terrain.terrain_height_m`) : expectNumber(terrain.terrain_height_m, `${label}.terrain.terrain_height_m`),
      height_above_terrain_m: options?.nullable ? expectNullableNumber(terrain.height_above_terrain_m, `${label}.terrain.height_above_terrain_m`) : expectNumber(terrain.height_above_terrain_m, `${label}.terrain.height_above_terrain_m`),
    },
    radio: {
      rc_channels: options?.nullable ? expectNullableNumberArray(radio.rc_channels, `${label}.radio.rc_channels`) : expectNumberArray(radio.rc_channels, `${label}.radio.rc_channels`),
      rc_rssi: options?.nullable ? expectNullableNumber(radio.rc_rssi, `${label}.radio.rc_rssi`) : expectNumber(radio.rc_rssi, `${label}.radio.rc_rssi`),
      servo_outputs: options?.nullable ? expectNullableNumberArray(radio.servo_outputs, `${label}.radio.servo_outputs`) : expectNumberArray(radio.servo_outputs, `${label}.radio.servo_outputs`),
    },
  } as TelemetryState;
}

function expectDomainValue<T>(
  value: unknown,
  label: string,
  readValue: (inner: unknown, innerLabel: string) => T,
): DomainValue<T> {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["available", "complete", "provenance", "value"]);
  const available = expectBoolean(object.available, `${label}.available`);
  const complete = expectBoolean(object.complete, `${label}.complete`);
  expect(object).toHaveProperty("value");
  return {
    available,
    complete,
    provenance: expectProvenance(object.provenance, `${label}.provenance`),
    value: expectNullable(object.value ?? null, `${label}.value`, readValue),
  };
}

function expectSupportState(value: unknown, label: string): ContractSupportState {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, [
    "can_request_prearm_checks",
    "can_calibrate_accel",
    "can_calibrate_compass",
    "can_calibrate_radio",
  ]);
  return {
    can_request_prearm_checks: expectBoolean(object.can_request_prearm_checks, `${label}.can_request_prearm_checks`),
    can_calibrate_accel: expectBoolean(object.can_calibrate_accel, `${label}.can_calibrate_accel`),
    can_calibrate_compass: expectBoolean(object.can_calibrate_compass, `${label}.can_calibrate_compass`),
    can_calibrate_radio: expectBoolean(object.can_calibrate_radio, `${label}.can_calibrate_radio`),
  };
}

function expectConfigurationFlag(value: unknown, label: string): ContractConfigurationFlag {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["configured"]);
  return { configured: expectBoolean(object.configured, `${label}.configured`) };
}

function expectConfigurationFactsState(value: unknown, label: string): ContractConfigurationFactsState {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["frame", "gps", "battery_monitor", "motors_esc"]);
  expect(object).toHaveProperty("frame");
  expect(object).toHaveProperty("gps");
  expect(object).toHaveProperty("battery_monitor");
  expect(object).toHaveProperty("motors_esc");
  return {
    frame: expectNullable(object.frame ?? null, `${label}.frame`, expectConfigurationFlag),
    gps: expectNullable(object.gps ?? null, `${label}.gps`, expectConfigurationFlag),
    battery_monitor: expectNullable(object.battery_monitor ?? null, `${label}.battery_monitor`, expectConfigurationFlag),
    motors_esc: expectNullable(object.motors_esc ?? null, `${label}.motors_esc`, expectConfigurationFlag),
  };
}

function expectSensorHealthState(value: unknown, label: string): ContractSensorHealthState {
  const object = expectRecord(value, label);
  const keys: (keyof ContractSensorHealthState)[] = [
    "gyro", "accel", "mag", "baro", "gps",
    "airspeed", "rc_receiver", "battery", "terrain", "geofence",
  ];
  expectExactKeys(object, label, keys);
  return Object.fromEntries(
    keys.map((k) => [k, expectString(object[k], `${label}.${k}`)]),
  ) as ContractSensorHealthState;
}

function expectCalibrationProgress(value: unknown, label: string): ContractCalibrationProgress {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["compass_id", "completion_pct", "status", "attempt"]);
  return {
    compass_id: expectNumber(object.compass_id, `${label}.compass_id`),
    completion_pct: expectNumber(object.completion_pct, `${label}.completion_pct`),
    status: expectString(object.status, `${label}.status`),
    attempt: expectNumber(object.attempt, `${label}.attempt`),
  };
}

function expectCalibrationReport(value: unknown, label: string): ContractCalibrationReport {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["compass_id", "status", "fitness", "ofs_x", "ofs_y", "ofs_z", "autosaved"]);
  return {
    compass_id: expectNumber(object.compass_id, `${label}.compass_id`),
    status: expectString(object.status, `${label}.status`),
    fitness: expectNumber(object.fitness, `${label}.fitness`),
    ofs_x: expectNumber(object.ofs_x, `${label}.ofs_x`),
    ofs_y: expectNumber(object.ofs_y, `${label}.ofs_y`),
    ofs_z: expectNumber(object.ofs_z, `${label}.ofs_z`),
    autosaved: expectBoolean(object.autosaved, `${label}.autosaved`),
  };
}

function expectCalibrationStep(value: unknown, label: string): ContractCalibrationStep {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["lifecycle", "progress", "report"]);
  const lifecycle = expectString(object.lifecycle, `${label}.lifecycle`);
  expect(["not_started", "running", "complete", "failed"]).toContain(lifecycle);
  expect(object).toHaveProperty("progress");
  expect(object).toHaveProperty("report");
  return {
    lifecycle: lifecycle as ContractCalibrationStep["lifecycle"],
    progress: expectNullable(object.progress ?? null, `${label}.progress`, expectCalibrationProgress),
    report: expectNullable(object.report ?? null, `${label}.report`, expectCalibrationReport),
  };
}

function expectCalibrationState(value: unknown, label: string): ContractCalibrationState {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["accel", "compass", "radio"]);
  expect(object).toHaveProperty("accel");
  expect(object).toHaveProperty("compass");
  expect(object).toHaveProperty("radio");
  return {
    accel: expectNullable(object.accel ?? null, `${label}.accel`, expectCalibrationStep),
    compass: expectNullable(object.compass ?? null, `${label}.compass`, expectCalibrationStep),
    radio: expectNullable(object.radio ?? null, `${label}.radio`, expectCalibrationStep),
  };
}

function expectStatusTextState(value: unknown, label: string): StatusTextState {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["entries"]);
  expect(Array.isArray(object.entries), `${label}.entries should be an array`).toBe(true);
  return {
    entries: (object.entries as unknown[]).map((entry, index): StatusMessage => {
      const item = expectRecord(entry, `${label}.entries[${index}]`);
      expectExactKeys(item, `${label}.entries[${index}]`, ["sequence", "text", "severity", "timestamp_usec"]);
      return {
        sequence: expectNumber(item.sequence, `${label}.entries[${index}].sequence`),
        text: expectString(item.text, `${label}.entries[${index}].text`),
        severity: expectString(item.severity, `${label}.entries[${index}].severity`),
        timestamp_usec: expectNumber(item.timestamp_usec, `${label}.entries[${index}].timestamp_usec`),
      };
    }),
  };
}

function expectPlaybackSnapshot(value: unknown, label: string): PlaybackSnapshot {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["cursor_usec"]);
  return {
    cursor_usec:
      object.cursor_usec === null ? null : expectNumber(object.cursor_usec, `${label}.cursor_usec`),
  };
}

function expectFingerprint(value: unknown, label: string): ReferencedFileFingerprint {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["size_bytes", "modified_unix_msec"]);
  return {
    size_bytes: expectNumber(object.size_bytes, `${label}.size_bytes`),
    modified_unix_msec: expectNumber(object.modified_unix_msec, `${label}.modified_unix_msec`),
  };
}

function expectReferencedFileStatus(value: unknown, label: string): ReferencedFileStatus {
  const object = expectRecord(value, label);
  const kind = expectString(object.kind, `${label}.kind`);
  if (kind === "available" || kind === "stale") {
    expectExactKeys(object, label, ["kind", "current_fingerprint"]);
    return { kind, current_fingerprint: expectFingerprint(object.current_fingerprint, `${label}.current_fingerprint`) };
  }
  expectExactKeys(object, label, ["kind"]);
  expect(kind).toBe("missing");
  return { kind: "missing" };
}

function expectLogDiagnostic(value: unknown, label: string): LogDiagnostic {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["severity", "source", "code", "message", "recoverable", "timestamp_usec"]);
  const severity = expectString(object.severity, `${label}.severity`);
  const source = expectString(object.source, `${label}.source`);
  expect(["info", "warning", "error"]).toContain(severity);
  expect(["catalog", "file_system", "parse", "index", "replay", "export", "recording"]).toContain(source);
  return {
    severity: severity as LogDiagnostic["severity"],
    source: source as LogDiagnostic["source"],
    code: expectString(object.code, `${label}.code`),
    message: expectString(object.message, `${label}.message`),
    recoverable: expectBoolean(object.recoverable, `${label}.recoverable`),
    timestamp_usec: object.timestamp_usec === null ? null : expectNumber(object.timestamp_usec, `${label}.timestamp_usec`),
  };
}

function expectLogFormatAdapter(value: unknown, label: string): LogFormatAdapter {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["format", "label", "file_extensions", "supports_replay", "supports_raw_messages", "supports_chart_series"]);
  const format = expectString(object.format, `${label}.format`);
  expect(["tlog", "bin"]).toContain(format);
  return {
    format: format as LogFormatAdapter["format"],
    label: expectString(object.label, `${label}.label`),
    file_extensions: expectStringArray(object.file_extensions, `${label}.file_extensions`),
    supports_replay: expectBoolean(object.supports_replay, `${label}.supports_replay`),
    supports_raw_messages: expectBoolean(object.supports_raw_messages, `${label}.supports_raw_messages`),
    supports_chart_series: expectBoolean(object.supports_chart_series, `${label}.supports_chart_series`),
  };
}

function expectLogFormatAdapters(value: unknown, label: string): LogFormatAdapter[] {
  expect(Array.isArray(value), `${label} should be an array`).toBe(true);
  return (value as unknown[]).map((entry, index) => expectLogFormatAdapter(entry, `${label}[${index}]`));
}

function expectLogCatalogMigrationError(value: unknown, label: string): LogCatalogMigrationError {
  const object = expectRecord(value, label);
  const kind = expectString(object.kind, `${label}.kind`);
  if (kind === "missing_schema_version") {
    expectExactKeys(object, label, ["kind"]);
    return { kind };
  }
  if (kind === "unsupported_schema_version") {
    expectExactKeys(object, label, ["kind", "schema_version", "supported_schema_version"]);
    return {
      kind,
      schema_version: expectNumber(object.schema_version, `${label}.schema_version`),
      supported_schema_version: expectNumber(object.supported_schema_version, `${label}.supported_schema_version`),
    };
  }
  expect(kind).toBe("invalid_catalog");
  expectExactKeys(object, label, ["kind", "message"]);
  return { kind: "invalid_catalog", message: expectString(object.message, `${label}.message`) };
}

function expectLogLibraryEntry(value: unknown, label: string): LogLibraryEntry {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["entry_id", "status", "imported_at_unix_msec", "source", "metadata", "diagnostics", "index"]);
  const source = expectRecord(object.source, `${label}.source`);
  expectExactKeys(source, `${label}.source`, ["original_path", "fingerprint", "status"]);
  const metadata = expectRecord(object.metadata, `${label}.metadata`);
  expectExactKeys(metadata, `${label}.metadata`, ["display_name", "format", "start_usec", "end_usec", "duration_secs", "total_messages", "message_types", "vehicle_type", "autopilot"]);
  const status = expectString(object.status, `${label}.status`);
  expect(["ready", "missing", "stale", "indexing", "partial", "corrupt", "unsupported"]).toContain(status);
  const messageTypes = expectRecord(metadata.message_types, `${label}.metadata.message_types`);
  const diagnostics = (object.diagnostics as unknown[]).map((entry, index) => expectLogDiagnostic(entry, `${label}.diagnostics[${index}]`));
  const index = object.index === null ? null : expectRecord(object.index, `${label}.index`);
  if (index) {
    expectExactKeys(index, `${label}.index`, ["index_id", "relative_path", "format", "index_version", "built_at_unix_msec", "message_count", "covers_start_usec", "covers_end_usec"]);
  }
  return {
    entry_id: expectString(object.entry_id, `${label}.entry_id`),
    status: status as LogLibraryEntryStatus,
    imported_at_unix_msec: expectNumber(object.imported_at_unix_msec, `${label}.imported_at_unix_msec`),
    source: {
      original_path: expectString(source.original_path, `${label}.source.original_path`),
      fingerprint: expectFingerprint(source.fingerprint, `${label}.source.fingerprint`),
      status: expectReferencedFileStatus(source.status, `${label}.source.status`),
    },
    metadata: {
      display_name: expectString(metadata.display_name, `${label}.metadata.display_name`),
      format: expectString(metadata.format, `${label}.metadata.format`) as LogLibraryEntry["metadata"]["format"],
      start_usec: metadata.start_usec === null ? null : expectNumber(metadata.start_usec, `${label}.metadata.start_usec`),
      end_usec: metadata.end_usec === null ? null : expectNumber(metadata.end_usec, `${label}.metadata.end_usec`),
      duration_secs: metadata.duration_secs === null ? null : expectNumber(metadata.duration_secs, `${label}.metadata.duration_secs`),
      total_messages: expectNumber(metadata.total_messages, `${label}.metadata.total_messages`),
      message_types: Object.fromEntries(Object.entries(messageTypes).map(([key, item]) => [key, expectNumber(item, `${label}.metadata.message_types.${key}`)])),
      vehicle_type: metadata.vehicle_type === null ? null : expectString(metadata.vehicle_type, `${label}.metadata.vehicle_type`),
      autopilot: metadata.autopilot === null ? null : expectString(metadata.autopilot, `${label}.metadata.autopilot`),
    },
    diagnostics,
    index: index === null ? null : {
      index_id: expectString(index.index_id, `${label}.index.index_id`),
      relative_path: expectString(index.relative_path, `${label}.index.relative_path`),
      format: expectString(index.format, `${label}.index.format`) as LogLibraryEntry["metadata"]["format"],
      index_version: expectNumber(index.index_version, `${label}.index.index_version`),
      built_at_unix_msec: expectNumber(index.built_at_unix_msec, `${label}.index.built_at_unix_msec`),
      message_count: expectNumber(index.message_count, `${label}.index.message_count`),
      covers_start_usec: index.covers_start_usec === null ? null : expectNumber(index.covers_start_usec, `${label}.index.covers_start_usec`),
      covers_end_usec: index.covers_end_usec === null ? null : expectNumber(index.covers_end_usec, `${label}.index.covers_end_usec`),
    },
  };
}

function expectLogLibraryCatalog(value: unknown, label: string): LogLibraryCatalog {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["schema_version", "storage", "migrated_from_schema_version", "entries"]);
  expect(object.schema_version).toBe(1);
  const storage = expectRecord(object.storage, `${label}.storage`);
  expectExactKeys(storage, `${label}.storage`, ["kind", "catalog_path", "indexes_dir", "recordings_dir"]);
  expect(storage.kind).toBe("app_data");
  return {
    schema_version: 1,
    storage: {
      kind: "app_data",
      catalog_path: expectString(storage.catalog_path, `${label}.storage.catalog_path`),
      indexes_dir: expectString(storage.indexes_dir, `${label}.storage.indexes_dir`),
      recordings_dir: expectString(storage.recordings_dir, `${label}.storage.recordings_dir`),
    },
    migrated_from_schema_version: object.migrated_from_schema_version === null ? null : expectNumber(object.migrated_from_schema_version, `${label}.migrated_from_schema_version`),
    entries: (object.entries as unknown[]).map((entry, index) => expectLogLibraryEntry(entry, `${label}.entries[${index}]`)),
  };
}

function expectLogProgress(value: unknown, label: string): LogProgress {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["operation_id", "phase", "completed_items", "total_items", "percent", "entry_id", "instance_id", "message"]);
  const phase = expectString(object.phase, `${label}.phase`);
  expect(["queued", "reading_metadata", "parsing", "indexing", "writing_catalog", "exporting", "completed", "cancelled", "failed"]).toContain(phase);
  return {
    operation_id: expectOperationId(object.operation_id, `${label}.operation_id`),
    phase: phase as LogProgress["phase"],
    completed_items: expectNumber(object.completed_items, `${label}.completed_items`),
    total_items: object.total_items === null ? null : expectNumber(object.total_items, `${label}.total_items`),
    percent: object.percent === null ? null : expectNumber(object.percent, `${label}.percent`),
    entry_id: object.entry_id === null ? null : expectString(object.entry_id, `${label}.entry_id`),
    instance_id: object.instance_id === null ? null : expectString(object.instance_id, `${label}.instance_id`),
    message: object.message === null ? null : expectString(object.message, `${label}.message`),
  };
}

function expectReplayState(value: unknown, label: string): PlaybackStateSnapshot {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["status", "entry_id", "operation_id", "cursor_usec", "start_usec", "end_usec", "duration_secs", "speed", "available_speeds", "barrier_ready", "readonly", "diagnostic"]);
  const status = expectString(object.status, `${label}.status`);
  expect(["idle", "loading", "ready", "playing", "paused", "seeking", "ended", "error"]).toContain(status);
  return {
    status: status as PlaybackStateSnapshot["status"],
    entry_id: object.entry_id === null ? null : expectString(object.entry_id, `${label}.entry_id`),
    operation_id: object.operation_id === null ? null : expectOperationId(object.operation_id, `${label}.operation_id`),
    cursor_usec: object.cursor_usec === null ? null : expectNumber(object.cursor_usec, `${label}.cursor_usec`),
    start_usec: object.start_usec === null ? null : expectNumber(object.start_usec, `${label}.start_usec`),
    end_usec: object.end_usec === null ? null : expectNumber(object.end_usec, `${label}.end_usec`),
    duration_secs: object.duration_secs === null ? null : expectNumber(object.duration_secs, `${label}.duration_secs`),
    speed: expectNumber(object.speed, `${label}.speed`),
    available_speeds: expectNumberArray(object.available_speeds, `${label}.available_speeds`),
    barrier_ready: expectBoolean(object.barrier_ready, `${label}.barrier_ready`),
    readonly: expectBoolean(object.readonly, `${label}.readonly`),
    diagnostic: object.diagnostic === null ? null : expectLogDiagnostic(object.diagnostic, `${label}.diagnostic`),
  };
}

function expectRawMessageRecord(value: unknown, label: string): RawMessageRecord {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["sequence", "timestamp_usec", "message_type", "system_id", "component_id", "raw_len_bytes", "fields", "detail", "hex_payload", "diagnostics"]);
  const fields = expectRecord(object.fields, `${label}.fields`);
  const parsedFields: Record<string, JsonFieldValue> = {};
  for (const [key, entry] of Object.entries(fields)) {
    parsedFields[key] = expectJsonFieldValue(entry, `${label}.fields.${key}`);
  }
  return {
    sequence: expectNumber(object.sequence, `${label}.sequence`),
    timestamp_usec: expectNumber(object.timestamp_usec, `${label}.timestamp_usec`),
    message_type: expectString(object.message_type, `${label}.message_type`),
    system_id: object.system_id === null ? null : expectNumber(object.system_id, `${label}.system_id`),
    component_id: object.component_id === null ? null : expectNumber(object.component_id, `${label}.component_id`),
    raw_len_bytes: expectNumber(object.raw_len_bytes, `${label}.raw_len_bytes`),
    fields: parsedFields,
    detail: object.detail === null ? null : expectJsonFieldValue(object.detail, `${label}.detail`),
    hex_payload: object.hex_payload === null ? null : expectString(object.hex_payload, `${label}.hex_payload`),
    diagnostics: (object.diagnostics as unknown[]).map((entry, index) => expectLogDiagnostic(entry, `${label}.diagnostics[${index}]`)),
  };
}

function expectRawMessageFieldFilter(value: unknown, label: string): RawMessageFieldFilter {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["field", "value_text"]);
  return {
    field: expectString(object.field, `${label}.field`),
    value_text: object.value_text === null ? null : expectString(object.value_text, `${label}.value_text`),
  };
}

function expectRawMessageQuery(value: unknown, label: string): RawMessageQuery {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["entry_id", "cursor", "start_usec", "end_usec", "message_types", "text", "field_filters", "limit", "include_detail", "include_hex"]);
  return {
    entry_id: expectString(object.entry_id, `${label}.entry_id`),
    cursor: object.cursor === null ? null : expectString(object.cursor, `${label}.cursor`),
    start_usec: object.start_usec === null ? null : expectNumber(object.start_usec, `${label}.start_usec`),
    end_usec: object.end_usec === null ? null : expectNumber(object.end_usec, `${label}.end_usec`),
    message_types: expectStringArray(object.message_types, `${label}.message_types`),
    text: object.text === null ? null : expectString(object.text, `${label}.text`),
    field_filters: (object.field_filters as unknown[]).map((entry, index) => expectRawMessageFieldFilter(entry, `${label}.field_filters[${index}]`)),
    limit: expectNumber(object.limit, `${label}.limit`),
    include_detail: expectBoolean(object.include_detail, `${label}.include_detail`),
    include_hex: expectBoolean(object.include_hex, `${label}.include_hex`),
  };
}

function expectRawMessagePage(value: unknown, label: string): RawMessagePage {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["entry_id", "items", "next_cursor", "total_available"]);
  return {
    entry_id: expectString(object.entry_id, `${label}.entry_id`),
    items: (object.items as unknown[]).map((entry, index) => expectRawMessageRecord(entry, `${label}.items[${index}]`)),
    next_cursor: object.next_cursor === null ? null : expectString(object.next_cursor, `${label}.next_cursor`),
    total_available: object.total_available === null ? null : expectNumber(object.total_available, `${label}.total_available`),
  };
}

function expectChartSeriesSelector(value: unknown, label: string): ChartSeriesSelector {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["message_type", "field", "label", "unit"]);
  return {
    message_type: expectString(object.message_type, `${label}.message_type`),
    field: expectString(object.field, `${label}.field`),
    label: expectString(object.label, `${label}.label`),
    unit: object.unit === null ? null : expectString(object.unit, `${label}.unit`),
  };
}

function expectChartPoint(value: unknown, label: string): ChartPoint {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["timestamp_usec", "value"]);
  return {
    timestamp_usec: expectNumber(object.timestamp_usec, `${label}.timestamp_usec`),
    value: expectNumber(object.value, `${label}.value`),
  };
}

function expectChartSeries(value: unknown, label: string): ChartSeries {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["selector", "points"]);
  return {
    selector: expectChartSeriesSelector(object.selector, `${label}.selector`),
    points: (object.points as unknown[]).map((entry, index) => expectChartPoint(entry, `${label}.points[${index}]`)),
  };
}

function expectChartSeriesRequest(value: unknown, label: string): ChartSeriesRequest {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["entry_id", "selectors", "start_usec", "end_usec", "max_points"]);
  return {
    entry_id: expectString(object.entry_id, `${label}.entry_id`),
    selectors: (object.selectors as unknown[]).map((entry, index) => expectChartSeriesSelector(entry, `${label}.selectors[${index}]`)),
    start_usec: object.start_usec === null ? null : expectNumber(object.start_usec, `${label}.start_usec`),
    end_usec: object.end_usec === null ? null : expectNumber(object.end_usec, `${label}.end_usec`),
    max_points: object.max_points === null ? null : expectNumber(object.max_points, `${label}.max_points`),
  };
}

function expectChartSeriesPage(value: unknown, label: string): ChartSeriesPage {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["entry_id", "start_usec", "end_usec", "series", "diagnostics"]);
  return {
    entry_id: expectString(object.entry_id, `${label}.entry_id`),
    start_usec: object.start_usec === null ? null : expectNumber(object.start_usec, `${label}.start_usec`),
    end_usec: object.end_usec === null ? null : expectNumber(object.end_usec, `${label}.end_usec`),
    series: (object.series as unknown[]).map((entry, index) => expectChartSeries(entry, `${label}.series[${index}]`)),
    diagnostics: (object.diagnostics as unknown[]).map((entry, index) => expectLogDiagnostic(entry, `${label}.diagnostics[${index}]`)),
  };
}

function expectLogExportRequest(value: unknown, label: string): LogExportRequest {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["entry_id", "instance_id", "format", "destination_path", "start_usec", "end_usec", "message_types", "text", "field_filters"]);
  const format = expectString(object.format, `${label}.format`);
  expect(format).toBe("csv");
  return {
    entry_id: expectString(object.entry_id, `${label}.entry_id`),
    instance_id: expectString(object.instance_id, `${label}.instance_id`),
    format: format as LogExportRequest["format"],
    destination_path: expectString(object.destination_path, `${label}.destination_path`),
    start_usec: object.start_usec === null ? null : expectNumber(object.start_usec, `${label}.start_usec`),
    end_usec: object.end_usec === null ? null : expectNumber(object.end_usec, `${label}.end_usec`),
    message_types: expectStringArray(object.message_types, `${label}.message_types`),
    text: object.text === null ? null : expectString(object.text, `${label}.text`),
    field_filters: (object.field_filters as unknown[]).map((entry, index) => expectRawMessageFieldFilter(entry, `${label}.field_filters[${index}]`)),
  };
}

function expectLogExportResult(value: unknown, label: string): LogExportResult {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["operation_id", "destination_path", "bytes_written", "rows_written", "diagnostics"]);
  return {
    operation_id: expectOperationId(object.operation_id, `${label}.operation_id`),
    destination_path: expectString(object.destination_path, `${label}.destination_path`),
    bytes_written: expectNumber(object.bytes_written, `${label}.bytes_written`),
    rows_written: expectNumber(object.rows_written, `${label}.rows_written`),
    diagnostics: (object.diagnostics as unknown[]).map((entry, index) => expectLogDiagnostic(entry, `${label}.diagnostics[${index}]`)),
  };
}

function expectRecordingSettings(value: unknown, label: string): RecordingSettings {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["auto_record_on_connect", "auto_record_directory", "filename_template", "add_completed_recordings_to_library"]);
  return {
    auto_record_on_connect: expectBoolean(object.auto_record_on_connect, `${label}.auto_record_on_connect`),
    auto_record_directory: expectString(object.auto_record_directory, `${label}.auto_record_directory`),
    filename_template: expectString(object.filename_template, `${label}.filename_template`),
    add_completed_recordings_to_library: expectBoolean(object.add_completed_recordings_to_library, `${label}.add_completed_recordings_to_library`),
  };
}

function expectRecordingStartRequest(value: unknown, label: string): RecordingStartRequest {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["destination_path", "mode"]);
  const mode = expectString(object.mode, `${label}.mode`);
  expect(["manual", "auto_on_connect"]).toContain(mode);
  return {
    destination_path: expectString(object.destination_path, `${label}.destination_path`),
    mode: mode as RecordingMode,
  };
}

function expectRecordingSettingsResult(value: unknown, label: string): RecordingSettingsResult {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["operation_id", "settings"]);
  return {
    operation_id: expectOperationId(object.operation_id, `${label}.operation_id`),
    settings: expectRecordingSettings(object.settings, `${label}.settings`),
  };
}

function expectRecordingFailure(value: unknown, label: string): RecordingFailure {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["operation_id", "reason", "destination_path"]);
  return {
    operation_id: expectOperationId(object.operation_id, `${label}.operation_id`),
    reason: expectReason(object.reason, `${label}.reason`),
    destination_path: object.destination_path === null ? null : expectString(object.destination_path, `${label}.destination_path`),
  };
}

function expectRecordingStatus(value: unknown, label: string): RecordingStatus {
  const object = expectRecord(value, label);
  const kind = expectString(object.kind, `${label}.kind`);
  if (kind === "idle") {
    expectExactKeys(object, label, ["kind"]);
    return { kind };
  }
  if (kind === "recording") {
    expectExactKeys(object, label, ["kind", "operation_id", "mode", "file_name", "destination_path", "bytes_written", "started_at_unix_msec"]);
    return {
      kind,
      operation_id: expectOperationId(object.operation_id, `${label}.operation_id`) as "recording_start",
      mode: expectString(object.mode, `${label}.mode`) as RecordingMode,
      file_name: expectString(object.file_name, `${label}.file_name`),
      destination_path: expectString(object.destination_path, `${label}.destination_path`),
      bytes_written: expectNumber(object.bytes_written, `${label}.bytes_written`),
      started_at_unix_msec: expectNumber(object.started_at_unix_msec, `${label}.started_at_unix_msec`),
    };
  }
  if (kind === "stopping") {
    expectExactKeys(object, label, ["kind", "operation_id", "file_name", "destination_path", "bytes_written"]);
    return {
      kind,
      operation_id: expectOperationId(object.operation_id, `${label}.operation_id`) as "recording_stop",
      file_name: expectString(object.file_name, `${label}.file_name`),
      destination_path: expectString(object.destination_path, `${label}.destination_path`),
      bytes_written: expectNumber(object.bytes_written, `${label}.bytes_written`),
    };
  }
  expect(kind).toBe("failed");
  expectExactKeys(object, label, ["kind", "failure"]);
  return { kind: "failed", failure: expectOperationFailure(object.failure, `${label}.failure`) };
}

function expectMissionState(value: unknown, label: string): MissionState {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["active_op", "current_index", "plan", "sync"]);
  return {
    plan: object.plan === null ? null : expectMissionPlan(object.plan, `${label}.plan`),
    current_index: object.current_index === null ? null : expectNumber(object.current_index, `${label}.current_index`),
    sync: expectString(object.sync, `${label}.sync`) as MissionState["sync"],
    active_op: object.active_op === null ? null : expectString(object.active_op, `${label}.active_op`) as MissionState["active_op"],
  };
}

function expectParamStore(value: unknown, label: string): ParamStore {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["params", "expected_count"]);
  const params = expectRecord(object.params, `${label}.params`);
  return {
    params: Object.fromEntries(Object.entries(params).map(([name, entry]) => {
      const param = expectRecord(entry, `${label}.params.${name}`);
      expectExactKeys(param, `${label}.params.${name}`, ["name", "value", "param_type", "index"]);
      return [name, {
        name: expectString(param.name, `${label}.params.${name}.name`),
        value: expectNumber(param.value, `${label}.params.${name}.value`),
        param_type: expectString(param.param_type, `${label}.params.${name}.param_type`) as ParamStore["params"][string]["param_type"],
        index: expectNumber(param.index, `${label}.params.${name}.index`),
      }];
    })),
    expected_count: expectNumber(object.expected_count, `${label}.expected_count`),
  };
}

function expectParamProgress(value: unknown, label: string): ParamProgress {
  // ParamOperationProgress is an externally-tagged serde enum:
  // unit variants serialize as strings ("completed", "failed", "cancelled")
  // data variants as objects ({ downloading: {...} }, { writing: {...} })
  if (typeof value === "string") {
    expect(["completed", "failed", "cancelled"]).toContain(value);
    return value as ParamProgress;
  }
  const obj = expectRecord(value, label);
  if ("downloading" in obj) {
    const d = expectRecord(obj.downloading, `${label}.downloading`);
    expectNumber(d.received, `${label}.downloading.received`);
    // expected is Option<u16> → nullable
    expect(d.expected === null || typeof d.expected === "number").toBe(true);
    return value as ParamProgress;
  }
  if ("writing" in obj) {
    const w = expectRecord(obj.writing, `${label}.writing`);
    expectNumber(w.index, `${label}.writing.index`);
    expectNumber(w.total, `${label}.writing.total`);
    expectString(w.name, `${label}.writing.name`);
    return value as ParamProgress;
  }
  throw new Error(`${label}: unrecognised ParamOperationProgress shape`);
}

function expectOpenSessionSnapshot(value: unknown, label: string): ContractOpenSessionSnapshot {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["envelope", "session", "telemetry", "mission_state", "param_store", "param_progress", "support", "sensor_health", "configuration_facts", "calibration", "guided", "status_text", "playback"]);
  const envelope = expectSessionEnvelope(object.envelope, `${label}.envelope`);
  return {
    envelope,
    session: expectDomainValue(object.session, `${label}.session`, expectSessionState),
    telemetry: expectDomainValue(object.telemetry, `${label}.telemetry`, (inner, innerLabel) => expectTelemetryState(inner, innerLabel, { nullable: envelope.source_kind === "playback" })),
    mission_state: object.mission_state === null ? null : expectMissionState(object.mission_state, `${label}.mission_state`),
    param_store: object.param_store === null ? null : expectParamStore(object.param_store, `${label}.param_store`),
    param_progress: object.param_progress === null ? null : expectParamProgress(object.param_progress, `${label}.param_progress`),
    support: expectDomainValue(object.support, `${label}.support`, expectSupportState),
    sensor_health: expectDomainValue(object.sensor_health, `${label}.sensor_health`, expectSensorHealthState),
    configuration_facts: expectDomainValue(object.configuration_facts, `${label}.configuration_facts`, expectConfigurationFactsState),
    calibration: expectDomainValue(object.calibration, `${label}.calibration`, expectCalibrationState),
    guided: expectDomainValue(object.guided, `${label}.guided`, expectGuidedState),
    status_text: expectDomainValue(object.status_text, `${label}.status_text`, expectStatusTextState),
    playback: expectPlaybackSnapshot(object.playback, `${label}.playback`),
  };
}

function expectGeoPoint2d(value: unknown, label: string): GeoPoint2d {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["latitude_deg", "longitude_deg"]);
  return {
    latitude_deg: expectNumber(object.latitude_deg, `${label}.latitude_deg`),
    longitude_deg: expectNumber(object.longitude_deg, `${label}.longitude_deg`),
  };
}

function expectGeoPoint3d(value: unknown, label: string): GeoPoint3d {
  const object = expectRecord(value, label);
  const keys = Object.keys(object);
  expect(keys.length, `${label} should have exactly one variant key`).toBe(1);
  const variant = keys[0];
  expect(["Msl", "RelHome", "Terrain"]).toContain(variant);
  const inner = expectRecord(object[variant], `${label}.${variant}`);
  if (variant === "Msl") {
    expectExactKeys(inner, `${label}.${variant}`, ["latitude_deg", "longitude_deg", "altitude_msl_m"]);
    return { Msl: { latitude_deg: expectNumber(inner.latitude_deg, `${label}.${variant}.latitude_deg`), longitude_deg: expectNumber(inner.longitude_deg, `${label}.${variant}.longitude_deg`), altitude_msl_m: expectNumber(inner.altitude_msl_m, `${label}.${variant}.altitude_msl_m`) } };
  }
  if (variant === "RelHome") {
    expectExactKeys(inner, `${label}.${variant}`, ["latitude_deg", "longitude_deg", "relative_alt_m"]);
    return { RelHome: { latitude_deg: expectNumber(inner.latitude_deg, `${label}.${variant}.latitude_deg`), longitude_deg: expectNumber(inner.longitude_deg, `${label}.${variant}.longitude_deg`), relative_alt_m: expectNumber(inner.relative_alt_m, `${label}.${variant}.relative_alt_m`) } };
  }
  expectExactKeys(inner, `${label}.${variant}`, ["latitude_deg", "longitude_deg", "altitude_terrain_m"]);
  return { Terrain: { latitude_deg: expectNumber(inner.latitude_deg, `${label}.${variant}.latitude_deg`), longitude_deg: expectNumber(inner.longitude_deg, `${label}.${variant}.longitude_deg`), altitude_terrain_m: expectNumber(inner.altitude_terrain_m, `${label}.${variant}.altitude_terrain_m`) } };
}

function expectMissionCommand(value: unknown, label: string): Record<string, unknown> {
  const object = expectRecord(value, label);
  const keys = Object.keys(object);
  expect(keys.length, `${label} should have exactly one variant key`).toBe(1);
  expect(["Nav", "Do", "Condition", "Other"]).toContain(keys[0]);
  return object;
}

function expectMissionItem(value: unknown, label: string): MissionItem {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["command", "current", "autocontinue"]);
  return {
    command: expectMissionCommand(object.command, `${label}.command`) as MissionItem["command"],
    current: expectBoolean(object.current, `${label}.current`),
    autocontinue: expectBoolean(object.autocontinue, `${label}.autocontinue`),
  };
}

function expectMissionPlan(value: unknown, label: string): MissionPlan {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["items"]);
  expect(Array.isArray(object.items), `${label}.items should be an array`).toBe(true);
  return {
    items: (object.items as unknown[]).map((item, index) => expectMissionItem(item, `${label}.items[${index}]`)),
  };
}

function expectFenceRegion(value: unknown, label: string): FenceRegion {
  const object = expectRecord(value, label);
  const keys = Object.keys(object);
  expect(keys.length, `${label} should have exactly one variant key`).toBe(1);
  expect(["inclusion_polygon", "exclusion_polygon", "inclusion_circle", "exclusion_circle"]).toContain(keys[0]);
  return object as FenceRegion;
}

function expectFencePlan(value: unknown, label: string): FencePlan {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["return_point", "regions"]);
  expect(Array.isArray(object.regions), `${label}.regions should be an array`).toBe(true);
  return {
    return_point: object.return_point === null ? null : expectGeoPoint2d(object.return_point, `${label}.return_point`),
    regions: (object.regions as unknown[]).map((r, i) => expectFenceRegion(r, `${label}.regions[${i}]`)),
  };
}

function expectRallyPlan(value: unknown, label: string): RallyPlan {
  const object = expectRecord(value, label);
  expectExactKeys(object, label, ["points"]);
  expect(Array.isArray(object.points), `${label}.points should be an array`).toBe(true);
  return {
    points: (object.points as unknown[]).map((p, i) => expectGeoPoint3d(p, `${label}.points[${i}]`)),
  };
}

describe("contract fixtures", () => {
  it("accepts every log catalog migration error discriminant used by the Rust contract", () => {
    expectLogCatalogMigrationError({ kind: "missing_schema_version" }, "migration.missing");
    expectLogCatalogMigrationError({
      kind: "unsupported_schema_version",
      schema_version: 2,
      supported_schema_version: 1,
    }, "migration.unsupported");
    expectLogCatalogMigrationError({ kind: "invalid_catalog", message: "bad catalog" }, "migration.invalid");
  });

  const cases: Array<[string, (value: unknown, label: string) => unknown]> = [
    ["session.domain.json", (value, label) => expectDomainValue(value, label, expectSessionState) satisfies SessionDomain],
    ["telemetry.domain.json", (value, label) => expectDomainValue(value, label, expectTelemetryState)],
    ["support.domain.json", (value, label) => expectDomainValue(value, label, expectSupportState)],
    ["sensor_health.domain.json", (value, label) => expectDomainValue(value, label, expectSensorHealthState)],
    ["configuration_facts.domain.json", (value, label) => expectDomainValue(value, label, expectConfigurationFactsState)],
    ["calibration.domain.json", (value, label) => expectDomainValue(value, label, expectCalibrationState)],
    ["guided.domain.json", (value, label) => expectDomainValue(value, label, expectGuidedState)],
    ["status_text.domain.json", (value, label) => expectDomainValue(value, label, expectStatusTextState) satisfies StatusTextDomain],
    ["open_session.live.json", expectOpenSessionSnapshot],
    ["open_session.playback.json", expectOpenSessionSnapshot],
    ["mission.plan.json", expectMissionPlan],
    ["fence.plan.json", expectFencePlan],
    ["rally.plan.json", expectRallyPlan],
    ["log_format_adapters.json", expectLogFormatAdapters],
    ["log_library.catalog.v1.json", expectLogLibraryCatalog],
    ["log_catalog.migration_error.json", expectLogCatalogMigrationError],
    ["log_library.progress.json", expectLogProgress],
    ["replay.state.json", expectReplayState],
    ["log_raw_messages.query.json", expectRawMessageQuery],
    ["log_raw_messages.page.json", expectRawMessagePage],
    ["log_chart_series.request.json", expectChartSeriesRequest],
    ["log_chart_series.page.json", expectChartSeriesPage],
    ["log_export.request.json", expectLogExportRequest],
    ["log_export.result.json", expectLogExportResult],
    ["recording.start_request.json", expectRecordingStartRequest],
    ["recording.settings.json", expectRecordingSettings],
    ["recording.settings_result.json", expectRecordingSettingsResult],
    ["recording.failure.json", expectRecordingFailure],
    ["recording.status.json", expectRecordingStatus],
  ];

  it.each(cases)("validates %s against the TypeScript contract", (name, validate) => {
    expect(validate(loadFixture(name), name)).toEqual(loadFixture(name));
  });
});
