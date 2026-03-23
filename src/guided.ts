import { invoke } from "@platform/core";
import { listen, type UnlistenFn } from "@platform/event";
import type { DomainValue } from "./lib/domain-status";
import type { SessionEvent } from "./session";

export type GuidedSession = {
  kind: "goto";
  latitude_deg: number;
  longitude_deg: number;
  altitude_m: number;
};

export type GuidedStatus = "idle" | "active" | "blocked" | "unavailable";
export type GuidedBlockingReason =
  | "live_session_required"
  | "playback"
  | "vehicle_disarmed"
  | "vehicle_mode_incompatible"
  | "operation_in_progress"
  | "stop_unsupported";

export type GuidedTermination = {
  reason: "disconnect" | "mode_change" | "source_switch" | "vehicle_missing";
  at_unix_msec: number;
  message: string;
};

export type GuidedLastCommand = {
  operation_id: GuidedOperationId;
  session_kind: GuidedSession["kind"] | null;
  at_unix_msec: number;
};

export type GuidedAction = {
  allowed: boolean;
  blocking_reason: GuidedBlockingReason | null;
};

export type GuidedFatalityScope = "operation" | "session";

export type GuidedFailureDetail =
  | { kind: "blocking_reason"; blocking_reason: GuidedBlockingReason }
  | { kind: "source_kind"; source_kind: "live" | "playback" }
  | { kind: "session_kind"; session_kind: GuidedSession["kind"] };

export type GuidedState = {
  status: GuidedStatus;
  session: GuidedSession | null;
  entered_at_unix_msec: number | null;
  blocking_reason: GuidedBlockingReason | null;
  termination: GuidedTermination | null;
  last_command: GuidedLastCommand | null;
  actions: {
    start: GuidedAction;
    update: GuidedAction;
    stop: GuidedAction;
  };
};

export type GuidedDomain = DomainValue<GuidedState>;

export type GuidedOperationId = "start_guided_session" | "update_guided_session" | "stop_guided_session";
export type GuidedReasonKind =
  | "unsupported"
  | "unavailable"
  | "conflict"
  | "invalid_input"
  | "cancelled"
  | "failed"
  | "timeout"
  | "permission_denied";

export type GuidedCommandResult =
  | { result: "accepted"; state: GuidedDomain }
  | {
      result: "rejected";
      failure: {
        operation_id: GuidedOperationId;
        reason: { kind: GuidedReasonKind; message: string };
        retryable: boolean;
        fatality_scope: GuidedFatalityScope;
        detail: GuidedFailureDetail | null;
      };
    };

export type GuidedTakeoffCommandResult =
  | { result: "accepted" }
  | {
      result: "rejected";
      failure: {
        operation_id: "vehicle_takeoff";
        reason: { kind: GuidedReasonKind; message: string };
        retryable: boolean;
        fatality_scope: GuidedFatalityScope;
        detail: GuidedFailureDetail | null;
      };
    };

export type StartGuidedSessionRequest = {
  session: GuidedSession;
};

export type UpdateGuidedSessionRequest = {
  session: GuidedSession;
};

export async function startGuidedSession(request: StartGuidedSessionRequest): Promise<GuidedCommandResult> {
  return invoke<GuidedCommandResult>("start_guided_session", { request });
}

export async function updateGuidedSession(request: UpdateGuidedSessionRequest): Promise<GuidedCommandResult> {
  return invoke<GuidedCommandResult>("update_guided_session", { request });
}

export async function stopGuidedSession(): Promise<GuidedCommandResult> {
  return invoke<GuidedCommandResult>("stop_guided_session");
}

export async function guidedTakeoff(altitudeM: number): Promise<void> {
  await invoke("vehicle_takeoff", { altitudeM });
}

export async function subscribeGuidedState(
  cb: (event: SessionEvent<GuidedDomain>) => void,
): Promise<UnlistenFn> {
  return listen<SessionEvent<GuidedDomain>>("guided://state", (event) => cb(event.payload));
}
