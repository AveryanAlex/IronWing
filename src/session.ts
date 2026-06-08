import type { CalibrationDomain } from "./calibration";
import type { GuidedDomain } from "./guided";
import type { DomainValue } from "./lib/domain-status";
import type { HomePosition, MissionState } from "./mission";
import { EVENT_NAMES } from "./lib/generated/events";
import { OPERATION_IDS } from "./lib/generated/ironwing";
import type { OperationFailure, OperationId, ReasonKind, SourceKind } from "./lib/generated/ironwing";
import { typedInvoke, typedListen, type UnlistenFn } from "./lib/ipc/client";
import type { ParamProgress, ParamStore } from "./params";
import { withPersistedRecordingSettings } from "./recording";
import type { SensorHealthDomain } from "./sensor-health";
import type { StatusTextDomain } from "./statustext";
import type { SupportDomain } from "./support";
import type { ConnectRequest, DisconnectRequest } from "./transport";
import type { VehicleState, TelemetryState } from "./telemetry";

export { OPERATION_IDS };
export type { OperationFailure, OperationId, ReasonKind, SourceKind };

export type SessionEnvelope = {
  session_id: string;
  source_kind: SourceKind;
  seek_epoch: number;
  reset_revision: number;
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
  return typedInvoke("open_session_snapshot", { sourceKind });
}

export async function ackSessionSnapshot(envelope: SessionEnvelope): Promise<AckSessionSnapshotResult> {
  return typedInvoke("ack_session_snapshot", {
    sessionId: envelope.session_id,
    seekEpoch: envelope.seek_epoch,
    resetRevision: envelope.reset_revision,
  });
}

export async function connectSession(request: ConnectRequest): Promise<void> {
  await typedInvoke("connect_link", { request: withPersistedRecordingSettings(request) });
}

export async function disconnectSession(request?: DisconnectRequest): Promise<void> {
  await typedInvoke("disconnect_link", { request });
}

export async function subscribeSessionState(
  cb: (event: SessionEvent<SessionDomain>) => void,
): Promise<UnlistenFn> {
  return typedListen(EVENT_NAMES.SESSION_STATE, (event) => cb(event.payload));
}

export async function subscribeTelemetryState(
  cb: (event: SessionEvent<DomainValue<TelemetryState>>) => void,
): Promise<UnlistenFn> {
  return typedListen(
    EVENT_NAMES.TELEMETRY_STATE,
    (event) => cb(event.payload),
  );
}

export async function subscribeSupportState(
  cb: (event: SessionEvent<SupportDomain>) => void,
): Promise<UnlistenFn> {
  return typedListen(EVENT_NAMES.SUPPORT_STATE, (event) => cb(event.payload));
}

export async function subscribeStatusTextState(
  cb: (event: SessionEvent<StatusTextDomain>) => void,
): Promise<UnlistenFn> {
  return typedListen(EVENT_NAMES.STATUS_TEXT_STATE, (event) => cb(event.payload));
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
