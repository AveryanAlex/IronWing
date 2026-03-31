import { describe, expect, it } from "vitest";
import type { GeoRef } from "./mission-coordinates";
import {
  catmullRomComponent,
  sampleArcPoints,
  sampleSplinePoints,
} from "./mission-path-interpolation";

const BASE: GeoRef = { latitude_deg: 47, longitude_deg: 8 };

function offset(lat: number, lon: number): GeoRef {
  return { latitude_deg: BASE.latitude_deg + lat, longitude_deg: BASE.longitude_deg + lon };
}

describe("catmullRomComponent", () => {
  it("returns p1 at t=0 and p2 at t=1", () => {
    expect(catmullRomComponent(0, 10, 20, 30, 0)).toBeCloseTo(10, 10);
    expect(catmullRomComponent(0, 10, 20, 30, 1)).toBeCloseTo(20, 10);
  });
});

describe("sampleSplinePoints", () => {
  const control0 = offset(-0.001, 0);
  const point1 = offset(0, 0);
  const point2 = offset(0.001, 0.001);
  const control3 = offset(0.002, 0.001);

  it("returns steps + 1 points", () => {
    const result = sampleSplinePoints(control0, point1, point2, control3, 10);
    expect(result).toHaveLength(11);
  });

  it("snaps first point to point1 and last to point2", () => {
    const result = sampleSplinePoints(control0, point1, point2, control3, 10);
    expect(result[0]).toEqual({ latitude_deg: point1.latitude_deg, longitude_deg: point1.longitude_deg });
    expect(result[result.length - 1]).toEqual({ latitude_deg: point2.latitude_deg, longitude_deg: point2.longitude_deg });
  });

  it("intermediate points differ from straight-line interpolation", () => {
    const result = sampleSplinePoints(control0, point1, point2, control3, 20);
    const midpoint = result[10]!;
    const straightMidLat = (point1.latitude_deg + point2.latitude_deg) / 2;
    const straightMidLon = (point1.longitude_deg + point2.longitude_deg) / 2;
    // Spline should deviate from the straight midpoint (at least slightly).
    const latDiff = Math.abs(midpoint.latitude_deg - straightMidLat);
    const lonDiff = Math.abs(midpoint.longitude_deg - straightMidLon);
    expect(latDiff + lonDiff).toBeGreaterThan(0);
  });
});

describe("sampleArcPoints", () => {
  it("returns null for zero arc angle", () => {
    expect(sampleArcPoints(offset(0, 0), offset(0.001, 0), 0, "Clockwise", 10)).toBeNull();
  });

  it("returns null for coincident start and end", () => {
    expect(sampleArcPoints(offset(0, 0), offset(0, 0), 90, "Clockwise", 10)).toBeNull();
  });

  it("returns steps + 1 points for a valid arc", () => {
    const result = sampleArcPoints(offset(0, 0), offset(0, 0.001), 90, "Clockwise", 16);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(17);
  });

  it("snaps endpoints to start and end", () => {
    const start = offset(0, 0);
    const end = offset(0, 0.001);
    const result = sampleArcPoints(start, end, 90, "CounterClockwise", 10)!;
    expect(result[0]).toEqual({ latitude_deg: start.latitude_deg, longitude_deg: start.longitude_deg });
    expect(result[result.length - 1]).toEqual({ latitude_deg: end.latitude_deg, longitude_deg: end.longitude_deg });
  });
});
