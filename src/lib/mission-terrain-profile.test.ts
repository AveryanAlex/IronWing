import { describe, expect, it } from "vitest";

import {
  DEFAULT_PROFILE_MAX_SPACING_M,
  TERRAIN_WARNING_NEAR_THRESHOLD_M,
  computeTerrainProfile,
  cumulativeDistances,
  densifyPath,
  flightAltitudeMsl,
} from "./mission-terrain-profile";
import type { PathPoint } from "./mission-path";

function point(
  latitude_deg: number,
  longitude_deg: number,
  altitude_m: number | null,
  frame: PathPoint["frame"],
  index: number | null,
  isHome = false,
): PathPoint {
  return {
    latitude_deg,
    longitude_deg,
    altitude_m,
    frame,
    index,
    isHome,
  };
}

describe("cumulativeDistances", () => {
  it("accumulates distance across known waypoint segments", () => {
    const points = [
      point(47, 8, 500, "msl", null, true),
      point(47 + 100 / 111_320, 8, 510, "msl", 0),
      point(47 + 200 / 111_320, 8, 520, "msl", 1),
    ];

    const distances = cumulativeDistances(points);
    expect(distances[0]).toBeCloseTo(0, 6);
    expect(distances[1]).toBeCloseTo(100, 0);
    expect(distances[2]).toBeCloseTo(200, 0);
  });
});

describe("densifyPath", () => {
  it("adds interpolated samples while preserving original waypoint anchors", () => {
    const points = [
      point(47, 8, 500, "msl", null, true),
      point(47 + 100 / 111_320, 8, 510, "msl", 0),
    ];

    const densified = densifyPath(points, 30);
    expect(densified.length).toBeGreaterThan(2);
    expect(densified[0]).toMatchObject({ isWaypoint: true, isHome: true, index: null, distance_m: 0 });
    expect(densified[densified.length - 1]).toMatchObject({ isWaypoint: true, index: 0 });

    for (let index = 1; index < densified.length; index += 1) {
      const spacing = densified[index]!.distance_m - densified[index - 1]!.distance_m;
      expect(spacing).toBeLessThanOrEqual(30.0001);
    }
  });

  it("falls back to original anchors when spacing is non-positive", () => {
    const points = [
      point(47, 8, 500, "msl", null, true),
      point(47 + 100 / 111_320, 8, 510, "msl", 0),
    ];

    expect(densifyPath(points, 0)).toHaveLength(2);
  });
});

describe("flightAltitudeMsl", () => {
  it("passes MSL altitude through unchanged", () => {
    expect(flightAltitudeMsl(point(47, 8, 520, "msl", 0), 480)).toBe(520);
  });

  it("converts relative-home altitude using the home altitude", () => {
    expect(flightAltitudeMsl(point(47, 8, 40, "rel_home", 0), 480)).toBe(520);
  });

  it("returns null for relative-home altitude when home altitude is unknown", () => {
    expect(flightAltitudeMsl(point(47, 8, 40, "rel_home", 0), null)).toBeNull();
  });

  it("converts terrain-frame altitude using the sampled terrain altitude", () => {
    expect(flightAltitudeMsl(point(47, 8, 25, "terrain", 0), 480, 510)).toBe(535);
  });

  it("returns null for terrain-frame altitude when terrain is unavailable", () => {
    expect(flightAltitudeMsl(point(47, 8, 25, "terrain", 0), 480, null)).toBeNull();
  });
});

