import { useMemo } from "react";
import {
  guidedTakeoff,
  startGuidedSession,
  stopGuidedSession,
  updateGuidedSession,
  type GuidedCommandResult,
  type GuidedTakeoffCommandResult,
  type GuidedBlockingReason,
  type GuidedDomain,
  type GuidedFailureDetail,
  type GuidedFatalityScope,
  type GuidedReasonKind,
  type GuidedSession,
} from "../guided";
import type { SourceKind } from "../session";
import { asErrorMessage } from "./use-session-helpers";

export type UseGuidedParams = {
  connected: boolean;
  sourceKind: SourceKind;
  telemetryAltitudeM?: number;
  guidedDomain: GuidedDomain;
};

function rejected(
  operation_id: "start_guided_session" | "update_guided_session" | "stop_guided_session",
  kind: GuidedReasonKind,
  message: string,
  options?: { fatality_scope?: GuidedFatalityScope; detail?: GuidedFailureDetail | null; retryable?: boolean },
): GuidedCommandResult {
  return {
    result: "rejected",
    failure: {
      operation_id,
      reason: { kind, message },
      retryable: options?.retryable ?? kind !== "unsupported",
      fatality_scope: options?.fatality_scope ?? "operation",
      detail: options?.detail ?? null,
    },
  };
}

function messageForBlockingReason(reason: GuidedBlockingReason | null): string {
  switch (reason) {
    case "playback":
      return "guided control is unavailable in playback";
    case "vehicle_disarmed":
      return "guided control requires an armed vehicle";
    case "vehicle_mode_incompatible":
      return "guided control requires GUIDED mode";
    case "operation_in_progress":
      return "guided operation already in progress";
    case "stop_unsupported":
      return "explicit guided stop is not supported by the active vehicle backend";
    case "live_session_required":
    default:
      return "guided control requires a live vehicle session";
  }
}

function takeoffPromptForBlockingReason(reason: GuidedBlockingReason | null): string | null {
  switch (reason) {
    case "vehicle_disarmed":
      return "Arm vehicle to enable takeoff";
    case "vehicle_mode_incompatible":
      return "Switch to GUIDED to enable takeoff";
    default:
      return null;
  }
}

function rejectedTakeoff(
  kind: GuidedReasonKind,
  message: string,
  options?: { fatality_scope?: GuidedFatalityScope; detail?: GuidedFailureDetail | null; retryable?: boolean },
): GuidedTakeoffCommandResult {
  return {
    result: "rejected",
    failure: {
      operation_id: "vehicle_takeoff",
      reason: { kind, message },
      retryable: options?.retryable ?? kind !== "unsupported",
      fatality_scope: options?.fatality_scope ?? "operation",
      detail: options?.detail ?? null,
    },
  };
}

