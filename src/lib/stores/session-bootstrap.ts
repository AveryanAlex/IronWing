import { isSameEnvelope } from "../scoped-session-events";
import type { OpenSessionSnapshot, SessionEnvelope } from "../../session";
import type { SessionStoreState } from "./session-state";

type BootstrapBuffer = {
  attempt: number;
  envelope: SessionEnvelope;
  session?: OpenSessionSnapshot["session"];
  telemetry?: OpenSessionSnapshot["telemetry"];
  support?: OpenSessionSnapshot["support"];
  sensorHealth?: OpenSessionSnapshot["sensor_health"];
  configurationFacts?: OpenSessionSnapshot["configuration_facts"];
  calibration?: OpenSessionSnapshot["calibration"];
  guided?: OpenSessionSnapshot["guided"];
  statusText?: OpenSessionSnapshot["status_text"];
};

export function createSessionBootstrapController() {
  let bootstrapAttempt = 0;
  let bootstrapBuffer: BootstrapBuffer | null = null;

  return {
    currentAttempt() {
      return bootstrapAttempt;
    },
    beginAttempt() {
      const attempt = bootstrapAttempt + 1;
      bootstrapAttempt = attempt;
      bootstrapBuffer = null;
      return attempt;
    },
    prepareBuffer(attempt: number, envelope: SessionEnvelope) {
      bootstrapBuffer = { attempt, envelope };
    },
    stageEvent<T>(
      attempt: number,
      event: { envelope: SessionEnvelope; value: T },
      assign: (buffer: BootstrapBuffer, value: T) => void,
    ) {
      if (!bootstrapBuffer || bootstrapBuffer.attempt !== attempt) {
        return false;
      }

      if (!isSameEnvelope(bootstrapBuffer.envelope, event.envelope)) {
        return false;
      }

      assign(bootstrapBuffer, event.value);
      return true;
    },
    isCurrentAttempt(attempt: number) {
      return bootstrapAttempt === attempt;
    },
    takeBuffer(attempt: number) {
      return bootstrapBuffer?.attempt === attempt ? bootstrapBuffer : null;
    },
    clearAttempt(attempt: number) {
      if (bootstrapBuffer?.attempt === attempt) {
        bootstrapBuffer = null;
      }
    },
    reset() {
      bootstrapAttempt = 0;
      bootstrapBuffer = null;
    },
  };
}

type MergeSnapshotArgs = {
  state: SessionStoreState;
  snapshot: OpenSessionSnapshot;
  acceptedEnvelope: SessionEnvelope;
  buffered: BootstrapBuffer | null;
  snapshotIsStale: boolean;
};

export function mergeBootstrapSnapshot({
  state,
  snapshot,
  acceptedEnvelope,
  buffered,
  snapshotIsStale,
}: MergeSnapshotArgs): SessionStoreState {
  if (snapshotIsStale) {
    return {
      ...state,
      lastPhase: "ready",
      lastError: null,
    };
  }

  let nextState: SessionStoreState = {
    ...state,
    activeEnvelope: acceptedEnvelope,
    activeSource: acceptedEnvelope.source_kind,
    lastPhase: "ready",
    lastError: null,
  };

  nextState = {
    ...nextState,
    sessionDomain: snapshot.session,
    telemetryDomain: snapshot.telemetry,
    support: snapshot.support,
    sensorHealth: snapshot.sensor_health,
    configurationFacts: snapshot.configuration_facts,
    calibration: snapshot.calibration,
    guided: snapshot.guided,
    statusText: snapshot.status_text,
    bootstrap: {
      missionState: snapshot.mission_state ?? null,
      paramStore: snapshot.param_store ?? null,
      paramProgress: snapshot.param_progress ?? null,
      playbackCursorUsec: snapshot.playback.cursor_usec,
    },
  };

  if (buffered && isSameEnvelope(buffered.envelope, acceptedEnvelope)) {
    if (buffered.session) {
      nextState = {
        ...nextState,
        sessionDomain: buffered.session,
        optimisticConnection: null,
      };
    }
    if (buffered.telemetry) {
      nextState = {
        ...nextState,
        telemetryDomain: buffered.telemetry,
      };
    }
    if (buffered.support) {
      nextState = {
        ...nextState,
        support: buffered.support,
      };
    }
    if (buffered.sensorHealth) {
      nextState = {
        ...nextState,
        sensorHealth: buffered.sensorHealth,
      };
    }
    if (buffered.configurationFacts) {
      nextState = {
        ...nextState,
        configurationFacts: buffered.configurationFacts,
      };
    }
    if (buffered.calibration) {
      nextState = {
        ...nextState,
        calibration: buffered.calibration,
      };
    }
    if (buffered.guided) {
      nextState = {
        ...nextState,
        guided: buffered.guided,
      };
    }
    if (buffered.statusText) {
      nextState = {
        ...nextState,
        statusText: buffered.statusText,
      };
    }
  }

  return nextState;
}
