// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GuidedCommandResult, GuidedDomain, GuidedState } from "../guided";

const startGuidedSession = vi.fn();
const updateGuidedSession = vi.fn();
const stopGuidedSession = vi.fn();
const guidedTakeoff = vi.fn();

vi.mock("../guided", () => ({
  guidedTakeoff,
  startGuidedSession,
  updateGuidedSession,
  stopGuidedSession,
}));

function guidedState(overrides: Partial<GuidedState>): GuidedState {
  return {
    status: "idle",
    session: null,
    entered_at_unix_msec: null,
    blocking_reason: null,
    termination: null,
    last_command: null,
    actions: {
      start: { allowed: true, blocking_reason: null },
      update: { allowed: false, blocking_reason: "live_session_required" },
      stop: { allowed: false, blocking_reason: "live_session_required" },
    },
    ...overrides,
  };
}

function guidedDomain(value: GuidedState | null, provenance: GuidedDomain["provenance"] = "stream"): GuidedDomain {
  return {
    available: value !== null,
    complete: value !== null,
    provenance,
    value,
  };
}

type GuidedFailure = Extract<GuidedCommandResult, { result: "rejected" }>['failure'];

function rejectedResult(failure: GuidedFailure): GuidedCommandResult {
  return { result: "rejected", failure };
}

function acceptedResult(state: GuidedDomain): GuidedCommandResult {
  return { result: "accepted", state };
}

