// @vitest-environment jsdom
import { renderHook, waitFor, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
const listeners = new Map<string, (event: { payload: unknown }) => void>();
const defaultListenImpl = async (event: string, handler: (event: { payload: unknown }) => void) => {
  listeners.set(event, handler);
  return () => listeners.delete(event);
};
const listen = vi.fn(defaultListenImpl);

vi.mock("@platform/core", () => ({
  invoke,
}));

vi.mock("@platform/event", () => ({
  listen,
}));

describe("useSession", () => {
  beforeEach(() => {
    listeners.clear();
    invoke.mockReset();
    listen.mockReset();
    listen.mockImplementation(defaultListenImpl);
  });

  it("hydrates from one bootstrap snapshot then processes matching stream events", async () => {
    invoke.mockImplementation(async (command: string) => {
      if (command === "open_session_snapshot") {
        return {
          envelope: { session_id: "session-1", source_kind: "live", seek_epoch: 0, reset_revision: 0 },
          session: {
            available: true,
            complete: true,
            provenance: "bootstrap",
            value: { status: "active", connection: { kind: "disconnected" } },
          },
          telemetry: {
            available: true,
            complete: true,
            provenance: "bootstrap",
            value: {
              flight: { altitude_m: 10 },
              navigation: { latitude_deg: 47.1, longitude_deg: 8.5, heading_deg: 90 },
              gps: { fix_type: "fix_3d" },
            },
          },
          support: { available: true, complete: true, provenance: "bootstrap", value: { can_request_prearm_checks: true, can_calibrate_accel: true, can_calibrate_compass: true, can_calibrate_radio: false } },
          sensor_health: { available: true, complete: true, provenance: "bootstrap", value: { gyro: "healthy", accel: "healthy", mag: "healthy", baro: "healthy", gps: "healthy", airspeed: "not_present", rc_receiver: "healthy", battery: "healthy", terrain: "not_present", geofence: "not_present" } },
          configuration_facts: { available: true, complete: false, provenance: "bootstrap", value: { frame: null, gps: null, battery_monitor: null, motors_esc: null } },
          calibration: { available: true, complete: false, provenance: "bootstrap", value: { accel: null, compass: null, radio: null } },
          guided: { available: false, complete: false, provenance: "bootstrap", value: null },
          status_text: { available: true, complete: true, provenance: "bootstrap", value: { entries: [] } },
          playback: { cursor_usec: null },
        };
      }

      if (command === "ack_session_snapshot") {
        return { result: "accepted" };
      }

      if (command === "available_transports") {
        return [];
      }

      throw new Error(`unexpected command ${command}`);
    });

    const { useSession } = await import("./use-session");
    const { result } = renderHook(() => useSession());

    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.telemetry.altitude_m).toBe(10);
    expect(result.current.vehiclePosition).toEqual({ latitude_deg: 47.1, longitude_deg: 8.5, heading_deg: 90 });
    expect(result.current.support.value?.can_request_prearm_checks).toBe(true);

    act(() => {
      listeners.get("telemetry://state")?.({
        payload: {
          envelope: { session_id: "session-1", source_kind: "live", seek_epoch: 0, reset_revision: 0 },
          value: {
            available: true,
            complete: true,
            provenance: "stream",
            value: {
              flight: { altitude_m: 42 },
              navigation: { latitude_deg: 47.2, longitude_deg: 8.6, heading_deg: 91 },
              gps: { fix_type: "rtk_fixed" },
            },
          },
        },
      });
    });

    await waitFor(() => expect(result.current.telemetry.altitude_m).toBe(42));
    expect(result.current.telemetry.gps_fix_type).toBe("rtk_fixed");
  });

  it("ignores old session_id/reset_revision events", async () => {
    invoke.mockImplementation(async (command: string) => {
      if (command === "open_session_snapshot") {
        return {
          envelope: { session_id: "session-2", source_kind: "live", seek_epoch: 1, reset_revision: 3 },
          session: {
            available: true,
            complete: true,
            provenance: "bootstrap",
            value: { status: "active", connection: { kind: "connected" } },
          },
          telemetry: {
            available: true,
            complete: true,
            provenance: "bootstrap",
            value: { flight: { altitude_m: 12 }, navigation: {}, gps: {} },
          },
          support: { available: false, complete: false, provenance: "bootstrap", value: null },
          sensor_health: { available: false, complete: false, provenance: "bootstrap", value: null },
          configuration_facts: { available: false, complete: false, provenance: "bootstrap", value: null },
          calibration: { available: false, complete: false, provenance: "bootstrap", value: null },
          guided: { available: false, complete: false, provenance: "bootstrap", value: null },
          status_text: { available: true, complete: true, provenance: "bootstrap", value: { entries: [] } },
          playback: { cursor_usec: null },
        };
      }

      if (command === "ack_session_snapshot") {
        return { result: "accepted" };
      }

      if (command === "available_transports") {
        return [];
      }

      throw new Error(`unexpected command ${command}`);
    });

    const { useSession } = await import("./use-session");
    const { result } = renderHook(() => useSession());

    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => {
      listeners.get("telemetry://state")?.({
        payload: {
          envelope: { session_id: "session-1", source_kind: "live", seek_epoch: 1, reset_revision: 3 },
          value: {
            available: true,
            complete: true,
            provenance: "stream",
            value: { flight: { altitude_m: 99 }, navigation: {}, gps: {} },
          },
        },
      });
      listeners.get("telemetry://state")?.({
        payload: {
          envelope: { session_id: "session-2", source_kind: "live", seek_epoch: 1, reset_revision: 2 },
          value: {
            available: true,
            complete: true,
            provenance: "stream",
            value: { flight: { altitude_m: 100 }, navigation: {}, gps: {} },
          },
        },
      });
    });

    expect(result.current.telemetry.altitude_m).toBe(12);
  });

  it("preserves buffered same-envelope stream updates over older bootstrap state", async () => {
    let resolveSnapshot: ((value: unknown) => void) | null = null;
    let resolveAck: ((value: unknown) => void) | null = null;

    invoke.mockImplementation(async (command: string) => {
      if (command === "open_session_snapshot") {
        return await new Promise((resolve) => {
          resolveSnapshot = resolve;
        });
      }

      if (command === "ack_session_snapshot") {
        return await new Promise((resolve) => {
          resolveAck = resolve;
        });
      }

      if (command === "available_transports") {
        return [];
      }

      throw new Error(`unexpected command ${command}`);
    });

    const { useSession } = await import("./use-session");
    const { result } = renderHook(() => useSession());

    await waitFor(() => expect(resolveSnapshot).not.toBeNull());

    act(() => {
      resolveSnapshot?.({
        envelope: { session_id: "session-9", source_kind: "live", seek_epoch: 4, reset_revision: 2 },
        session: {
          available: true,
          complete: true,
          provenance: "bootstrap",
          value: { status: "active", connection: { kind: "connected" } },
        },
        telemetry: {
          available: true,
          complete: true,
          provenance: "bootstrap",
          value: { flight: { altitude_m: 10 }, navigation: {}, gps: {} },
        },
        support: { available: true, complete: true, provenance: "bootstrap", value: { can_request_prearm_checks: true, can_calibrate_accel: true, can_calibrate_compass: true, can_calibrate_radio: false } },
        sensor_health: { available: true, complete: true, provenance: "bootstrap", value: { gyro: "unhealthy", accel: "healthy", mag: "healthy", baro: "healthy", gps: "healthy", airspeed: "not_present", rc_receiver: "healthy", battery: "healthy", terrain: "not_present", geofence: "not_present" } },
        configuration_facts: { available: true, complete: false, provenance: "bootstrap", value: { frame: null, gps: null, battery_monitor: null, motors_esc: null } },
        calibration: { available: true, complete: false, provenance: "bootstrap", value: { accel: null, compass: null, radio: null } },
        guided: { available: false, complete: false, provenance: "bootstrap", value: null },
        status_text: { available: true, complete: true, provenance: "bootstrap", value: { entries: [] } },
        playback: { cursor_usec: null },
      });
    });

    await waitFor(() => expect(resolveAck).not.toBeNull());

    act(() => {
      listeners.get("telemetry://state")?.({
        payload: {
          envelope: { session_id: "session-9", source_kind: "live", seek_epoch: 4, reset_revision: 2 },
          value: {
            available: true,
            complete: true,
            provenance: "stream",
            value: { flight: { altitude_m: 50 }, navigation: {}, gps: {} },
          },
        },
      });
    });

    act(() => {
      resolveAck?.({ result: "accepted" });
    });

    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.telemetry.altitude_m).toBe(50);
  });

  it("uses the same readers for playback bootstrap payloads", async () => {
    invoke.mockImplementation(async (command: string) => {
      if (command === "open_session_snapshot") {
        return {
          envelope: { session_id: "session-playback", source_kind: "playback", seek_epoch: 2, reset_revision: 1 },
          session: {
            available: true,
            complete: true,
            provenance: "bootstrap",
            value: {
              status: "active",
              connection: { kind: "disconnected" },
              vehicle_state: { armed: true, custom_mode: 6, mode_name: "Auto", system_status: "active", vehicle_type: "quad", autopilot: "ardu_pilot_mega", system_id: 1, component_id: 1, heartbeat_received: true },
              home_position: null,
            },
          },
          telemetry: {
            available: true,
            complete: true,
            provenance: "bootstrap",
            value: {
              flight: { altitude_m: 33 },
              navigation: { latitude_deg: 47.25, longitude_deg: 8.55, heading_deg: 123 },
              gps: { fix_type: "fix_3d" },
            },
          },
          support: { available: false, complete: false, provenance: "bootstrap", value: null },
          sensor_health: { available: false, complete: false, provenance: "bootstrap", value: null },
          configuration_facts: { available: false, complete: false, provenance: "bootstrap", value: null },
          calibration: { available: false, complete: false, provenance: "bootstrap", value: null },
          guided: { available: false, complete: false, provenance: "playback", value: null },
          status_text: { available: true, complete: true, provenance: "bootstrap", value: { entries: [] } },
          playback: { cursor_usec: 123456 },
        };
      }

      if (command === "ack_session_snapshot") {
        return { result: "accepted" };
      }

      if (command === "available_transports") {
        return [];
      }

      throw new Error(`unexpected command ${command}`);
    });

    const { useSession } = await import("./use-session");
    const { result } = renderHook(() => useSession());

    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.telemetry.altitude_m).toBe(33);
    expect(result.current.telemetry.gps_fix_type).toBe("fix_3d");
    expect(result.current.vehiclePosition).toEqual({ latitude_deg: 47.25, longitude_deg: 8.55, heading_deg: 123 });
    expect(result.current.vehicleState?.mode_name).toBe("Auto");
  });

});
