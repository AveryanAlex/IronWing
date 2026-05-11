import { invoke } from "@platform/core";
import { listen, type UnlistenFn } from "@platform/event";
import type { CalibrationDomain } from "./calibration";
import type { GuidedDomain } from "./guided";
import type { DomainValue } from "./lib/domain-status";
import type { ConfigurationFactsState } from "./configuration-facts";
import type { HomePosition, MissionState } from "./mission";
import type { ParamProgress, ParamStore } from "./params";
import { withPersistedRecordingSettings } from "./recording";
import type { SensorHealthDomain } from "./sensor-health";
import type { StatusTextDomain } from "./statustext";
import type { SupportDomain } from "./support";
import type { ConnectRequest, DisconnectRequest } from "./transport";
import type { VehicleState, TelemetryState } from "./telemetry";

export type SourceKind = "live" | "playback";

export type SessionEnvelope = {
  session_id: string;
  source_kind: SourceKind;
  seek_epoch: number;
  reset_revision: number;
};

export const OPERATION_IDS = [
  "open_session_snapshot",
  "ack_session_snapshot",
  "arm_vehicle",
  "disarm_vehicle",
  "set_flight_mode",
  "vehicle_takeoff",
  "start_guided_session",
  "update_guided_session",
  "stop_guided_session",
  "set_message_rate",
  "mission_upload",
  "mission_download",
  "mission_clear",
  "fence_upload",
  "fence_download",
  "fence_clear",
  "rally_upload",
  "rally_download",
  "rally_clear",
  "mission_set_current",
  "calibrate_accel",
  "calibrate_gyro",
  "param_write",
  "param_write_batch",
  "reboot_vehicle",
  "motor_test",
  "set_servo",
  "rc_override",
  "calibrate_compass_start",
  "calibrate_compass_accept",
  "calibrate_compass_cancel",
  "request_prearm_checks",
  "log_open",
  "log_library_list",
  "log_library_register",
  "log_library_relink",
  "log_library_remove",
  "log_library_reindex",
  "log_library_cancel",
  "log_raw_messages_query",
  "log_chart_series_query",
  "log_export",
  "replay_open",
  "replay_play",
  "replay_pause",
  "replay_seek",
  "replay_set_speed",
  "replay_stop",
  "recording_start",
  "recording_stop",
  "recording_status",
  "recording_settings_read",
  "recording_settings_write",
  "firmware_flash_serial",
  "firmware_flash_dfu_recovery",
] as const;

export type OperationId = (typeof OPERATION_IDS)[number];

export type ReasonKind =
  | "unsupported"
  | "unavailable"
  | "conflict"
  | "invalid_input"
  | "cancelled"
  | "failed"
  | "timeout"
  | "permission_denied";

export type OperationFailure = {
  operation_id: OperationId;
  reason: {
    kind: ReasonKind;
    message: string;
  };
};

export type SessionConnection =
  | { kind: "connecting" }
  | { kind: "connected" }
  | { kind: "disconnected" }
  | { kind: "error"; error: string };

export type SessionState = {
  status: "pending" | "active";
  connection: SessionConnection;
  vehicle_state: VehicleState | null;
  home_position: HomePosition | null;
};

export type SessionDomain = DomainValue<SessionState>;

export type PlaybackSnapshot = {
  cursor_usec: number | null;
};

export type OpenSessionSnapshot = {
  envelope: SessionEnvelope;
  session: SessionDomain;
  telemetry: DomainValue<TelemetryState>;
  mission_state: MissionState | null;
  param_store: ParamStore | null;
  param_progress: ParamProgress | null;
  support: SupportDomain;
  sensor_health: SensorHealthDomain;
  configuration_facts: DomainValue<ConfigurationFactsState>;
  calibration: CalibrationDomain;
  guided: GuidedDomain;
  status_text: StatusTextDomain;
  playback: PlaybackSnapshot;
};

export type AckSessionSnapshotResult =
  | { result: "accepted"; envelope?: SessionEnvelope }
  | {
      result: "rejected";
      failure: OperationFailure & { operation_id: "ack_session_snapshot" };
    };

export type SessionEvent<T> = {
  envelope: SessionEnvelope;
  value: T;
};

export async function openSessionSnapshot(sourceKind: SourceKind): Promise<OpenSessionSnapshot> {
  return invoke<OpenSessionSnapshot>("open_session_snapshot", { sourceKind });
}

export async function ackSessionSnapshot(envelope: SessionEnvelope): Promise<AckSessionSnapshotResult> {
  return invoke<AckSessionSnapshotResult>("ack_session_snapshot", {
    sessionId: envelope.session_id,
    seekEpoch: envelope.seek_epoch,
    resetRevision: envelope.reset_revision,
  });
}

export async function connectSession(request: ConnectRequest): Promise<void> {
  await invoke("connect_link", { request: withPersistedRecordingSettings(request) });
}

export async function disconnectSession(request?: DisconnectRequest): Promise<void> {
  await invoke("disconnect_link", { request });
}

export async function subscribeSessionState(
  cb: (event: SessionEvent<SessionDomain>) => void,
): Promise<UnlistenFn> {
  return listen<SessionEvent<SessionDomain>>("session://state", (event) => cb(event.payload));
}

export async function subscribeTelemetryState(
  cb: (event: SessionEvent<DomainValue<TelemetryState>>) => void,
): Promise<UnlistenFn> {
  return listen<SessionEvent<DomainValue<TelemetryState>>>(
    "telemetry://state",
    (event) => cb(event.payload),
  );
}

export async function subscribeSupportState(
  cb: (event: SessionEvent<SupportDomain>) => void,
): Promise<UnlistenFn> {
  return listen<SessionEvent<SupportDomain>>("support://state", (event) => cb(event.payload));
}

export async function subscribeStatusTextState(
  cb: (event: SessionEvent<StatusTextDomain>) => void,
): Promise<UnlistenFn> {
  return listen<SessionEvent<StatusTextDomain>>("status_text://state", (event) => cb(event.payload));
}

/**
 * Strict scope guard for store mutations. Returns true when the incoming event
 * is outside the current active scope — any session_id or seek_epoch mismatch,
 * or an older reset_revision. Stores that track an `activeEnvelope` use this to
 * reject events that don't belong to the exact current context.
 *
 * Compare with {@link isNewerScopedEnvelope} in `scoped-session-events.ts`,
 * which accepts forward-moving envelope changes for subscription delivery.
 */
export function shouldDropEvent(active: SessionEnvelope | null, incoming: SessionEnvelope): boolean {
  if (!active) return false;
  if (incoming.session_id !== active.session_id) return true;
  if (incoming.seek_epoch !== active.seek_epoch) return true;
  return incoming.reset_revision < active.reset_revision;
}
