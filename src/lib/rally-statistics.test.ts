import { describe, expect, it } from "vitest";
import type { GeoPoint3d } from "./mavkit-types";
import { haversineM } from "./geo-utils";
import { computeRallyStats } from "./rally-statistics";

const HOME = { latitude_deg: 51.5, longitude_deg: -0.1 };

// Two rally points at known offsets from home.
const POINT_A: GeoPoint3d = {
  Msl: { latitude_deg: 51.501, longitude_deg: -0.1, altitude_msl_m: 50 },
};
const POINT_B: GeoPoint3d = {
  RelHome: { latitude_deg: 51.5, longitude_deg: -0.09, relative_alt_m: 30 },
};

const DIST_A = haversineM(HOME.latitude_deg, HOME.longitude_deg, 51.501, -0.1);
const DIST_B = haversineM(HOME.latitude_deg, HOME.longitude_deg, 51.5, -0.09);

describe("computeRallyStats", () => {
  it("returns count 0 and null maxDistanceFromHomeM for empty points", () => {
    const stats = computeRallyStats([], HOME);
    expect(stats.pointCount).toBe(0);
    expect(stats.maxDistanceFromHomeM).toBeNull();
  });

  it("returns count 0 and null maxDistanceFromHomeM when home is null", () => {
    const stats = computeRallyStats([POINT_A], null);
    expect(stats.pointCount).toBe(1);
    expect(stats.maxDistanceFromHomeM).toBeNull();
  });

  it("computes correct count and max distance for two rally points", () => {
    const stats = computeRallyStats([POINT_A, POINT_B], HOME);
    expect(stats.pointCount).toBe(2);
    const expectedMax = Math.max(DIST_A, DIST_B);
    expect(stats.maxDistanceFromHomeM).not.toBeNull();
    expect(stats.maxDistanceFromHomeM!).toBeCloseTo(expectedMax, 2);
  });
});
