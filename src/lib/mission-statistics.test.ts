import { describe, expect, it } from "vitest";

import type { TypedDraftItem } from "./mission-draft-typed";
import type { HomePosition, MissionCommand, MissionItem } from "./mavkit-types";
import { defaultGeoPoint3d } from "./mavkit-types";
import { latLonFromBearingDistance } from "./mission-coordinates";
import { buildMissionRenderFeatures } from "./mission-path-render";
import {
  DEFAULT_MISSION_PLANNING_PROFILE,
  computeMissionStatistics,
} from "./mission-statistics";

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

function waypoint(index: number, lat: number, lon: number, hold_time_s = 0): TypedDraftItem {
  return makeDraftItem(index, {
    Nav: {
      Waypoint: {
        position: defaultGeoPoint3d(lat, lon, 30),
        hold_time_s,
        acceptance_radius_m: 1,
        pass_radius_m: 0,
        yaw_deg: 0,
      },
    },
  });
}

function splineWaypoint(index: number, lat: number, lon: number, hold_time_s = 0): TypedDraftItem {
  return makeDraftItem(index, {
    Nav: {
      SplineWaypoint: {
        position: defaultGeoPoint3d(lat, lon, 30),
        hold_time_s,
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
  turns = 1,
): TypedDraftItem {
  return makeDraftItem(index, {
    Nav: {
      LoiterTurns: {
        position: defaultGeoPoint3d(lat, lon, 30),
        turns,
        radius_m,
        direction: "Clockwise",
        exit_xtrack: false,
      },
    },
  });
}

function loiterTime(index: number, lat: number, lon: number, time_s: number): TypedDraftItem {
  return makeDraftItem(index, {
    Nav: {
      LoiterTime: {
        position: defaultGeoPoint3d(lat, lon, 30),
        time_s,
        direction: "Clockwise",
        exit_xtrack: false,
      },
    },
  });
}

function navDelay(index: number, seconds: number): TypedDraftItem {
  return makeDraftItem(index, {
    Nav: {
      Delay: {
        seconds,
        hour_utc: 0,
        min_utc: 0,
        sec_utc: 0,
      },
    },
  });
}

function conditionDelay(index: number, delay_s: number): TypedDraftItem {
  return makeDraftItem(index, {
    Condition: {
      Delay: {
        delay_s,
      },
    },
  });
}

function attitudeTime(index: number, time_s: number): TypedDraftItem {
  return makeDraftItem(index, {
    Nav: {
      AttitudeTime: {
        time_s,
        roll_deg: 0,
        pitch_deg: 0,
        yaw_deg: 0,
        climb_rate_mps: 0,
      },
    },
  });
}

function scriptTime(index: number, timeout_s: number): TypedDraftItem {
  return makeDraftItem(index, {
    Nav: {
      ScriptTime: {
        command: 0,
        timeout_s,
        arg1: 0,
        arg2: 0,
        arg3: 0,
        arg4: 0,
      },
    },
  });
}

function loiterUnlimited(index: number, lat: number, lon: number): TypedDraftItem {
  return makeDraftItem(index, {
    Nav: {
      LoiterUnlimited: {
        position: defaultGeoPoint3d(lat, lon, 30),
        radius_m: 50,
        direction: "Clockwise",
      },
    },
  });
}

function altitudeWait(index: number): TypedDraftItem {
  return makeDraftItem(index, {
    Nav: {
      AltitudeWait: {
        altitude_m: 100,
        descent_rate_mps: 1,
        wiggle_time_s: 3,
      },
    },
  });
}

function pauseContinue(index: number, pause: boolean): TypedDraftItem {
  return makeDraftItem(index, {
    Do: {
      PauseContinue: {
        pause,
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

describe("computeMissionStatistics", () => {
  const home: HomePosition = {
    latitude_deg: 47.3769,
    longitude_deg: 8.5417,
    altitude_m: 488,
  };

  it("returns zeroed statistics with default planning defaults for an empty mission", () => {
    const stats = computeMissionStatistics(null, []);

    expect(stats.profile).toEqual(DEFAULT_MISSION_PLANNING_PROFILE);
    expect(stats.travelDistanceM).toBe(0);
    expect(stats.orbitDistanceM).toBe(0);
    expect(stats.totalDistanceM).toBe(0);
    expect(stats.nonTravelTimeSec).toBe(0);
    expect(stats.cruiseTimeSec).toBe(0);
    expect(stats.hoverTimeSec).toBe(0);
    expect(stats.estimatedTimeSec).toBe(0);
    expect(stats.estimatedTimeMin).toBe(0);
    expect(stats.endurancePct).toBeNull();
    expect(stats.isTimeIndeterminate).toBe(false);
    expect(stats.indeterminateReasons).toEqual([]);
    expect(stats.indeterminateItemIndexes).toEqual([]);
  });

  it("computes single-leg cruise distance and time from home to waypoint", () => {
    const target = offsetPoint(home, 90, 100);

    const stats = computeMissionStatistics(home, [waypoint(0, target.lat, target.lon)]);

    expect(stats.travelDistanceM).toBeCloseTo(100, 0);
    expect(stats.orbitDistanceM).toBe(0);
    expect(stats.totalDistanceM).toBeCloseTo(100, 0);
    expect(stats.cruiseTimeSec).toBeCloseTo(100 / 15, 3);
    expect(stats.hoverTimeSec).toBe(0);
    expect(stats.nonTravelTimeSec).toBe(0);
    expect(stats.estimatedTimeSec).toBeCloseTo(100 / 15, 3);
    expect(stats.isTimeIndeterminate).toBe(false);
  });

  it("accumulates straight multi-leg cruise distance across the rendered path", () => {
    const wp1 = offsetPoint(home, 90, 100);
    const wp2 = offsetPoint({ latitude_deg: wp1.lat, longitude_deg: wp1.lon }, 0, 100);

    const stats = computeMissionStatistics(home, [
      waypoint(0, wp1.lat, wp1.lon),
      waypoint(1, wp2.lat, wp2.lon),
    ]);

    expect(stats.travelDistanceM).toBeCloseTo(200, 0);
    expect(stats.totalDistanceM).toBeCloseTo(200, 0);
    expect(stats.cruiseTimeSec).toBeCloseTo(200 / 15, 3);
  });

  it("reuses spline and arc render geometry rather than straight-line chords", () => {
    const wp1 = offsetPoint(home, 90, 100);
    const spline1 = offsetPoint(home, 60, 220);
    const arcTarget = offsetPoint(home, 45, 320);

    const items = [
      waypoint(0, wp1.lat, wp1.lon),
      splineWaypoint(1, spline1.lat, spline1.lon),
      arcWaypoint(2, arcTarget.lat, arcTarget.lon, 60, "CounterClockwise"),
    ];

    const expectedTravelDistance = buildMissionRenderFeatures(home, items).labels
      .reduce((sum, label) => sum + label.distance_m, 0);

    const stats = computeMissionStatistics(home, items);

    expect(stats.travelDistanceM).toBeCloseTo(expectedTravelDistance, 6);
    expect(stats.cruiseTimeSec).toBeCloseTo(expectedTravelDistance / 15, 6);
  });

  it("adds waypoint and spline hold times to the non-travel time budget", () => {
    const wp1 = offsetPoint(home, 90, 100);
    const spline1 = offsetPoint(home, 45, 200);

    const stats = computeMissionStatistics(home, [
      waypoint(0, wp1.lat, wp1.lon, 12),
      splineWaypoint(1, spline1.lat, spline1.lon, 8),
    ]);

    expect(stats.holdTimeSec).toBe(20);
    expect(stats.nonTravelTimeSec).toBe(20);
    expect(stats.estimatedTimeSec).toBeCloseTo((stats.cruiseTimeSec ?? 0) + 20, 6);
  });

  it("adds loiter turns orbit distance and hover-speed time", () => {
    const stats = computeMissionStatistics(home, [
      loiterTurns(0, home.latitude_deg, home.longitude_deg, 50, 2),
    ]);

    const expectedOrbitDistance = 2 * Math.PI * 50 * 2;
    const expectedHoverTime = expectedOrbitDistance / 5;

    expect(stats.travelDistanceM).toBeCloseTo(0, 6);
    expect(stats.orbitDistanceM).toBeCloseTo(expectedOrbitDistance, 6);
    expect(stats.totalDistanceM).toBeCloseTo(expectedOrbitDistance, 6);
    expect(stats.hoverTimeSec).toBeCloseTo(expectedHoverTime, 6);
    expect(stats.estimatedTimeSec).toBeCloseTo(expectedHoverTime, 6);
  });

  it("adds timed loiter, delay, attitude, and script durations to the fixed-time breakdown", () => {
    const wp1 = offsetPoint(home, 90, 100);
    const timedPoint = offsetPoint(home, 120, 150);

    const stats = computeMissionStatistics(home, [
      waypoint(0, wp1.lat, wp1.lon, 10),
      loiterTime(1, timedPoint.lat, timedPoint.lon, 30),
      conditionDelay(2, 5),
      navDelay(3, 6),
      attitudeTime(4, 7),
      scriptTime(5, 8),
    ]);

    expect(stats.holdTimeSec).toBe(10);
    expect(stats.timedLoiterSec).toBe(30);
    expect(stats.delayTimeSec).toBe(11);
    expect(stats.actionTimeSec).toBe(15);
    expect(stats.nonTravelTimeSec).toBe(66);
    expect(stats.estimatedTimeSec).toBeCloseTo((stats.cruiseTimeSec ?? 0) + 66, 6);
  });

  it("marks negative nav delays and unbounded commands as indeterminate", () => {
    const target = offsetPoint(home, 90, 100);

    const stats = computeMissionStatistics(home, [
      navDelay(0, -1),
      loiterUnlimited(1, target.lat, target.lon),
      altitudeWait(2),
      pauseContinue(3, true),
      pauseContinue(4, false),
    ]);

    expect(stats.isTimeIndeterminate).toBe(true);
    expect(stats.estimatedTimeSec).toBeNull();
    expect(stats.estimatedTimeMin).toBeNull();
    expect(stats.endurancePct).toBeNull();
    expect(stats.indeterminateReasons).toEqual(expect.arrayContaining([
      "negative_nav_delay",
      "loiter_unlimited",
      "altitude_wait",
      "pause_continue",
    ]));
    expect(stats.indeterminateItemIndexes).toEqual([0, 1, 2, 3]);
  });

  it("computes endurance percentage from the estimated mission time", () => {
    const target = offsetPoint(home, 90, 600);

    const stats = computeMissionStatistics(
      home,
      [waypoint(0, target.lat, target.lon, 60)],
      { cruiseSpeedMps: 10, enduranceBudgetMin: 8 },
    );

    expect(stats.estimatedTimeSec).toBeCloseTo(120, 6);
    expect(stats.estimatedTimeMin).toBeCloseTo(2, 6);
    expect(stats.endurancePct).toBeCloseTo(25, 6);
  });

  it("marks cruise-time estimation indeterminate when cruise speed is zero for a mission with travel", () => {
    const target = offsetPoint(home, 90, 100);

    const stats = computeMissionStatistics(home, [waypoint(0, target.lat, target.lon)], {
      cruiseSpeedMps: 0,
    });

    expect(stats.cruiseTimeSec).toBeNull();
    expect(stats.isTimeIndeterminate).toBe(true);
    expect(stats.indeterminateReasons).toContain("invalid_cruise_speed");
    expect(stats.indeterminateItemIndexes).toEqual([]);
    expect(stats.estimatedTimeSec).toBeNull();
  });

  it("marks hover-time estimation indeterminate when hover speed is invalid for orbit work", () => {
    const stats = computeMissionStatistics(home, [
      loiterTurns(0, home.latitude_deg, home.longitude_deg, 40, 1.5),
    ], {
      hoverSpeedMps: Number.NaN,
    });

    expect(stats.orbitDistanceM).toBeGreaterThan(0);
    expect(stats.hoverTimeSec).toBeNull();
    expect(stats.isTimeIndeterminate).toBe(true);
    expect(stats.indeterminateReasons).toContain("invalid_hover_speed");
    expect(stats.estimatedTimeSec).toBeNull();
  });

  it("ignores an invalid hover speed when the mission has no hover-only work", () => {
    const target = offsetPoint(home, 90, 100);

    const stats = computeMissionStatistics(home, [waypoint(0, target.lat, target.lon)], {
      hoverSpeedMps: 0,
    });

    expect(stats.orbitDistanceM).toBe(0);
    expect(stats.hoverTimeSec).toBe(0);
    expect(stats.isTimeIndeterminate).toBe(false);
    expect(stats.estimatedTimeSec).toBeCloseTo(100 / 15, 3);
  });
});