describe("useGuided", () => {
  beforeEach(() => {
    startGuidedSession.mockReset();
    updateGuidedSession.mockReset();
    stopGuidedSession.mockReset();
    guidedTakeoff.mockReset();
  });

  it("rejects guided ops in playback", async () => {
    const { useGuided } = await import("./use-guided");
    const { result } = renderHook(() => useGuided({
      connected: true,
      sourceKind: "playback",
      telemetryAltitudeM: 25,
      guidedDomain: { available: false, complete: false, provenance: "playback", value: null },
    }));

    await expect(result.current.guidedGoto(47.1, 8.5)).resolves.toMatchObject({
      result: "rejected",
      failure: {
        reason: { kind: "unavailable" },
      },
    });
    expect(startGuidedSession).not.toHaveBeenCalled();
    expect(updateGuidedSession).not.toHaveBeenCalled();
    expect(result.current.state.available).toBe(false);
  });

  it("does not locally rewrite the playback guided domain", async () => {
    const { useGuided } = await import("./use-guided");
    const playbackDomain = guidedDomain(guidedState({
      status: "active",
      session: { kind: "goto", latitude_deg: 47.1, longitude_deg: 8.5, altitude_m: 25 },
      entered_at_unix_msec: 1,
      actions: {
        start: { allowed: false, blocking_reason: "operation_in_progress" },
        update: { allowed: true, blocking_reason: null },
        stop: { allowed: false, blocking_reason: "stop_unsupported" },
      },
    }), "playback");
    const { result } = renderHook(() => useGuided({
      connected: true,
      sourceKind: "playback",
      telemetryAltitudeM: 25,
      guidedDomain: playbackDomain,
    }));

    expect(result.current.state).toEqual(playbackDomain);
  });

  it("resets rendered state when the session scope changes", async () => {
    const { useGuided } = await import("./use-guided");
    const { result, rerender } = renderHook((props) => useGuided(props), {
      initialProps: {
        connected: true,
        sourceKind: "live" as const,
        telemetryAltitudeM: 25,
        guidedDomain: guidedDomain(guidedState({
          status: "active",
          session: { kind: "goto", latitude_deg: 47.1, longitude_deg: 8.5, altitude_m: 25 },
          entered_at_unix_msec: 1,
          actions: {
            start: { allowed: false, blocking_reason: "operation_in_progress" },
            update: { allowed: true, blocking_reason: null },
            stop: { allowed: false, blocking_reason: "stop_unsupported" },
          },
        })),
      },
    });

    expect(result.current.activeSession?.kind).toBe("goto");

    rerender({
      connected: false,
      sourceKind: "live",
      telemetryAltitudeM: 25,
        guidedDomain: { available: false, complete: false, provenance: "bootstrap", value: null },
      });

    await waitFor(() => expect(result.current.activeSession).toBeNull());
    expect(result.current.state.available).toBe(false);
  });

  it("starts, updates, and stops a single guided goto session", async () => {
    startGuidedSession.mockResolvedValue(acceptedResult(guidedDomain(guidedState({
      status: "active",
      session: { kind: "goto", latitude_deg: 47.1, longitude_deg: 8.5, altitude_m: 30 },
      entered_at_unix_msec: 1,
      actions: {
        start: { allowed: false, blocking_reason: "operation_in_progress" },
        update: { allowed: true, blocking_reason: null },
        stop: { allowed: false, blocking_reason: "stop_unsupported" },
      },
    }))));
    updateGuidedSession.mockResolvedValue(acceptedResult(guidedDomain(guidedState({
      status: "active",
      session: { kind: "goto", latitude_deg: 47.2, longitude_deg: 8.6, altitude_m: 30 },
      entered_at_unix_msec: 1,
      actions: {
        start: { allowed: false, blocking_reason: "operation_in_progress" },
        update: { allowed: true, blocking_reason: null },
        stop: { allowed: false, blocking_reason: "stop_unsupported" },
      },
    }))));
    stopGuidedSession.mockResolvedValue(rejectedResult({
      operation_id: "stop_guided_session",
      reason: { kind: "unsupported", message: "explicit guided stop is not supported by the active vehicle backend" },
      retryable: false,
      fatality_scope: "operation",
      detail: { kind: "session_kind", session_kind: "goto" },
    }));

    const { useGuided } = await import("./use-guided");
    const { result, rerender } = renderHook((props) => useGuided(props), {
      initialProps: {
        connected: true,
        sourceKind: "live" as const,
        telemetryAltitudeM: 30,
        guidedDomain: guidedDomain(guidedState({}), "bootstrap"),
      },
    });

    await act(async () => {
      await result.current.guidedGoto(47.1, 8.5);
    });

    expect(startGuidedSession).toHaveBeenCalledWith({
      session: { kind: "goto", latitude_deg: 47.1, longitude_deg: 8.5, altitude_m: 30 },
    });
    expect(updateGuidedSession).not.toHaveBeenCalled();

    rerender({
      connected: true,
      sourceKind: "live",
      telemetryAltitudeM: 30,
      guidedDomain: guidedDomain(guidedState({
        status: "active",
        session: { kind: "goto", latitude_deg: 47.1, longitude_deg: 8.5, altitude_m: 30 },
        entered_at_unix_msec: 1,
        actions: {
          start: { allowed: false, blocking_reason: "operation_in_progress" },
          update: { allowed: true, blocking_reason: null },
          stop: { allowed: false, blocking_reason: "stop_unsupported" },
        },
      })),
    });

    await act(async () => {
      await result.current.guidedGoto(47.2, 8.6);
    });

    expect(updateGuidedSession).toHaveBeenCalledWith({
      session: { kind: "goto", latitude_deg: 47.2, longitude_deg: 8.6, altitude_m: 30 },
    });

    await act(async () => {
      await result.current.stop();
    });

    expect(stopGuidedSession).not.toHaveBeenCalled();
  });

  it("returns an honest unsupported stop result while still following guided state from the domain", async () => {
    stopGuidedSession.mockResolvedValue(rejectedResult({
      operation_id: "stop_guided_session",
      reason: { kind: "unsupported", message: "explicit guided stop is not supported by the active vehicle backend" },
      retryable: false,
      fatality_scope: "operation",
      detail: { kind: "session_kind", session_kind: "goto" },
    }));

    const { useGuided } = await import("./use-guided");
    const { result } = renderHook(() => useGuided({
      connected: true,
      sourceKind: "live",
      telemetryAltitudeM: 25,
      guidedDomain: guidedDomain(guidedState({
        status: "active",
        session: { kind: "goto", latitude_deg: 47.1, longitude_deg: 8.5, altitude_m: 25 },
        entered_at_unix_msec: 1,
        actions: {
          start: { allowed: false, blocking_reason: "operation_in_progress" },
          update: { allowed: true, blocking_reason: null },
          stop: { allowed: false, blocking_reason: "stop_unsupported" },
        },
      })),
    }));

    await expect(result.current.stop()).resolves.toMatchObject({
      result: "rejected",
      failure: {
        operation_id: "stop_guided_session",
        reason: { kind: "unsupported", message: "explicit guided stop is not supported by the active vehicle backend" },
        detail: { kind: "session_kind", session_kind: "goto" },
      },
    });
    expect(result.current.activeSession).toEqual({ kind: "goto", latitude_deg: 47.1, longitude_deg: 8.5, altitude_m: 25 });
  });

  it("uses the canonical guided-mode conflict message for local start rejection", async () => {
    const { useGuided } = await import("./use-guided");
    const { result } = renderHook(() => useGuided({
      connected: true,
      sourceKind: "live",
      telemetryAltitudeM: 25,
      guidedDomain: guidedDomain(guidedState({
        status: "blocked",
        blocking_reason: "vehicle_mode_incompatible",
        actions: {
          start: { allowed: false, blocking_reason: "vehicle_mode_incompatible" },
          update: { allowed: false, blocking_reason: "live_session_required" },
          stop: { allowed: false, blocking_reason: "live_session_required" },
        },
      })),
    }));

    expect(result.current.available).toBe(true);
    await expect(result.current.guidedGoto(47.1, 8.5)).resolves.toMatchObject({
      result: "rejected",
      failure: {
        operation_id: "start_guided_session",
        reason: { kind: "conflict", message: "guided control requires GUIDED mode" },
        detail: { kind: "blocking_reason", blocking_reason: "vehicle_mode_incompatible" },
      },
    });
    expect(result.current.takeoffReady).toBe(false);
    expect(result.current.takeoffPrompt).toBe("Switch to GUIDED to enable takeoff");
  });

  it("returns unavailable session-scoped start rejection for unavailable live-session gating", async () => {
    const { useGuided } = await import("./use-guided");
    const { result } = renderHook(() => useGuided({
      connected: true,
      sourceKind: "live",
      telemetryAltitudeM: 25,
      guidedDomain: guidedDomain(guidedState({
        status: "unavailable",
        blocking_reason: "live_session_required",
        actions: {
          start: { allowed: false, blocking_reason: "live_session_required" },
          update: { allowed: false, blocking_reason: "live_session_required" },
          stop: { allowed: false, blocking_reason: "live_session_required" },
        },
      })),
    }));

    expect(result.current.available).toBe(true);
    await expect(result.current.guidedGoto(47.1, 8.5)).resolves.toMatchObject({
      result: "rejected",
      failure: {
        operation_id: "start_guided_session",
        reason: { kind: "unavailable", message: "guided control requires a live vehicle session" },
        fatality_scope: "session",
        detail: { kind: "blocking_reason", blocking_reason: "live_session_required" },
      },
    });
  });

  it("keeps takeoff ready when the guided start action allows it", async () => {
    const { useGuided } = await import("./use-guided");
    const { result } = renderHook(() => useGuided({
      connected: true,
      sourceKind: "live",
      telemetryAltitudeM: 25,
      guidedDomain: guidedDomain(guidedState({
        actions: {
          start: { allowed: true, blocking_reason: null },
          update: { allowed: false, blocking_reason: "live_session_required" },
          stop: { allowed: false, blocking_reason: "live_session_required" },
        },
      })),
    }));

    expect(result.current.available).toBe(true);
    expect(result.current.takeoffReady).toBe(true);
    expect(result.current.takeoffPrompt).toBeNull();
  });

  it("routes takeoff through the guided surface when the start action allows it", async () => {
    guidedTakeoff.mockResolvedValue(undefined);

    const { useGuided } = await import("./use-guided");
    const { result } = renderHook(() => useGuided({
      connected: true,
      sourceKind: "live",
      telemetryAltitudeM: 25,
      guidedDomain: guidedDomain(guidedState({
        actions: {
          start: { allowed: true, blocking_reason: null },
          update: { allowed: false, blocking_reason: "live_session_required" },
          stop: { allowed: false, blocking_reason: "live_session_required" },
        },
      })),
    }));

    await expect(result.current.takeoff(18)).resolves.toEqual({ result: "accepted" });
    expect(guidedTakeoff).toHaveBeenCalledWith(18);
    expect(startGuidedSession).not.toHaveBeenCalled();
  });

  it("returns the guided-mode conflict result for takeoff when guided start is blocked", async () => {
    const { useGuided } = await import("./use-guided");
    const { result } = renderHook(() => useGuided({
      connected: true,
      sourceKind: "live",
      telemetryAltitudeM: 25,
      guidedDomain: guidedDomain(guidedState({
        status: "blocked",
        blocking_reason: "vehicle_mode_incompatible",
        actions: {
          start: { allowed: false, blocking_reason: "vehicle_mode_incompatible" },
          update: { allowed: false, blocking_reason: "live_session_required" },
          stop: { allowed: false, blocking_reason: "live_session_required" },
        },
      })),
    }));

    await expect(result.current.takeoff(18)).resolves.toMatchObject({
      result: "rejected",
      failure: {
        operation_id: "vehicle_takeoff",
        reason: { kind: "conflict", message: "guided control requires GUIDED mode" },
        detail: { kind: "blocking_reason", blocking_reason: "vehicle_mode_incompatible" },
      },
    });
    expect(guidedTakeoff).not.toHaveBeenCalled();
  });

  it("rejects invalid takeoff altitude locally without calling the backend path", async () => {
    const { useGuided } = await import("./use-guided");
    const { result } = renderHook(() => useGuided({
      connected: true,
      sourceKind: "live",
      telemetryAltitudeM: 25,
      guidedDomain: guidedDomain(guidedState({
        actions: {
          start: { allowed: true, blocking_reason: null },
          update: { allowed: false, blocking_reason: "live_session_required" },
          stop: { allowed: false, blocking_reason: "live_session_required" },
        },
      })),
    }));

    await expect(result.current.takeoff(0)).resolves.toMatchObject({
      result: "rejected",
      failure: {
        operation_id: "vehicle_takeoff",
        reason: { kind: "invalid_input", message: "takeoff altitude must be greater than 0 m" },
      },
    });
    expect(guidedTakeoff).not.toHaveBeenCalled();
  });

  it("rejects takeoff in playback without calling the backend path", async () => {
    const { useGuided } = await import("./use-guided");
    const { result } = renderHook(() => useGuided({
      connected: true,
      sourceKind: "playback",
      telemetryAltitudeM: 25,
      guidedDomain: { available: false, complete: false, provenance: "playback", value: null },
    }));

    await expect(result.current.takeoff(12)).resolves.toMatchObject({
      result: "rejected",
      failure: {
        operation_id: "vehicle_takeoff",
        reason: { kind: "unavailable", message: "guided control is unavailable in playback" },
        detail: { kind: "source_kind", source_kind: "playback" },
      },
    });
    expect(guidedTakeoff).not.toHaveBeenCalled();
  });

  it("keeps guided affordance available in blocked live states", async () => {
    const { useGuided } = await import("./use-guided");
    const { result } = renderHook(() => useGuided({
      connected: true,
      sourceKind: "live",
      telemetryAltitudeM: 25,
      guidedDomain: guidedDomain(guidedState({
        status: "blocked",
        blocking_reason: "vehicle_disarmed",
        actions: {
          start: { allowed: false, blocking_reason: "vehicle_disarmed" },
          update: { allowed: false, blocking_reason: "vehicle_disarmed" },
          stop: { allowed: false, blocking_reason: "live_session_required" },
        },
      })),
    }));

    expect(result.current.available).toBe(true);
    await expect(result.current.guidedGoto(47.1, 8.5)).resolves.toMatchObject({
      result: "rejected",
      failure: {
        operation_id: "start_guided_session",
        detail: { kind: "blocking_reason", blocking_reason: "vehicle_disarmed" },
      },
    });
  });

  it("matches backend idle stop conflict shape for local live fallback", async () => {
    const { useGuided } = await import("./use-guided");
    const { result } = renderHook(() => useGuided({
      connected: true,
      sourceKind: "live",
      telemetryAltitudeM: 25,
      guidedDomain: guidedDomain(guidedState({})),
    }));

    await expect(result.current.stop()).resolves.toMatchObject({
      result: "rejected",
      failure: {
        operation_id: "stop_guided_session",
        reason: { kind: "conflict", message: "no active guided session to stop" },
        detail: null,
      },
    });
  });

  it("prefers top-level disarmed stop conflict over no-active fallback", async () => {
    const { useGuided } = await import("./use-guided");
    const { result } = renderHook(() => useGuided({
      connected: true,
      sourceKind: "live",
      telemetryAltitudeM: 25,
      guidedDomain: guidedDomain(guidedState({
        status: "blocked",
        blocking_reason: "vehicle_disarmed",
        actions: {
          start: { allowed: false, blocking_reason: "vehicle_disarmed" },
          update: { allowed: false, blocking_reason: "vehicle_disarmed" },
          stop: { allowed: false, blocking_reason: "live_session_required" },
        },
      })),
    }));

    await expect(result.current.stop()).resolves.toMatchObject({
      result: "rejected",
      failure: {
        operation_id: "stop_guided_session",
        reason: { kind: "conflict", message: "guided control requires an armed vehicle" },
        detail: { kind: "blocking_reason", blocking_reason: "vehicle_disarmed" },
      },
    });
  });

  it("prefers wrong-mode idle stop context over no-active fallback", async () => {
    const { useGuided } = await import("./use-guided");
    const { result } = renderHook(() => useGuided({
      connected: true,
      sourceKind: "live",
      telemetryAltitudeM: 25,
      guidedDomain: guidedDomain(guidedState({
        status: "idle",
        blocking_reason: null,
        actions: {
          start: { allowed: false, blocking_reason: "vehicle_mode_incompatible" },
          update: { allowed: false, blocking_reason: "live_session_required" },
          stop: { allowed: false, blocking_reason: "live_session_required" },
        },
      })),
    }));

    await expect(result.current.stop()).resolves.toMatchObject({
      result: "rejected",
      failure: {
        operation_id: "stop_guided_session",
        reason: { kind: "conflict", message: "guided control requires GUIDED mode" },
        detail: { kind: "blocking_reason", blocking_reason: "vehicle_mode_incompatible" },
      },
    });
  });

  it("rejects explicit stop in playback with the live-only typed reason", async () => {
    const { useGuided } = await import("./use-guided");
    const { result } = renderHook(() => useGuided({
      connected: true,
      sourceKind: "playback",
      telemetryAltitudeM: 25,
      guidedDomain: { available: false, complete: false, provenance: "playback", value: null },
    }));

    await expect(result.current.stop()).resolves.toMatchObject({
      result: "rejected",
      failure: {
        operation_id: "stop_guided_session",
        reason: { kind: "unavailable" },
      },
    });
  });
});