describe("computeTerrainProfile", () => {
  it("computes clearance and warnings for below-terrain, near-terrain, safe, and no-data waypoints", () => {
    const points = [
      point(47, 8, 100, "msl", null, true),
      point(47, 8.001, 10, "rel_home", 0),
      point(47, 8.002, 5, "terrain", 1),
      point(47, 8.003, 220, "msl", 2),
      point(47, 8.004, 15, "rel_home", 3),
    ];

    const terrainSampler = (_lat: number, lon: number): number | null => {
      if (lon < 8.0005) return 95;
      if (lon < 8.0015) return 120;
      if (lon < 8.0025) return 150;
      if (lon < 8.0035) return 180;
      return null;
    };

    const result = computeTerrainProfile(points, terrainSampler, 100);

    expect(result.points.length).toBeGreaterThan(points.length);

    const waypointSamples = result.points.filter((sample) => sample.isWaypoint && !sample.isHome);
    expect(waypointSamples.map((sample) => sample.index)).toEqual([0, 1, 2, 3]);

    const belowTerrain = waypointSamples.find((sample) => sample.index === 0);
    expect(belowTerrain).toMatchObject({
      terrainMsl: 120,
      flightMsl: 110,
      warning: "below_terrain",
    });
    expect(belowTerrain?.clearance_m).toBeCloseTo(-10, 6);

    const nearTerrain = waypointSamples.find((sample) => sample.index === 1);
    expect(nearTerrain).toMatchObject({
      terrainMsl: 150,
      flightMsl: 155,
      warning: "near_terrain",
    });
    expect(nearTerrain?.clearance_m).toBeGreaterThan(0);
    expect(nearTerrain?.clearance_m).toBeLessThan(TERRAIN_WARNING_NEAR_THRESHOLD_M);

    const safe = waypointSamples.find((sample) => sample.index === 2);
    expect(safe).toMatchObject({
      terrainMsl: 180,
      flightMsl: 220,
      warning: "none",
    });
    expect(safe?.clearance_m).toBeCloseTo(40, 6);

    const noData = waypointSamples.find((sample) => sample.index === 3);
    expect(noData).toMatchObject({
      terrainMsl: null,
      flightMsl: 115,
      clearance_m: null,
      warning: "no_data",
    });

    expect(result.warningsByIndex.get(0)).toBe("below_terrain");
    expect(result.warningsByIndex.get(1)).toBe("near_terrain");
    expect(result.warningsByIndex.get(2)).toBe("none");
    expect(result.warningsByIndex.get(3)).toBe("no_data");
  });

  it("marks relative-home points with unknown home altitude as no_data instead of a false warning", () => {
    const result = computeTerrainProfile(
      [
        point(47, 8, 50, "msl", null, true),
        point(47, 8.001, 20, "rel_home", 0),
      ],
      () => 100,
      null,
    );

    const waypointSample = result.points.find((sample) => sample.index === 0 && sample.isWaypoint);
    expect(waypointSample).toMatchObject({
      terrainMsl: 100,
      flightMsl: null,
      clearance_m: null,
      warning: "no_data",
    });
    expect(result.warningsByIndex.get(0)).toBe("no_data");
  });

  it("returns an empty profile for an empty path", () => {
    expect(computeTerrainProfile([], () => 100, 500)).toEqual({
      points: [],
      warningsByIndex: new Map(),
    });
  });

  it("uses the default profile spacing for multi-point paths", () => {
    const points = [
      point(47, 8, 500, "msl", null, true),
      point(47 + 200 / 111_320, 8, 510, "msl", 0),
    ];

    const result = computeTerrainProfile(points, () => 100, 500);
    expect(result.points.length).toBeGreaterThan(densifyPath(points, DEFAULT_PROFILE_MAX_SPACING_M).length - 1);
  });

  it("applies a custom safetyMarginM so that 20 m clearance is safe at 10 m but near_terrain at 25 m", () => {
    // Terrain at 100 m MSL, flight at 120 m MSL → 20 m clearance.
    // With the default 10 m margin: clearance > 10, so "none".
    // With a 25 m margin: clearance < 25, so "near_terrain".
    const points = [
      point(47, 8, 100, "msl", null, true),
      point(47, 8.001, 120, "msl", 0),
    ];
    const terrainSampler = () => 100;

    const defaultResult = computeTerrainProfile(points, terrainSampler, null);
    const waypointDefault = defaultResult.points.find((p) => p.isWaypoint && p.index === 0);
    expect(waypointDefault?.warning).toBe("none");

    const customResult = computeTerrainProfile(points, terrainSampler, null, { safetyMarginM: 25 });
    const waypointCustom = customResult.points.find((p) => p.isWaypoint && p.index === 0);
    expect(waypointCustom?.warning).toBe("near_terrain");
  });

  it("sets interpolatedFlightMsl equal to flightMsl for straight segments", () => {
    const points = [
      point(47, 8, 100, "msl", null, true),
      point(47 + 100 / 111_320, 8, 120, "msl", 0),
    ];
    const result = computeTerrainProfile(points, () => 50, 100);

    for (const p of result.points) {
      expect(p.interpolatedFlightMsl).toBe(p.flightMsl);
    }
  });

  it("populates interpolatedFlightMsl for spline waypoints", () => {
    const points: PathPoint[] = [
      { latitude_deg: 47, longitude_deg: 8, altitude_m: 100, frame: "msl", index: null, isHome: true },
      { latitude_deg: 47.001, longitude_deg: 8.001, altitude_m: 120, frame: "msl", index: 0, isHome: false, isSpline: true },
      { latitude_deg: 47.002, longitude_deg: 8.002, altitude_m: 140, frame: "msl", index: 1, isHome: false, isSpline: true },
      { latitude_deg: 47.003, longitude_deg: 8.003, altitude_m: 160, frame: "msl", index: 2, isHome: false },
    ];
    const result = computeTerrainProfile(points, () => 50, 100);

    // Every profile point should have a non-null interpolatedFlightMsl.
    const midSegmentPoints = result.points.filter((p) => !p.isWaypoint);
    for (const p of midSegmentPoints) {
      expect(p.interpolatedFlightMsl).not.toBeNull();
    }
  });

  it("populates interpolatedFlightMsl for arc waypoints", () => {
    const points: PathPoint[] = [
      { latitude_deg: 47, longitude_deg: 8, altitude_m: 100, frame: "msl", index: null, isHome: true },
      {
        latitude_deg: 47.001, longitude_deg: 8.001, altitude_m: 130, frame: "msl", index: 0, isHome: false,
        isArc: true, arcAngleDeg: 90, arcDirection: "Clockwise",
      },
      { latitude_deg: 47.002, longitude_deg: 8.002, altitude_m: 150, frame: "msl", index: 1, isHome: false },
    ];
    const result = computeTerrainProfile(points, () => 50, 100);

    // Waypoint endpoints should have interpolatedFlightMsl equal to flightMsl.
    const wp0 = result.points.find((p) => p.isWaypoint && p.index === 0);
    expect(wp0?.interpolatedFlightMsl).toBe(wp0?.flightMsl);

    // Mid-segment points on the arc segment should also have values.
    const arcMid = result.points.filter((p) => !p.isWaypoint && !p.isHome);
    expect(arcMid.length).toBeGreaterThan(0);
    for (const p of arcMid) {
      expect(p.interpolatedFlightMsl).not.toBeNull();
    }
  });

  it("renders loiter commands as flat horizontal segments", () => {
    const points: PathPoint[] = [
      { latitude_deg: 0, longitude_deg: 0, altitude_m: 100, frame: "rel_home", index: 0, isHome: false },
      { latitude_deg: 0.001, longitude_deg: 0, altitude_m: 50, frame: "rel_home", index: 1, isHome: false, isLoiter: true, loiterRadius_m: 30 },
      { latitude_deg: 0.002, longitude_deg: 0, altitude_m: 100, frame: "rel_home", index: 2, isHome: false },
    ];
    const sampler = () => 0;
    const result = computeTerrainProfile(points, sampler, 0);
    // Find profile points belonging to the loiter (index 1)
    const loiterPoints = result.points.filter((p) => p.index === 1);
    expect(loiterPoints.length).toBeGreaterThanOrEqual(2);
    const altitudes = loiterPoints.map((p) => p.flightMsl);
    expect(new Set(altitudes).size).toBe(1);
  });
});