export function useGuided({ connected, sourceKind, telemetryAltitudeM, guidedDomain }: UseGuidedParams) {
  const state = useMemo<GuidedDomain>(() => guidedDomain, [guidedDomain]);

  const guidedState = state.value as import("../guided").GuidedState | null;
  const activeSession = guidedState?.session ?? null;
  const canStart = guidedState?.actions?.start?.allowed ?? false;
  const canUpdate = guidedState?.actions?.update?.allowed ?? false;
  const canStop = guidedState?.actions?.stop?.allowed ?? false;
  const hasLiveGuidedAffordance = !!state.value && sourceKind === "live";
  const takeoffPrompt = takeoffPromptForBlockingReason(guidedState?.actions?.start?.blocking_reason ?? null);

  const rejectStart = (): GuidedCommandResult | null => {
    if (sourceKind === "playback") {
      return rejected("start_guided_session", "unavailable", "guided control is unavailable in playback", {
        detail: { kind: "source_kind", source_kind: "playback" },
        retryable: false,
      });
    }
    if (!connected || !state.value) {
      return rejected("start_guided_session", "unavailable", messageForBlockingReason("live_session_required"), {
        fatality_scope: "session",
        detail: { kind: "blocking_reason", blocking_reason: "live_session_required" },
      });
    }
    if (!canStart) {
      const blockingReason = guidedState?.actions?.start?.blocking_reason ?? null;
      return rejected(
        "start_guided_session",
        guidedState?.status === "unavailable" && blockingReason === "live_session_required" ? "unavailable" : "conflict",
        messageForBlockingReason(blockingReason),
        {
          fatality_scope: guidedState?.status === "unavailable" && blockingReason === "live_session_required" ? "session" : "operation",
          detail: blockingReason ? { kind: "blocking_reason", blocking_reason: blockingReason } : null,
        },
      );
    }

    return null;
  };

  const rejectTakeoff = (): GuidedTakeoffCommandResult | null => {
    if (sourceKind === "playback") {
      return rejectedTakeoff("unavailable", "guided control is unavailable in playback", {
        detail: { kind: "source_kind", source_kind: "playback" },
        retryable: false,
      });
    }
    if (!connected || !state.value) {
      return rejectedTakeoff("unavailable", messageForBlockingReason("live_session_required"), {
        fatality_scope: "session",
        detail: { kind: "blocking_reason", blocking_reason: "live_session_required" },
      });
    }
    if (!canStart) {
      const blockingReason = guidedState?.actions?.start?.blocking_reason ?? null;
      return rejectedTakeoff(
        guidedState?.status === "unavailable" && blockingReason === "live_session_required" ? "unavailable" : "conflict",
        messageForBlockingReason(blockingReason),
        {
          fatality_scope: guidedState?.status === "unavailable" && blockingReason === "live_session_required" ? "session" : "operation",
          detail: blockingReason ? { kind: "blocking_reason", blocking_reason: blockingReason } : null,
        },
      );
    }

    return null;
  };

  const guidedGoto = async (latitudeDeg: number, longitudeDeg: number): Promise<GuidedCommandResult> => {
    if (sourceKind === "playback") {
      return rejected("start_guided_session", "unavailable", "guided control is unavailable in playback", {
        detail: { kind: "source_kind", source_kind: "playback" },
        retryable: false,
      });
    }
    if (!connected || !state.value) {
      return rejected("start_guided_session", "unavailable", messageForBlockingReason("live_session_required"), {
        fatality_scope: "session",
        detail: { kind: "blocking_reason", blocking_reason: "live_session_required" },
      });
    }

    const session: GuidedSession = {
      kind: "goto",
      latitude_deg: latitudeDeg,
      longitude_deg: longitudeDeg,
      altitude_m: telemetryAltitudeM ?? 25,
    };

    if (activeSession?.kind === "goto") {
      if (!canUpdate) {
        const blockingReason = guidedState?.actions?.update?.blocking_reason ?? null;
        return rejected("update_guided_session", "conflict", messageForBlockingReason(blockingReason), {
          detail: blockingReason ? { kind: "blocking_reason", blocking_reason: blockingReason } : null,
        });
      }
      return updateGuidedSession({ session });
    }

    const startRejection = rejectStart();
    if (startRejection) {
      return startRejection;
    }

    return startGuidedSession({ session });
  };

  const takeoff = async (altitudeM: number): Promise<GuidedTakeoffCommandResult> => {
    const takeoffRejection = rejectTakeoff();
    if (takeoffRejection) {
      return takeoffRejection;
    }
    if (!Number.isFinite(altitudeM) || altitudeM <= 0) {
      return rejectedTakeoff("invalid_input", "takeoff altitude must be greater than 0 m", {
        retryable: true,
      });
    }

    try {
      await guidedTakeoff(altitudeM);
      return { result: "accepted" };
    } catch (error) {
      return rejectedTakeoff("failed", asErrorMessage(error), {
        retryable: true,
      });
    }
  };

  const stop = async (): Promise<GuidedCommandResult> => {
    if (sourceKind === "playback") {
      return rejected("stop_guided_session", "unavailable", "guided control is unavailable in playback", {
        detail: { kind: "source_kind", source_kind: "playback" },
        retryable: false,
      });
    }
    if (!connected || !state.value) {
      return rejected("stop_guided_session", "unavailable", messageForBlockingReason("live_session_required"), {
        fatality_scope: "session",
        detail: { kind: "blocking_reason", blocking_reason: "live_session_required" },
      });
    }
    if (!canStop) {
      const reason = guidedState?.actions?.stop?.blocking_reason ?? null;
      const topLevelReason = guidedState?.blocking_reason ?? null;
      const startReason = guidedState?.actions?.start?.blocking_reason ?? null;
      if (topLevelReason) {
        return rejected(
          "stop_guided_session",
          guidedState?.status === "unavailable" ? "unavailable" : "conflict",
          messageForBlockingReason(topLevelReason),
          {
            fatality_scope: guidedState?.status === "unavailable" ? "session" : "operation",
            detail: { kind: "blocking_reason", blocking_reason: topLevelReason },
          },
        );
      }

      if (activeSession === null && startReason === "vehicle_mode_incompatible") {
        return rejected(
          "stop_guided_session",
          "conflict",
          messageForBlockingReason(startReason),
          {
            detail: { kind: "blocking_reason", blocking_reason: startReason },
          },
        );
      }

      if (activeSession === null) {
        return rejected(
          "stop_guided_session",
          "conflict",
          "no active guided session to stop",
          {
            detail: null,
          },
        );
      }

      return rejected(
        "stop_guided_session",
        reason === "stop_unsupported" ? "unsupported" : "conflict",
        messageForBlockingReason(reason),
        {
          detail: reason === "stop_unsupported"
            ? { kind: "session_kind", session_kind: "goto" }
            : reason
              ? { kind: "blocking_reason", blocking_reason: reason }
              : null,
          retryable: reason !== "stop_unsupported",
        },
      );
    }
    return stopGuidedSession();
  };

  return {
    state,
    activeSession,
    guidedGoto,
    takeoff,
    stop,
    available: hasLiveGuidedAffordance,
    takeoffReady: !!state.value && canStart,
    takeoffPrompt,
  };
}
