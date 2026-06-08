import { EVENT_NAMES } from "./lib/generated/events";
import type {
  GuidedBlockingReason,
  GuidedFatalityScope,
  GuidedStatus,
  GuidedTerminationReason,
} from "./lib/generated/ironwing";
import type { DomainValue } from "./lib/domain-status";
import { typedInvoke, typedListen, type UnlistenFn } from "./lib/ipc/client";
import type { SessionEvent } from "./session";

export type GuidedSession = {
  kind: "goto";
  latitude_deg: number;
  longitude_deg: number;
  /** Target altitude above mean sea level. */
  altitude_msl_m: number;
};

export type { GuidedBlockingReason, GuidedFatalityScope, GuidedStatus };

export type GuidedTermination = {
  reason: GuidedTerminationReason;
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
  return typedInvoke("start_guided_session", { request });
}

export async function updateGuidedSession(request: UpdateGuidedSessionRequest): Promise<GuidedCommandResult> {
  return typedInvoke("update_guided_session", { request });
}

export async function stopGuidedSession(): Promise<GuidedCommandResult> {
  return typedInvoke("stop_guided_session");
}

export async function guidedTakeoff(altitudeM: number): Promise<void> {
  await typedInvoke("vehicle_takeoff", { altitudeM });
}

export async function subscribeGuidedState(
  cb: (event: SessionEvent<GuidedDomain>) => void,
): Promise<UnlistenFn> {
  return typedListen(EVENT_NAMES.GUIDED_STATE, (event) => cb(event.payload));
}
