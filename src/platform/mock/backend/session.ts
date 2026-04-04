import { liveGuidedDomain } from "./guided";
import { mockState, nextEnvelope, resetGuided, sweepExpiredPending } from "./runtime";
import type { CommandArgs, SessionConnection, SessionEnvelope, MockPlatformEvent } from "./types";

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

export function openSessionSnapshotResult(sourceKind: "live" | "playback") {
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

export function playbackStreamEvents(envelope: SessionEnvelope, cursorUsec: number | null): MockPlatformEvent[] {
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

function missingPendingAckResult() {
  return {
    result: "rejected",
    failure: {
      operation_id: "ack_session_snapshot",
      reason: { kind: "timeout", message: "pending session expired or missing" },
    },
  };
}

export function ackSessionSnapshotResult(args: CommandArgs) {
  sweepExpiredPending();
  if (!mockState.pendingLiveEnvelope && !mockState.pendingPlaybackEnvelope) {
    return missingPendingAckResult();
  }

  const pending = [mockState.pendingLiveEnvelope, mockState.pendingPlaybackEnvelope].find((entry) => entry
    && args?.sessionId === entry.envelope.session_id
    && args?.seekEpoch === entry.envelope.seek_epoch
    && args?.resetRevision === entry.envelope.reset_revision) ?? null;

  if (!pending) {
    if (!mockState.pendingLiveEnvelope && !mockState.pendingPlaybackEnvelope) {
      return missingPendingAckResult();
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
}

export function playbackSeekResult(args: CommandArgs): {
  envelope: SessionEnvelope;
  cursor_usec: number | null;
  events: MockPlatformEvent[];
} {
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
  mockState.playbackCursorUsec = (args?.cursorUsec as number | undefined) ?? null;

  return {
    envelope: mockState.playbackEnvelope,
    cursor_usec: mockState.playbackCursorUsec,
    events: playbackStreamEvents(mockState.playbackEnvelope, mockState.playbackCursorUsec),
  };
}
