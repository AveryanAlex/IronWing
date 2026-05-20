import { currentGuidedSourceKind, mockState, requireLiveEnvelope } from "./runtime";
import type { CommandArgs, MockGuidedBlockingReason, MockGuidedStateValue, MockPlatformEvent } from "./types";

export function applyMockGuidedState(guidedState: MockGuidedStateValue) {
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

export function guidedBlockingMessage(reason: MockGuidedBlockingReason): string {
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

export function liveGuidedDomain(provenance: "bootstrap" | "stream" = "bootstrap") {
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

export function rejectGuidedContext(operationId: "start_guided_session" | "update_guided_session" | "stop_guided_session") {
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

export function takeoffContextError(): string | null {
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

function guidedModeCompatibilityReason() {
  return mockState.liveVehicleModeName.toUpperCase() === "GUIDED" ? null : "vehicle_mode_incompatible";
}

export function reconcileGuidedAfterLiveVehicleUpdate(): MockGuidedStateValue | null {
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

export function emitGuidedStateIfLiveActive(emitEvent: (event: string, payload: unknown) => void) {
  if (!mockState.liveEnvelope) {
    return;
  }

  emitEvent("guided://state", { envelope: mockState.liveEnvelope, value: liveGuidedDomain("stream") });
}

export function liveGuidedStreamEvent(guidedState: MockGuidedStateValue): MockPlatformEvent {
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

function guidedSessionArg(args: CommandArgs): { kind: "goto"; latitude_deg: number; longitude_deg: number; altitude_m: number } | null {
  return args?.request && typeof args.request === "object"
    ? (args.request as { session: { kind: "goto"; latitude_deg: number; longitude_deg: number; altitude_m: number } }).session
    : null;
}

export function startGuidedSession(args: CommandArgs, emitEvent: (event: string, payload: unknown) => void) {
  const session = guidedSessionArg(args);
  if (!session) {
    return {
      result: "rejected",
      failure: {
        operation_id: "start_guided_session",
        reason: { kind: "invalid_input", message: "missing guided session" },
        retryable: false,
        fatality_scope: "operation",
        detail: null,
      },
    };
  }

  const contextRejection = rejectGuidedContext("start_guided_session");
  if (contextRejection) {
    return contextRejection;
  }
  if (mockState.guided) {
    return {
      result: "rejected",
      failure: {
        operation_id: "start_guided_session",
        reason: { kind: "conflict", message: "guided session already active; use update_guided_session" },
        retryable: true,
        fatality_scope: "operation",
        detail: null,
      },
    };
  }

  const now = Date.now();
  mockState.guidedTermination = null;
  mockState.guidedLastCommand = { operation_id: "start_guided_session", session_kind: "goto", at_unix_msec: now };
  mockState.guided = { session, entered_at_unix_msec: now };
  emitGuidedStateIfLiveActive(emitEvent);
  return { result: "accepted", state: liveGuidedDomain("stream") };
}

export function updateGuidedSession(args: CommandArgs, emitEvent: (event: string, payload: unknown) => void) {
  const session = guidedSessionArg(args);
  const contextRejection = rejectGuidedContext("update_guided_session");
  if (contextRejection) {
    return contextRejection;
  }
  if (!mockState.guided) {
    return {
      result: "rejected",
      failure: {
        operation_id: "update_guided_session",
        reason: { kind: "conflict", message: "no active guided session to update" },
        retryable: true,
        fatality_scope: "operation",
        detail: null,
      },
    };
  }
  if (!session) {
    return {
      result: "rejected",
      failure: {
        operation_id: "update_guided_session",
        reason: { kind: "invalid_input", message: "missing guided session" },
        retryable: false,
        fatality_scope: "operation",
        detail: null,
      },
    };
  }

  mockState.guidedTermination = null;
  mockState.guidedLastCommand = { operation_id: "update_guided_session", session_kind: "goto", at_unix_msec: Date.now() };
  mockState.guided = { ...mockState.guided, session };
  emitGuidedStateIfLiveActive(emitEvent);
  return { result: "accepted", state: liveGuidedDomain("stream") };
}

export function stopGuidedSession() {
  const contextRejection = rejectGuidedContext("stop_guided_session");
  if (contextRejection) {
    return contextRejection;
  }

  return !mockState.guided
    ? {
      result: "rejected",
      failure: {
        operation_id: "stop_guided_session",
        reason: { kind: "conflict", message: "no active guided session to stop" },
        retryable: true,
        fatality_scope: "operation",
        detail: null,
      },
    }
    : {
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

export function vehicleTakeoff(args: CommandArgs) {
  const contextError = takeoffContextError();
  if (contextError) {
    throw new Error(contextError);
  }

  const altitudeM = args?.altitudeM;
  if (typeof altitudeM !== "number" || !Number.isFinite(altitudeM) || altitudeM <= 0) {
    throw new Error("takeoff altitude must be greater than 0 m");
  }
}
