import { describe, expect, it } from "vitest";

import type { TypedDraftItem } from "./mission-draft-typed";
import type { HomePosition, MissionCommand, MissionItem } from "./mavkit-types";
import { defaultGeoPoint3d } from "./mavkit-types";
import { bearingDistance, latLonFromBearingDistance } from "./mission-coordinates";
import { buildMissionRenderFeatures } from "./mission-path-render";

function makeMissionItem(command: MissionCommand): MissionItem {
  return {
    command,
    current: false,
    autocontinue: true,
  };
}

function makeDraftItem(index: number, command: MissionCommand): TypedDraftItem {
  return {
    uiId: index + 1,
    index,
    document: makeMissionItem(command),
    readOnly: false,
    preview: {
      latitude_deg: null,
      longitude_deg: null,
      altitude_m: null,
    },
  };
}

function waypoint(index: number, lat: number, lon: number): TypedDraftItem {
  return makeDraftItem(index, {
    Nav: {
      Waypoint: {
        position: defaultGeoPoint3d(lat, lon, 30),
        hold_time_s: 0,
        acceptance_radius_m: 1,
        pass_radius_m: 0,
        yaw_deg: 0,
      },
    },
  });
}

function splineWaypoint(index: number, lat: number, lon: number): TypedDraftItem {
  return makeDraftItem(index, {
    Nav: {
      SplineWaypoint: {
        position: defaultGeoPoint3d(lat, lon, 30),
        hold_time_s: 0,
      },
    },
  });
}

function arcWaypoint(
  index: number,
  lat: number,
  lon: number,
  arc_angle_deg: number,
  direction: "Clockwise" | "CounterClockwise",
): TypedDraftItem {
  return makeDraftItem(index, {
    Nav: {
      ArcWaypoint: {
        position: defaultGeoPoint3d(lat, lon, 30),
        arc_angle_deg,
        direction,
      },
    },
  });
}

function loiterTurns(
  index: number,
  lat: number,
  lon: number,
  radius_m: number,
  direction: "Clockwise" | "CounterClockwise" = "Clockwise",
): TypedDraftItem {
  return makeDraftItem(index, {
    Nav: {
      LoiterTurns: {
        position: defaultGeoPoint3d(lat, lon, 30),
        turns: 1,
        radius_m,
        direction,
        exit_xtrack: false,
      },
    },
  });
}

function loiterTime(
  index: number,
  lat: number,
  lon: number,
  direction: "Clockwise" | "CounterClockwise" = "Clockwise",
): TypedDraftItem {
  return makeDraftItem(index, {
    Nav: {
      LoiterTime: {
        position: defaultGeoPoint3d(lat, lon, 30),
        time_s: 30,
        direction,
        exit_xtrack: false,
      },
    },
  });
}

function landStart(index: number, lat: number, lon: number): TypedDraftItem {
  return makeDraftItem(index, {
    Do: {
      LandStart: {
        position: defaultGeoPoint3d(lat, lon, 30),
      },
    },
  });
}

function offsetPoint(
  reference: Pick<HomePosition, "latitude_deg" | "longitude_deg">,
  bearing_deg: number,
  distance_m: number,
): { lat: number; lon: number } {
  return latLonFromBearingDistance(reference, bearing_deg, distance_m);
}

function expectCoordinate(
  coordinate: [number, number],
  lat: number,
  lon: number,
  precision = 6,
): void {
  expect(coordinate[0]).toBeCloseTo(lon, precision);
  expect(coordinate[1]).toBeCloseTo(lat, precision);
}

