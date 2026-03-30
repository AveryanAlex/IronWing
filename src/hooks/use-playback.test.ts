// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
const listeners = new Map<string, (event: { payload: unknown }) => void>();
const defaultListenImpl = async (event: string, handler: (event: { payload: unknown }) => void) => {
  listeners.set(event, handler);
  return () => listeners.delete(event);
};
const listen = vi.fn(defaultListenImpl);

vi.mock("@platform/core", () => ({ invoke }));
vi.mock("@platform/event", () => ({ listen }));

describe("usePlayback", () => {
  let rafCallback: FrameRequestCallback | null = null;

  beforeEach(() => {
    invoke.mockReset();
    listeners.clear();
    listen.mockReset();
    listen.mockImplementation(defaultListenImpl);
    rafCallback = null;
    vi.stubGlobal("requestAnimationFrame", vi.fn((cb: FrameRequestCallback) => {
      rafCallback = cb;
      return 1;
    }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens playback as a session source and uses shared readers", async () => {
    invoke.mockImplementation(async (command: string) => {
      if (command === "open_session_snapshot") {
        return {
          envelope: { session_id: "session-1", source_kind: "playback", seek_epoch: 0, reset_revision: 0 },
          session: {
            available: true,
            complete: true,
            provenance: "bootstrap",
            value: {
              status: "active",
              connection: { kind: "disconnected" },
              vehicle_state: { armed: true, custom_mode: 4, mode_name: "Auto", system_status: "active", vehicle_type: "quad", autopilot: "ardu_pilot_mega", system_id: 1, component_id: 1, heartbeat_received: true },
              home_position: null,
            },
          },
          telemetry: {
            available: true,
            complete: true,
            provenance: "bootstrap",
            value: {
              flight: { altitude_m: 25 },
              navigation: { latitude_deg: 47.1, longitude_deg: 8.5, heading_deg: 90 },
              gps: { fix_type: "fix_3d" },
            },
          },
          support: { available: false, complete: false, provenance: "bootstrap", value: null },
          status_text: { available: true, complete: true, provenance: "bootstrap", value: { entries: [] } },
          playback: { cursor_usec: null },
        };
      }

      if (command === "ack_session_snapshot") {
        return { result: "accepted" };
      }

      throw new Error(`unexpected command ${command}`);
    });

    const { usePlayback } = await import("./use-playback");
    const { result } = renderHook(() => usePlayback());

    act(() => {
      result.current.configure(100, 1000);
    });

    await waitFor(() => expect(result.current.activeEnvelope?.source_kind).toBe("playback"));
    expect(result.current.telemetry.altitude_m).toBe(25);
    expect(result.current.telemetry.gps_fix_type).toBe("fix_3d");
    expect(result.current.vehiclePosition).toEqual({ latitude_deg: 47.1, longitude_deg: 8.5, heading_deg: 90 });
    expect(result.current.vehicleState?.mode_name).toBe("Auto");
  });

  it("captures the real seek barrier path even when playback events arrive before the seek promise resolves", async () => {
    let resolveSeek: ((value: unknown) => void) | null = null;

    invoke.mockImplementation(async (command: string) => {
      if (command === "open_session_snapshot") {
        return {
          envelope: { session_id: "session-1", source_kind: "playback", seek_epoch: 0, reset_revision: 0 },
          session: {
            available: true,
            complete: true,
            provenance: "bootstrap",
            value: {
              status: "active",
              connection: { kind: "disconnected" },
              vehicle_state: { armed: true, custom_mode: 4, mode_name: "Auto", system_status: "active", vehicle_type: "quad", autopilot: "ardu_pilot_mega", system_id: 1, component_id: 1, heartbeat_received: true },
              home_position: null,
            },
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
          support: { available: false, complete: false, provenance: "bootstrap", value: null },
          status_text: { available: true, complete: true, provenance: "bootstrap", value: { entries: [] } },
          playback: { cursor_usec: null },
        };
      }

      if (command === "ack_session_snapshot") {
        return { result: "accepted" };
      }

      if (command === "playback_seek") {
        return await new Promise((resolve) => {
          resolveSeek = resolve;
        });
      }

      throw new Error(`unexpected command ${command}`);
    });

    const { usePlayback } = await import("./use-playback");
    const { result } = renderHook(() => usePlayback());

    act(() => {
      result.current.configure(100, 1000);
    });

    await waitFor(() => expect(result.current.activeEnvelope?.seek_epoch).toBe(0));
    expect(result.current.currentTimeUsec).toBe(100);
    expect(result.current.telemetry.altitude_m).toBe(10);

    let seekPromise: Promise<void> | null = null;
    await act(async () => {
      seekPromise = result.current.seek(500);
    });

    expect(result.current.pendingEnvelope).toEqual({ session_id: "session-1", source_kind: "playback", seek_epoch: 1, reset_revision: 1 });
    expect(result.current.currentTimeUsec).toBe(100);
    expect(result.current.telemetry.altitude_m).toBe(10);

    act(() => {
      listeners.get("playback://state")?.({
        payload: {
          envelope: { session_id: "session-1", source_kind: "playback", seek_epoch: 0, reset_revision: 0 },
          value: { cursor_usec: 250, barrier_ready: false },
        },
      });
      listeners.get("telemetry://state")?.({
        payload: {
          envelope: { session_id: "session-1", source_kind: "playback", seek_epoch: 0, reset_revision: 0 },
          value: {
            available: true,
            complete: true,
            provenance: "stream",
            value: {
              flight: { altitude_m: 99 },
              navigation: { latitude_deg: 0, longitude_deg: 0, heading_deg: 0 },
              gps: { fix_type: "rtk_fixed" },
            },
          },
        },
      });
      listeners.get("session://state")?.({
        payload: {
          envelope: { session_id: "session-1", source_kind: "playback", seek_epoch: 1, reset_revision: 1 },
          value: {
            available: true,
            complete: true,
            provenance: "stream",
            value: {
              status: "active",
              connection: { kind: "disconnected" },
              vehicle_state: { armed: false, custom_mode: 6, mode_name: "RTL", system_status: "active", vehicle_type: "quad", autopilot: "ardu_pilot_mega", system_id: 1, component_id: 1, heartbeat_received: true },
              home_position: null,
            },
          },
        },
      });
      listeners.get("telemetry://state")?.({
        payload: {
          envelope: { session_id: "session-1", source_kind: "playback", seek_epoch: 1, reset_revision: 1 },
          value: {
            available: true,
            complete: true,
            provenance: "stream",
            value: {
              flight: { altitude_m: 50 },
              navigation: { latitude_deg: 47.2, longitude_deg: 8.6, heading_deg: 91 },
              gps: { fix_type: "rtk_fixed" },
            },
          },
        },
      });
    });

    expect(result.current.currentTimeUsec).toBe(100);
    expect(result.current.telemetry.altitude_m).toBe(10);
    expect(result.current.vehicleState?.mode_name).toBe("Auto");

    act(() => {
      listeners.get("playback://state")?.({
        payload: {
          envelope: { session_id: "session-1", source_kind: "playback", seek_epoch: 1, reset_revision: 1 },
          value: { cursor_usec: 500, barrier_ready: true },
        },
      });
    });

    await act(async () => {
      resolveSeek?.({
        envelope: { session_id: "session-1", source_kind: "playback", seek_epoch: 1, reset_revision: 1 },
        cursor_usec: 500,
      });
      await seekPromise;
    });

    await waitFor(() => expect(result.current.currentTimeUsec).toBe(500));
    expect(result.current.pendingEnvelope).toBeNull();
    expect(result.current.telemetry.altitude_m).toBe(50);
    expect(result.current.telemetry.gps_fix_type).toBe("rtk_fixed");
    expect(result.current.vehicleState?.mode_name).toBe("RTL");
    expect(result.current.vehiclePosition).toEqual({ latitude_deg: 47.2, longitude_deg: 8.6, heading_deg: 91 });
  });

  it("ignores stale configure results after stop and reopen", async () => {
    let resolveFirstOpen: ((value: unknown) => void) | null = null;
    let openCount = 0;

    invoke.mockImplementation(async (command: string) => {
      if (command === "open_session_snapshot") {
        openCount += 1;
        if (openCount === 1) {
          return await new Promise((resolve) => {
            resolveFirstOpen = resolve;
          });
        }

        return {
          envelope: { session_id: "session-2", source_kind: "playback", seek_epoch: 0, reset_revision: 1 },
          session: {
            available: true,
            complete: true,
            provenance: "bootstrap",
            value: {
              status: "active",
              connection: { kind: "disconnected" },
              vehicle_state: { armed: false, custom_mode: 6, mode_name: "RTL", system_status: "active", vehicle_type: "quad", autopilot: "ardu_pilot_mega", system_id: 1, component_id: 1, heartbeat_received: true },
              home_position: null,
            },
          },
          telemetry: {
            available: true,
            complete: true,
            provenance: "bootstrap",
            value: {
              flight: { altitude_m: 44 },
              navigation: { latitude_deg: 48.1, longitude_deg: 9.1, heading_deg: 120 },
              gps: { fix_type: "rtk_fixed" },
            },
          },
          support: { available: false, complete: false, provenance: "bootstrap", value: null },
          status_text: { available: true, complete: true, provenance: "bootstrap", value: { entries: [] } },
          playback: { cursor_usec: 300 },
        };
      }

      if (command === "ack_session_snapshot") {
        return { result: "accepted" };
      }

      throw new Error(`unexpected command ${command}`);
    });

    const { usePlayback } = await import("./use-playback");
    const { result } = renderHook(() => usePlayback());

    act(() => {
      result.current.configure(100, 1000);
    });

    await waitFor(() => expect(resolveFirstOpen).not.toBeNull());

    act(() => {
      result.current.stop();
      result.current.configure(300, 1200);
    });

    await waitFor(() => expect(result.current.activeEnvelope?.session_id).toBe("session-2"));
    expect(result.current.currentTimeUsec).toBe(300);
    expect(result.current.telemetry.altitude_m).toBe(44);

    act(() => {
      resolveFirstOpen?.({
        envelope: { session_id: "session-1", source_kind: "playback", seek_epoch: 0, reset_revision: 0 },
        session: {
          available: true,
          complete: true,
          provenance: "bootstrap",
          value: {
            status: "active",
            connection: { kind: "disconnected" },
            vehicle_state: { armed: true, custom_mode: 4, mode_name: "Auto", system_status: "active", vehicle_type: "quad", autopilot: "ardu_pilot_mega", system_id: 1, component_id: 1, heartbeat_received: true },
            home_position: null,
          },
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
        support: { available: false, complete: false, provenance: "bootstrap", value: null },
        status_text: { available: true, complete: true, provenance: "bootstrap", value: { entries: [] } },
        playback: { cursor_usec: 100 },
      });
    });

    await waitFor(() => expect(result.current.activeEnvelope?.session_id).toBe("session-2"));
    expect(result.current.currentTimeUsec).toBe(300);
    expect(result.current.telemetry.altitude_m).toBe(44);
    expect(result.current.vehicleState?.mode_name).toBe("RTL");
  });

  it("advances shared playback readers while playback is running", async () => {
    let resolveSeek: ((value: unknown) => void) | null = null;

    invoke.mockImplementation(async (command: string, args?: { cursorUsec?: number }) => {
      if (command === "open_session_snapshot") {
        return {
          envelope: { session_id: "session-1", source_kind: "playback", seek_epoch: 0, reset_revision: 0 },
          session: {
            available: true,
            complete: true,
            provenance: "playback",
            value: {
              status: "active",
              connection: { kind: "disconnected" },
              vehicle_state: { armed: true, custom_mode: 4, mode_name: "Auto", system_status: "active", vehicle_type: "quad", autopilot: "ardu_pilot_mega", system_id: 1, component_id: 1, heartbeat_received: true },
              home_position: null,
            },
          },
          telemetry: {
            available: true,
            complete: true,
            provenance: "playback",
            value: {
              flight: { altitude_m: 10 },
              navigation: { latitude_deg: 47.1, longitude_deg: 8.5, heading_deg: 90 },
              gps: { fix_type: "fix_3d" },
            },
          },
          support: { available: false, complete: false, provenance: "playback", value: null },
          status_text: { available: true, complete: true, provenance: "playback", value: { entries: [] } },
          playback: { cursor_usec: 100 },
        };
      }

      if (command === "ack_session_snapshot") {
        return { result: "accepted" };
      }

      if (command === "playback_seek") {
        const envelope = { session_id: "session-1", source_kind: "playback", seek_epoch: 1, reset_revision: 1 } as const;
        return await new Promise((resolve) => {
          resolveSeek = (value) => {
            listeners.get("session://state")?.({
              payload: {
                envelope,
                value: {
                  available: true,
                  complete: true,
                  provenance: "playback",
                  value: {
                    status: "active",
                    connection: { kind: "disconnected" },
                    vehicle_state: { armed: false, custom_mode: 6, mode_name: "RTL", system_status: "active", vehicle_type: "quad", autopilot: "ardu_pilot_mega", system_id: 1, component_id: 1, heartbeat_received: true },
                    home_position: null,
                  },
                },
              },
            });
            listeners.get("telemetry://state")?.({
              payload: {
                envelope,
                value: {
                  available: true,
                  complete: true,
                  provenance: "playback",
                  value: {
                    flight: { altitude_m: args?.cursorUsec === 500 ? 50 : 10 },
                    navigation: { latitude_deg: 47.2, longitude_deg: 8.6, heading_deg: 91 },
                    gps: { fix_type: "rtk_fixed" },
                  },
                },
              },
            });
            resolve(value);
          };
        });
      }

      throw new Error(`unexpected command ${command}`);
    });

    const { usePlayback } = await import("./use-playback");
    const { result } = renderHook(() => usePlayback());

    act(() => {
      result.current.configure(100, 1000);
    });

    await waitFor(() => expect(result.current.activeEnvelope?.seek_epoch).toBe(0));

    act(() => {
      result.current.play();
      rafCallback?.(0);
      rafCallback?.(0.4);
    });

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("playback_seek", { cursorUsec: 500 }));
    expect(result.current.currentTimeUsec).toBe(100);

    act(() => {
      listeners.get("playback://state")?.({
        payload: {
          envelope: { session_id: "session-1", source_kind: "playback", seek_epoch: 1, reset_revision: 1 },
          value: { cursor_usec: 500, barrier_ready: true },
        },
      });
    });

    await act(async () => {
      resolveSeek?.({
        envelope: { session_id: "session-1", source_kind: "playback", seek_epoch: 1, reset_revision: 1 },
        cursor_usec: 500,
      });
    });

    await waitFor(() => expect(result.current.currentTimeUsec).toBe(500));
    expect(result.current.telemetry.altitude_m).toBe(50);
    expect(result.current.telemetry.gps_fix_type).toBe("rtk_fixed");
    expect(result.current.vehicleState?.mode_name).toBe("RTL");
  });

  it("invalidates stale seek completions after stop", async () => {
    let resolveSeek: ((value: unknown) => void) | null = null;

    invoke.mockImplementation(async (command: string) => {
      if (command === "open_session_snapshot") {
        return {
          envelope: { session_id: "session-1", source_kind: "playback", seek_epoch: 0, reset_revision: 0 },
          session: {
            available: true,
            complete: true,
            provenance: "bootstrap",
            value: {
              status: "active",
              connection: { kind: "disconnected" },
              vehicle_state: { armed: true, custom_mode: 4, mode_name: "Auto", system_status: "active", vehicle_type: "quad", autopilot: "ardu_pilot_mega", system_id: 1, component_id: 1, heartbeat_received: true },
              home_position: null,
            },
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
          support: { available: false, complete: false, provenance: "bootstrap", value: null },
          status_text: { available: true, complete: true, provenance: "bootstrap", value: { entries: [] } },
          playback: { cursor_usec: 100 },
        };
      }

      if (command === "ack_session_snapshot") {
        return { result: "accepted" };
      }

      if (command === "playback_seek") {
        return await new Promise((resolve) => {
          resolveSeek = resolve;
        });
      }

      throw new Error(`unexpected command ${command}`);
    });

    const { usePlayback } = await import("./use-playback");
    const { result } = renderHook(() => usePlayback());

    act(() => {
      result.current.configure(100, 1000);
    });

    await waitFor(() => expect(result.current.activeEnvelope?.session_id).toBe("session-1"));

    await act(async () => {
      void result.current.seek(500);
    });

    expect(result.current.pendingEnvelope?.seek_epoch).toBe(1);

    act(() => {
      result.current.stop();
      listeners.get("playback://state")?.({
        payload: {
          envelope: { session_id: "session-1", source_kind: "playback", seek_epoch: 1, reset_revision: 1 },
          value: { cursor_usec: 500, barrier_ready: true },
        },
      });
    });

    await act(async () => {
      resolveSeek?.({
        envelope: { session_id: "session-1", source_kind: "playback", seek_epoch: 1, reset_revision: 1 },
        cursor_usec: 500,
      });
    });

    expect(result.current.activeEnvelope).toBeNull();
    expect(result.current.pendingEnvelope).toBeNull();
    expect(result.current.currentTimeUsec).toBe(0);
    expect(result.current.telemetry.altitude_m).toBeUndefined();
  });

  it("serializes concurrent manual seeks", async () => {
    const pendingResolves: Array<(value: unknown) => void> = [];

    invoke.mockImplementation(async (command: string, args?: { cursorUsec?: number }) => {
      if (command === "open_session_snapshot") {
        return {
          envelope: { session_id: "session-1", source_kind: "playback", seek_epoch: 0, reset_revision: 0 },
          session: {
            available: true,
            complete: true,
            provenance: "bootstrap",
            value: {
              status: "active",
              connection: { kind: "disconnected" },
              vehicle_state: { armed: true, custom_mode: 4, mode_name: "Auto", system_status: "active", vehicle_type: "quad", autopilot: "ardu_pilot_mega", system_id: 1, component_id: 1, heartbeat_received: true },
              home_position: null,
            },
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
          support: { available: false, complete: false, provenance: "bootstrap", value: null },
          status_text: { available: true, complete: true, provenance: "bootstrap", value: { entries: [] } },
          playback: { cursor_usec: 100 },
        };
      }

      if (command === "ack_session_snapshot") {
        return { result: "accepted" };
      }

      if (command === "playback_seek") {
        const seekEpoch = pendingResolves.length + 1;
        const envelope = { session_id: "session-1", source_kind: "playback", seek_epoch: seekEpoch, reset_revision: seekEpoch } as const;
        return await new Promise((resolve) => {
          pendingResolves.push((value) => {
            listeners.get("playback://state")?.({
              payload: {
                envelope,
                value: { cursor_usec: args?.cursorUsec ?? null, barrier_ready: true },
              },
            });
            resolve(value);
          });
        });
      }

      throw new Error(`unexpected command ${command}`);
    });

    const { usePlayback } = await import("./use-playback");
    const { result } = renderHook(() => usePlayback());

    act(() => {
      result.current.configure(100, 1000);
    });

    await waitFor(() => expect(result.current.activeEnvelope?.session_id).toBe("session-1"));

    let firstSeek: Promise<void>;
    let secondSeek: Promise<void>;
    await act(async () => {
      firstSeek = result.current.seek(400);
      secondSeek = result.current.seek(700);
    });

    expect(invoke).toHaveBeenCalledTimes(3);
    expect(invoke).toHaveBeenNthCalledWith(3, "playback_seek", { cursorUsec: 400 });
    expect(result.current.pendingEnvelope?.seek_epoch).toBe(1);

    await act(async () => {
      pendingResolves[0]?.({
        envelope: { session_id: "session-1", source_kind: "playback", seek_epoch: 1, reset_revision: 1 },
        cursor_usec: 400,
      });
      await firstSeek!;
    });

    await waitFor(() => expect(invoke).toHaveBeenNthCalledWith(4, "playback_seek", { cursorUsec: 700 }));
    expect(result.current.currentTimeUsec).toBe(400);

    await act(async () => {
      pendingResolves[1]?.({
        envelope: { session_id: "session-1", source_kind: "playback", seek_epoch: 2, reset_revision: 2 },
        cursor_usec: 700,
      });
      await secondSeek!;
    });

    await waitFor(() => expect(result.current.currentTimeUsec).toBe(700));
  });

  it("keeps the rendered cursor behind the optimistic play cursor until confirmation", async () => {
    let resolveSeek: ((value: unknown) => void) | null = null;

    invoke.mockImplementation(async (command: string, args?: { cursorUsec?: number }) => {
      if (command === "open_session_snapshot") {
        return {
          envelope: { session_id: "session-1", source_kind: "playback", seek_epoch: 0, reset_revision: 0 },
          session: {
            available: true,
            complete: true,
            provenance: "bootstrap",
            value: {
              status: "active",
              connection: { kind: "disconnected" },
              vehicle_state: { armed: true, custom_mode: 4, mode_name: "Auto", system_status: "active", vehicle_type: "quad", autopilot: "ardu_pilot_mega", system_id: 1, component_id: 1, heartbeat_received: true },
              home_position: null,
            },
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
          support: { available: false, complete: false, provenance: "bootstrap", value: null },
          status_text: { available: true, complete: true, provenance: "bootstrap", value: { entries: [] } },
          playback: { cursor_usec: 100 },
        };
      }

      if (command === "ack_session_snapshot") {
        return { result: "accepted" };
      }

      if (command === "playback_seek") {
        return await new Promise((resolve) => {
          resolveSeek = resolve;
        });
      }

      throw new Error(`unexpected command ${command}`);
    });

    const { usePlayback } = await import("./use-playback");
    const { result } = renderHook(() => usePlayback());

    act(() => {
      result.current.configure(100, 1000);
    });

    await waitFor(() => expect(result.current.currentTimeUsec).toBe(100));

    act(() => {
      result.current.play();
      rafCallback?.(0);
      rafCallback?.(0.2);
    });

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("playback_seek", { cursorUsec: 300 }));
    expect(result.current.currentTimeUsec).toBe(100);

    act(() => {
      listeners.get("playback://state")?.({
        payload: {
          envelope: { session_id: "session-1", source_kind: "playback", seek_epoch: 1, reset_revision: 1 },
          value: { cursor_usec: 300, barrier_ready: true },
        },
      });
    });

    await act(async () => {
      resolveSeek?.({
        envelope: { session_id: "session-1", source_kind: "playback", seek_epoch: 1, reset_revision: 1 },
        cursor_usec: 300,
      });
    });

    await waitFor(() => expect(result.current.currentTimeUsec).toBe(300));
  });
});
