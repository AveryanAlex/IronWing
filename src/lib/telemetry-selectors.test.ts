import { beforeEach, describe, expect, it, vi } from "vitest";

const { listen } = vi.hoisted(() => ({
  listen: vi.fn(),
}));

vi.mock("@platform/event", () => ({
  listen,
}));

import { selectTelemetryView } from "./telemetry-selectors";
import { subscribeTelemetryState } from "../telemetry";

describe("telemetry selectors", () => {
  beforeEach(() => {
    listen.mockReset();
  });

  it("derive widget state from grouped telemetry subdomains", () => {
    const view = selectTelemetryView({
      available: true,
      complete: true,
      provenance: "stream",
      value: {
        flight: { altitude_m: 123, speed_mps: 12, climb_rate_mps: 1.5, throttle_pct: 55 },
        navigation: { heading_deg: 87, wp_dist_m: 33, nav_bearing_deg: 80, target_bearing_deg: 90 },
        attitude: { roll_deg: 1, pitch_deg: 2, yaw_deg: 88 },
        power: { battery_pct: 76, battery_voltage_v: 23.8, battery_current_a: 12.5 },
        gps: { fix_type: "fix_3d", satellites: 14, hdop: 0.8 },
        terrain: { terrain_height_m: 11, height_above_terrain_m: 112 },
        radio: { rc_rssi: 88, rc_channels: [1100, 1500], servo_outputs: [1000, 2000] },
      },
    });

    expect(view.altitude_m).toBe(123);
    expect(view.heading_deg).toBe(87);
    expect(view.battery_pct).toBe(76);
    expect(view.gps_fix_type).toBe("fix_3d");
    expect(view.rc_channels).toEqual([1100, 1500]);
  });

  it("unwraps scoped telemetry payloads from Rust", async () => {
    const domain = {
      available: true,
      complete: true,
      provenance: "stream",
      value: { flight: { altitude_m: 9 }, navigation: {}, gps: {} },
    } as const;
    const cb = vi.fn();

    listen.mockImplementation(async (_event, handler) => {
      handler({
        payload: {
          envelope: { session_id: "session-1", source_kind: "live", seek_epoch: 0, reset_revision: 0 },
          value: domain,
        },
      });
      return () => {};
    });

    await subscribeTelemetryState(cb);

    expect(cb).toHaveBeenCalledWith(domain);
  });

  it("ignores stale telemetry envelopes for direct subscribers", async () => {
    const cb = vi.fn();
    let handlerRef: ((event: { payload: unknown }) => void) | null = null;

    listen.mockImplementation(async (_event, handler) => {
      handlerRef = handler;
      return () => {};
    });

    await subscribeTelemetryState(cb);

    const handler: ((event: { payload: unknown }) => void) | null = handlerRef;
    if (!handler) throw new Error("missing telemetry handler");

    (handler as any)({
      payload: {
        envelope: { session_id: "session-current", source_kind: "live", seek_epoch: 1, reset_revision: 0 },
        value: { available: true, complete: true, provenance: "stream", value: { flight: { altitude_m: 2 } } },
      },
    });
    (handler as any)({
      payload: {
        envelope: { session_id: "session-older", source_kind: "live", seek_epoch: 0, reset_revision: 0 },
        value: { available: true, complete: true, provenance: "stream", value: { flight: { altitude_m: 1 } } },
      },
    });

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith({
      available: true,
      complete: true,
      provenance: "stream",
      value: { flight: { altitude_m: 2 } },
    });
  });
});
