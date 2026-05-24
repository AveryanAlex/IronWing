import { describe, expect, it } from "vitest";

import { computeSvsSunPosition, resolveSvsAtmosphere } from "./svs-atmosphere";

describe("SVS atmosphere", () => {
  it("computes a high sun near equatorial noon and a low sun at midnight", () => {
    const noon = computeSvsSunPosition({
      latitudeDeg: 0,
      longitudeDeg: 0,
      time: new Date("2024-03-20T12:07:00.000Z"),
    });
    const midnight = computeSvsSunPosition({
      latitudeDeg: 0,
      longitudeDeg: 0,
      time: new Date("2024-03-20T00:07:00.000Z"),
    });

    expect(noon.elevationDeg).toBeGreaterThan(85);
    expect(midnight.elevationDeg).toBeLessThan(-85);
  });

  it("uses actual sun light by day and dim overhead light at night", () => {
    const day = resolveSvsAtmosphere({
      latitudeDeg: 47.397742,
      longitudeDeg: 8.545594,
      time: new Date("2024-06-21T12:00:00.000Z"),
    });
    const night = resolveSvsAtmosphere({
      latitudeDeg: 47.397742,
      longitudeDeg: 8.545594,
      time: new Date("2024-12-21T00:00:00.000Z"),
    });

    expect(day.night).toBe(false);
    expect((day.light.position as [number, number, number])[1]).toBeCloseTo(day.sun.azimuthDeg, 6);
    expect((day.light.position as [number, number, number])[2]).toBeCloseTo(90 - day.sun.elevationDeg, 6);
    expect(day.light.intensity as number).toBeGreaterThan(0.5);

    expect(night.night).toBe(true);
    expect(night.light.position).toEqual([1.15, 0, 0]);
    expect(night.light.intensity).toBe(0.12);
    expect(night.sky["sky-color"]).toBe("#050917");
  });
});
