import { describe, expect, it } from "vitest";
import type { FenceRegion } from "./mavkit-types";
import { haversineM } from "./geo-utils";
import { computeFenceStats } from "./fence-statistics";

// Square polygon (0,0) → (0.001,0) → (0.001,0.001) → (0,0.001) near the equator.
// Each side is exactly 0.001 degrees — actual metres derived from haversine.
const VERTICES_SQUARE = [
  { latitude_deg: 0, longitude_deg: 0 },
  { latitude_deg: 0.001, longitude_deg: 0 },
  { latitude_deg: 0.001, longitude_deg: 0.001 },
  { latitude_deg: 0, longitude_deg: 0.001 },
];

// North/south sides (latitude changes, longitude fixed): 0.001 deg lat in metres.
const SIDE_NS_M = haversineM(0, 0, 0.001, 0);
// East/west sides (longitude changes, latitude fixed at ~0): 0.001 deg lon in metres.
const SIDE_EW_M = haversineM(0, 0, 0, 0.001);
// Area ≈ side_NS * side_EW (the near-equator square is very nearly a rectangle in local metres)
const EXPECTED_PERIMETER_M = 2 * SIDE_NS_M + 2 * SIDE_EW_M;

const squarePolygon: FenceRegion = {
  inclusion_polygon: { vertices: VERTICES_SQUARE, inclusion_group: 0 },
};

const exclusionSquare: FenceRegion = {
  exclusion_polygon: { vertices: VERTICES_SQUARE },
};

const inclusionCircle: FenceRegion = {
  inclusion_circle: {
    center: { latitude_deg: 10, longitude_deg: 20 },
    radius_m: 100,
    inclusion_group: 0,
  },
};

const exclusionCircle: FenceRegion = {
  exclusion_circle: {
    center: { latitude_deg: 10, longitude_deg: 20 },
    radius_m: 50,
  },
};

describe("computeFenceStats", () => {
  it("returns zeroes for empty regions", () => {
    const stats = computeFenceStats([]);
    expect(stats.regionCount).toBe(0);
    expect(stats.totalPerimeterM).toBe(0);
    expect(stats.totalAreaM2).toBe(0);
  });

  it("computes perimeter and area for a near-equator rectangular inclusion polygon", () => {
    const stats = computeFenceStats([squarePolygon]);
    expect(stats.regionCount).toBe(1);
    // 2 N/S sides + 2 E/W sides — derived from haversine so no approximation error
    expect(stats.totalPerimeterM).toBeCloseTo(EXPECTED_PERIMETER_M, 4);
    // Area is NS * EW in local metres; tolerance -2 (±50 m²) accommodates
    // the flat-earth projection error on a ~12 000 m² polygon.
    expect(stats.totalAreaM2).toBeCloseTo(SIDE_NS_M * SIDE_EW_M, -2);
  });

  it("computes perimeter and area for a near-equator rectangular exclusion polygon", () => {
    const stats = computeFenceStats([exclusionSquare]);
    expect(stats.regionCount).toBe(1);
    expect(stats.totalPerimeterM).toBeCloseTo(EXPECTED_PERIMETER_M, 4);
    expect(stats.totalAreaM2).toBeCloseTo(SIDE_NS_M * SIDE_EW_M, -2);
  });

  it("computes perimeter and area for an inclusion circle", () => {
    const r = 100;
    const stats = computeFenceStats([inclusionCircle]);
    expect(stats.regionCount).toBe(1);
    expect(stats.totalPerimeterM).toBeCloseTo(2 * Math.PI * r, 6);
    expect(stats.totalAreaM2).toBeCloseTo(Math.PI * r * r, 6);
  });

  it("computes perimeter and area for an exclusion circle", () => {
    const r = 50;
    const stats = computeFenceStats([exclusionCircle]);
    expect(stats.regionCount).toBe(1);
    expect(stats.totalPerimeterM).toBeCloseTo(2 * Math.PI * r, 6);
    expect(stats.totalAreaM2).toBeCloseTo(Math.PI * r * r, 6);
  });

  it("accumulates totals across mixed region types", () => {
    const r = 100;
    const circlePerimeter = 2 * Math.PI * r;
    const circleArea = Math.PI * r * r;

    const stats = computeFenceStats([squarePolygon, inclusionCircle]);
    expect(stats.regionCount).toBe(2);
    expect(stats.totalPerimeterM).toBeCloseTo(EXPECTED_PERIMETER_M + circlePerimeter, 4);
    expect(stats.totalAreaM2).toBeCloseTo(SIDE_NS_M * SIDE_EW_M + circleArea, -2);
  });
});