describe("buildMissionRenderFeatures", () => {
  const home: HomePosition = {
    latitude_deg: 47.3769,
    longitude_deg: 8.5417,
    altitude_m: 488,
  };

  it("returns empty features for an empty mission", () => {
    expect(buildMissionRenderFeatures(null, [])).toEqual({
      legs: [],
      loiterCircles: [],
      labels: [],
      landingStartIndex: null,
    });
  });

  it("builds one straight leg and one label for home plus a waypoint", () => {
    const target = offsetPoint(home, 90, 100);
    const features = buildMissionRenderFeatures(home, [waypoint(0, target.lat, target.lon)]);

    expect(features.landingStartIndex).toBeNull();
    expect(features.legs).toHaveLength(1);
    expect(features.labels).toHaveLength(1);
    expect(features.loiterCircles).toHaveLength(0);

    const leg = features.legs[0]!;
    expect(leg.kind).toBe("straight");
    expect(leg.isSpline).toBe(false);
    expect(leg.isArc).toBe(false);
    expect(leg.coordinates).toHaveLength(2);
    expectCoordinate(leg.coordinates[0]!, home.latitude_deg, home.longitude_deg);
    expectCoordinate(leg.coordinates[1]!, target.lat, target.lon);

    expect(features.labels[0]).toMatchObject({
      distanceText: "100 m",
      bearingText: "090°",
      text: "100 m • 090°",
    });
  });

  it("samples smooth spline legs for spline waypoint runs", () => {
    const wp1 = offsetPoint(home, 90, 100);
    const spline1 = offsetPoint(home, 60, 220);
    const spline2 = offsetPoint(home, 35, 340);
    const wp2 = offsetPoint(home, 90, 420);

    const features = buildMissionRenderFeatures(home, [
      waypoint(0, wp1.lat, wp1.lon),
      splineWaypoint(1, spline1.lat, spline1.lon),
      splineWaypoint(2, spline2.lat, spline2.lon),
      waypoint(3, wp2.lat, wp2.lon),
    ]);

    expect(features.legs).toHaveLength(4);
    expect(features.legs[0]!.kind).toBe("straight");

    for (const leg of features.legs.slice(1)) {
      expect(leg.kind).toBe("spline");
      expect(leg.isSpline).toBe(true);
      expect(leg.coordinates.length).toBeGreaterThan(2);
    }

    expectCoordinate(features.legs[1]!.coordinates[0]!, wp1.lat, wp1.lon);
    const finalSplineLeg = features.legs[features.legs.length - 1]!;
    expectCoordinate(
      finalSplineLeg.coordinates[finalSplineLeg.coordinates.length - 1]!,
      wp2.lat,
      wp2.lon,
    );
  });

  it("samples quarter-circle arc legs from ArcWaypoint geometry", () => {
    const center = { latitude_deg: home.latitude_deg, longitude_deg: home.longitude_deg };
    const start = offsetPoint(center, 0, 100);
    const end = offsetPoint(center, 90, 100);

    const features = buildMissionRenderFeatures(home, [
      waypoint(0, start.lat, start.lon),
      arcWaypoint(1, end.lat, end.lon, 90, "Clockwise"),
    ]);

    const arcLeg = features.legs[1]!;
    expect(arcLeg.kind).toBe("arc");
    expect(arcLeg.isArc).toBe(true);
    expect(arcLeg.coordinates.length).toBeGreaterThan(2);
    expectCoordinate(arcLeg.coordinates[0]!, start.lat, start.lon);
    expectCoordinate(
      arcLeg.coordinates[arcLeg.coordinates.length - 1]!,
      end.lat,
      end.lon,
    );

    const sampled = [
      arcLeg.coordinates[0]!,
      arcLeg.coordinates[Math.floor(arcLeg.coordinates.length / 2)]!,
      arcLeg.coordinates[arcLeg.coordinates.length - 1]!,
    ];

    for (const coordinate of sampled) {
      const { distance_m } = bearingDistance(center, coordinate[1], coordinate[0]);
      expect(distance_m).toBeCloseTo(100, 0);
    }
  });

  it("degenerates zero-angle arc waypoints to straight legs", () => {
    const start = offsetPoint(home, 0, 100);
    const end = offsetPoint(home, 90, 100);

    const features = buildMissionRenderFeatures(home, [
      waypoint(0, start.lat, start.lon),
      arcWaypoint(1, end.lat, end.lon, 0, "Clockwise"),
    ]);

    const leg = features.legs[1]!;
    expect(leg.kind).toBe("straight");
    expect(leg.isArc).toBe(false);
    expect(leg.coordinates).toHaveLength(2);
    expectCoordinate(leg.coordinates[0]!, start.lat, start.lon);
    expectCoordinate(leg.coordinates[1]!, end.lat, end.lon);
  });

  it("builds loiter circles using the command radius", () => {
    const center = offsetPoint(home, 45, 150);
    const features = buildMissionRenderFeatures(home, [
      loiterTurns(0, center.lat, center.lon, 100, "CounterClockwise"),
    ]);

    expect(features.loiterCircles).toHaveLength(1);
    const circle = features.loiterCircles[0]!;
    expect(circle.radius_m).toBe(100);
    expect(circle.direction).toBe("CounterClockwise");
    expect(circle.usesDefaultRadius).toBe(false);
    expect(circle.coordinates[0]!.length).toBeGreaterThan(60);

    const firstVertex = circle.coordinates[0]![0]!;
    const { distance_m } = bearingDistance(
      { latitude_deg: center.lat, longitude_deg: center.lon },
      firstVertex[1],
      firstVertex[0],
    );
    expect(distance_m).toBeCloseTo(100, 0);
  });

  it("uses the default visual radius for LoiterTime", () => {
    const center = offsetPoint(home, 135, 120);
    const features = buildMissionRenderFeatures(home, [loiterTime(0, center.lat, center.lon)]);

    expect(features.loiterCircles).toHaveLength(1);
    expect(features.loiterCircles[0]).toMatchObject({
      radius_m: 30,
      usesDefaultRadius: true,
    });
  });

  it("tracks DO_LAND_START and flags landing legs", () => {
    const wp1 = offsetPoint(home, 90, 100);
    const landStartPoint = offsetPoint(home, 90, 200);
    const finalPoint = offsetPoint(home, 90, 300);

    const features = buildMissionRenderFeatures(home, [
      waypoint(0, wp1.lat, wp1.lon),
      landStart(1, landStartPoint.lat, landStartPoint.lon),
      waypoint(2, finalPoint.lat, finalPoint.lon),
    ]);

    expect(features.landingStartIndex).toBe(1);
    expect(features.legs.map((leg) => leg.isLandingLeg)).toEqual([false, true, true]);
  });

  it("formats distance and bearing labels for known straight legs", () => {
    const target = offsetPoint(home, 0, 1200);
    const features = buildMissionRenderFeatures(home, [waypoint(0, target.lat, target.lon)]);

    expect(features.labels).toHaveLength(1);
    expect(features.labels[0]).toMatchObject({
      distanceText: "1.2 km",
      bearingText: "000°",
      text: "1.2 km • 000°",
    });
  });

  it("produces the expected feature counts for a mixed mission", () => {
    const wp1 = offsetPoint(home, 90, 100);
    const spline1 = offsetPoint(home, 60, 220);
    const arcTarget = offsetPoint(home, 45, 320);
    const loiterPoint = offsetPoint(home, 90, 430);
    const landStartPoint = offsetPoint(home, 120, 520);
    const finalPoint = offsetPoint(home, 90, 620);

    const features = buildMissionRenderFeatures(home, [
      waypoint(0, wp1.lat, wp1.lon),
      splineWaypoint(1, spline1.lat, spline1.lon),
      arcWaypoint(2, arcTarget.lat, arcTarget.lon, 60, "CounterClockwise"),
      loiterTurns(3, loiterPoint.lat, loiterPoint.lon, 80),
      landStart(4, landStartPoint.lat, landStartPoint.lon),
      waypoint(5, finalPoint.lat, finalPoint.lon),
    ]);

    expect(features.legs).toHaveLength(6);
    expect(features.labels).toHaveLength(6);
    expect(features.loiterCircles).toHaveLength(1);
    expect(features.landingStartIndex).toBe(4);
    expect(features.legs.some((leg) => leg.isSpline)).toBe(true);
    expect(features.legs.some((leg) => leg.isArc)).toBe(true);
    expect(features.legs[4]!.isLandingLeg).toBe(true);
    expect(features.legs[5]!.isLandingLeg).toBe(true);
  });
});
