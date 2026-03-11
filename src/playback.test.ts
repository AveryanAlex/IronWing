import { describe, it, expect } from "vitest";
import { interpolateLogTelemetry, type TelemetrySnapshot } from "./playback";

function snap(
  ts: number,
  overrides: Partial<TelemetrySnapshot> = {},
): TelemetrySnapshot {
  return {
    timestamp_usec: ts,
    latitude_deg: 47.3,
    longitude_deg: 8.5,
    altitude_m: 100,
    heading_deg: 90,
    speed_mps: 10,
    roll_deg: 0,
    pitch_deg: 0,
    yaw_deg: 90,
    armed: true,
    custom_mode: 4,
    ...overrides,
  };
}

describe("interpolateLogTelemetry", () => {
  it("returns null for empty track", () => {
    expect(interpolateLogTelemetry([], 1000)).toBeNull();
  });

  it("clamps to first snapshot when time is before track start", () => {
    const track = [snap(1000, { altitude_m: 50 }), snap(2000, { altitude_m: 100 })];
    const result = interpolateLogTelemetry(track, 500);

    expect(result).not.toBeNull();
    expect(result!.telemetry.altitude_m).toBe(50);
  });

  it("clamps to last snapshot when time is after track end", () => {
    const track = [snap(1000, { altitude_m: 50 }), snap(2000, { altitude_m: 100 })];
    const result = interpolateLogTelemetry(track, 9999);

    expect(result).not.toBeNull();
    expect(result!.telemetry.altitude_m).toBe(100);
  });

  it("returns exact snapshot when time matches", () => {
    const track = [snap(1000, { speed_mps: 5 }), snap(2000, { speed_mps: 15 })];
    const result = interpolateLogTelemetry(track, 1000);

    expect(result!.telemetry.speed_mps).toBe(5);
  });

  it("interpolates between two snapshots at midpoint", () => {
    const track = [
      snap(1000, { altitude_m: 100, speed_mps: 0 }),
      snap(2000, { altitude_m: 200, speed_mps: 20 }),
    ];
    const result = interpolateLogTelemetry(track, 1500);

    expect(result!.telemetry.altitude_m).toBeCloseTo(150);
    expect(result!.telemetry.speed_mps).toBeCloseTo(10);
  });

  it("interpolates at 25% between snapshots", () => {
    const track = [
      snap(0, { altitude_m: 0 }),
      snap(1000, { altitude_m: 100 }),
    ];
    const result = interpolateLogTelemetry(track, 250);

    expect(result!.telemetry.altitude_m).toBeCloseTo(25);
  });

  it("handles undefined fields gracefully (lerpOpt)", () => {
    const track = [
      snap(1000, { battery_pct: undefined, airspeed_mps: 10 }),
      snap(2000, { battery_pct: 80, airspeed_mps: undefined }),
    ];
    const result = interpolateLogTelemetry(track, 1500);

    expect(result!.telemetry.battery_pct).toBe(80);
    expect(result!.telemetry.airspeed_mps).toBe(10);
  });

  it("preserves discrete fields from earlier snapshot (no interpolation)", () => {
    const track = [
      snap(1000, { gps_fix_type: "3d_fix", armed: true, custom_mode: 4 }),
      snap(2000, { gps_fix_type: "dgps", armed: false, custom_mode: 5 }),
    ];
    const result = interpolateLogTelemetry(track, 1500);

    expect(result!.telemetry.gps_fix_type).toBe("3d_fix");
  });

  it("produces vehicleState when armed and custom_mode present", () => {
    const track = [snap(1000, { armed: true, custom_mode: 4 })];
    const result = interpolateLogTelemetry(track, 1000);

    expect(result!.vehicleState).not.toBeNull();
    expect(result!.vehicleState!.armed).toBe(true);
    expect(result!.vehicleState!.custom_mode).toBe(4);
  });

  it("produces null vehicleState when armed/custom_mode missing", () => {
    const track = [snap(1000, { armed: undefined, custom_mode: undefined })];
    const result = interpolateLogTelemetry(track, 1000);

    expect(result!.vehicleState).toBeNull();
  });

  it("binary search works across many snapshots", () => {
    const track = Array.from({ length: 100 }, (_, i) =>
      snap(i * 1000, { altitude_m: i * 10 }),
    );
    const result = interpolateLogTelemetry(track, 50_500);

    expect(result!.telemetry.altitude_m).toBeCloseTo(505);
  });

  it("handles single-element track", () => {
    const track = [snap(5000, { heading_deg: 270 })];
    const result = interpolateLogTelemetry(track, 5000);

    expect(result!.telemetry.heading_deg).toBe(270);
  });
});
