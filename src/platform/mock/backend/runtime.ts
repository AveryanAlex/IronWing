import type {
  DeferredInvocation,
  MockBackendState,
  MockCommandBehavior,
  MockInvocation,
  SessionEnvelope,
} from "./types";
import type { OperationFailure, OperationId } from "../../../session";

export const PENDING_SESSION_TTL_MS = 2_000;

export const commandBehaviors = new Map<string, MockCommandBehavior>();
export const deferredInvocations = new Map<string, DeferredInvocation[]>();
export const invocations: MockInvocation[] = [];

export const mockState: MockBackendState = {
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
  liveMissionHome: null,
  liveFencePlan: null,
  liveRallyPlan: null,
  liveTelemetryDomain: null,
  liveParamStore: null,
  liveParamProgress: null,
  liveAvailableModes: null,
  liveStatusText: null,
  liveSupportDomain: null,
  liveSensorHealthDomain: null,
  liveConfigurationFactsDomain: null,
  demoTelemetryIntervalId: null,
  demoStatusIntervalId: null,
  liveVehicleArmed: false,
  liveVehicleModeName: "Stabilize",
  guidedTermination: null,
  guidedLastCommand: null,
  guided: null,
};

export function resetMockState() {
  clearDemoIntervals();
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
  mockState.demoTelemetryIntervalId = null;
  mockState.demoStatusIntervalId = null;
  mockState.liveVehicleArmed = false;
  mockState.liveVehicleModeName = "Stabilize";
  mockState.guidedTermination = null;
  mockState.guidedLastCommand = null;
  mockState.guided = null;
}

export function clearDemoIntervals() {
  if (mockState.demoTelemetryIntervalId != null) {
    window.clearInterval(mockState.demoTelemetryIntervalId);
    mockState.demoTelemetryIntervalId = null;
  }

  if (mockState.demoStatusIntervalId != null) {
    window.clearInterval(mockState.demoStatusIntervalId);
    mockState.demoStatusIntervalId = null;
  }
}

export function currentGuidedSourceKind(): "live" | "playback" {
  return mockState.playbackEnvelope
    ? "playback"
    : "live";
}

export function resetGuided(reason: "disconnect" | "source_switch", message: string) {
  mockState.guided = null;
  mockState.guidedTermination = {
    reason,
    at_unix_msec: Date.now(),
    message,
  };
}

export function sweepExpiredPending(nowUnixMsec = Date.now()) {
  for (const key of ["pendingLiveEnvelope", "pendingPlaybackEnvelope"] as const) {
    const pending = mockState[key];
    if (pending && nowUnixMsec - pending.opened_at_unix_msec >= PENDING_SESSION_TTL_MS) {
      mockState[key] = null;
    }
  }
}

export function nextEnvelope(sourceKind: "live" | "playback"): SessionEnvelope {
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

export function requireLiveEnvelope() {
  if (!mockState.liveEnvelope) {
    throw new Error("live envelope is not active");
  }

  return mockState.liveEnvelope;
}

export function ensureMockLiveWriteAllowed(operationId: OperationId) {
  if (!mockState.playbackEnvelope) {
    return;
  }

  const failure: OperationFailure = {
    operation_id: operationId,
    reason: {
      kind: "permission_denied",
      message: "replay is read-only while playback is the effective source; switch back to the live source to send vehicle commands",
    },
  };

  throw new Error(JSON.stringify(failure));
}
