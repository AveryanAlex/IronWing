import { describe, expect, it } from "vitest";

import {
  estimateSurveyWaypointCount,
  generateSurvey,
  type SurveyParams,
} from "./survey-grid";
import {
  commandPosition,
  geoPoint3dAltitude,
  geoPoint3dLatLon,
  type GeoPoint3d,
  type MissionItem,
} from "./mavkit-types";
import {
  latLonToLocalXY,
  localXYToLatLon,
  type GeoRef,
} from "./mission-coordinates";
import {
  groundSampleDistance,
  imageFootprint,
  laneSpacing,
  triggerDistance,
  type CameraSpec,
} from "./survey-camera";

const TEST_REF: GeoRef = {
  latitude_deg: 47.38,
  longitude_deg: 8.54,
};

const DJI_MAVIC_3E: CameraSpec = {
  sensorWidth_mm: 17.3,
  sensorHeight_mm: 13,
  imageWidth_px: 5280,
  imageHeight_px: 3956,
  focalLength_mm: 12.29,
  minTriggerInterval_s: 0.7,
};

type LocalPoint = { x: number; y: number };

function polygonFromOffsets(offsets: LocalPoint[]): SurveyParams["polygon"] {
  return offsets.map(({ x, y }) => {
    const { lat, lon } = localXYToLatLon(TEST_REF, x, y);
    return { latitude_deg: lat, longitude_deg: lon };
  });
}

function squarePolygon(size_m = 100): SurveyParams["polygon"] {
  return polygonFromOffsets([
    { x: 0, y: 0 },
    { x: size_m, y: 0 },
    { x: size_m, y: size_m },
    { x: 0, y: size_m },
  ]);
}

function defaultParams(overrides: Partial<SurveyParams> = {}): SurveyParams {
  return {
    polygon: squarePolygon(),
    camera: DJI_MAVIC_3E,
    orientation: "landscape",
    altitude_m: 100,
    sideOverlap_pct: 70,
    frontOverlap_pct: 80,
    trackAngle_deg: 0,
    startCorner: "bottom_left",
    turnDirection: "clockwise",
    crosshatch: false,
    turnaroundDistance_m: 0,
    terrainFollow: false,
    captureMode: "distance",
    hoverHoldTime_s: 1,
    ...overrides,
  };
}

function assertSuccess(result: Awaited<ReturnType<typeof generateSurvey>>) {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(`Expected success result, received: ${JSON.stringify(result.errors)}`);
  }
  return result;
}

function navItems(items: MissionItem[]): MissionItem[] {
  return items.filter((item) => "Nav" in item.command);
}

function doItems(items: MissionItem[]): MissionItem[] {
  return items.filter((item) => "Do" in item.command);
}

function positionOf(item: MissionItem): GeoPoint3d {
  const position = commandPosition(item.command);
  if (!position) {
    throw new Error("Expected mission item to carry a position.");
  }
  return position;
}

function latLonOf(item: MissionItem): { latitude_deg: number; longitude_deg: number } {
  return geoPoint3dLatLon(positionOf(item));
}

function localPointOf(item: MissionItem): LocalPoint {
  const { latitude_deg, longitude_deg } = latLonOf(item);
  const { x_m, y_m } = latLonToLocalXY(TEST_REF, latitude_deg, longitude_deg);
  return { x: x_m, y: y_m };
}

function pointInsidePolygonInclusive(point: LocalPoint, polygon: LocalPoint[], epsilon_m = 0.05): boolean {
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    if (distancePointToSegment(point, start, end) <= epsilon_m) {
      return true;
    }
  }

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const intersects = (a.y > point.y) !== (b.y > point.y);
    if (!intersects) {
      continue;
    }
    const xAtPointY = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (point.x < xAtPointY) {
      inside = !inside;
    }
  }

  return inside;
}

function distancePointToSegment(point: LocalPoint, start: LocalPoint, end: LocalPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const projection =
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  const clamped = Math.max(0, Math.min(1, projection));
  const closest = {
    x: start.x + dx * clamped,
    y: start.y + dy * clamped,
  };
  return Math.hypot(point.x - closest.x, point.y - closest.y);
}

function bearingOfTransect(transect: Array<{ latitude_deg: number; longitude_deg: number }>): number {
  const first = transect[0];
  const last = transect[transect.length - 1];
  const { x_m, y_m } = latLonToLocalXY(TEST_REF, last.latitude_deg, last.longitude_deg);
  const { x_m: startX, y_m: startY } = latLonToLocalXY(TEST_REF, first.latitude_deg, first.longitude_deg);
  const dx = x_m - startX;
  const dy = y_m - startY;
  let bearing = (Math.atan2(dx, dy) * 180) / Math.PI;
  if (bearing < 0) {
    bearing += 360;
  }
  return bearing;
}

function angularDifferenceDeg(a: number, b: number): number {
  const delta = Math.abs(a - b) % 360;
  return delta > 180 ? 360 - delta : delta;
}

describe("generateSurvey", () => {
  it("builds a basic camera-aware grid with expected spacing, lane count, and interior waypoints", async () => {
    const params = defaultParams();
    const result = assertSuccess(await generateSurvey(params));

    expect(result.transects.length).toBe(3);
    expect(result.crosshatchTransects).toHaveLength(0);
    expect(result.stats.laneCount).toBe(3);
    expect(result.stats.crosshatchLaneCount).toBe(0);
    expect(result.stats.photoCount).toBe(12);
    expect(result.stats.laneSpacing_m).toBeCloseTo(
      laneSpacing(DJI_MAVIC_3E, 100, 70, "landscape"),
      12,
    );
    expect(result.stats.triggerDistance_m).toBeCloseTo(
      triggerDistance(DJI_MAVIC_3E, 100, 80, "landscape"),
      12,
    );

    const localPolygon = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];

    for (const item of navItems(result.items)) {
      expect(pointInsidePolygonInclusive(localPointOf(item), localPolygon)).toBe(true);
    }
  });

  it("adds a crosshatch pass at 90° and doubles lane counts on a square field", async () => {
    const result = assertSuccess(await generateSurvey(defaultParams({ crosshatch: true })));

    expect(result.transects.length).toBe(3);
    expect(result.crosshatchTransects.length).toBe(3);
    expect(result.stats.laneCount + result.stats.crosshatchLaneCount).toBe(6);

    const primaryBearing = bearingOfTransect(result.transects[0]);
    const crossBearing = bearingOfTransect(result.crosshatchTransects[0]);
    expect(angularDifferenceDeg(primaryBearing, crossBearing)).toBeCloseTo(90, 6);
  });

  it("scopes distance triggering around each transect and leaves turnarounds trigger-off", async () => {
    const result = assertSuccess(
      await generateSurvey(defaultParams({ turnaroundDistance_m: 30 })),
    );

    expect(result.transects.length).toBeGreaterThan(0);
    expect(result.items.length).toBe(result.transects.length * 6);

    for (let transectIndex = 0; transectIndex < result.transects.length; transectIndex += 1) {
      const offset = transectIndex * 6;
      const leadIn = result.items[offset];
      const startTrigger = result.items[offset + 1];
      const runStart = result.items[offset + 2];
      const runEnd = result.items[offset + 3];
      const stopTrigger = result.items[offset + 4];
      const leadOut = result.items[offset + 5];

      expect("Nav" in leadIn.command).toBe(true);
      expect(startTrigger.command).toEqual({
        Do: {
          CamTriggerDistance: {
            meters: result.stats.triggerDistance_m,
            trigger_now: true,
          },
        },
      });
      expect("Nav" in runStart.command).toBe(true);
      expect("Nav" in runEnd.command).toBe(true);
      expect(stopTrigger.command).toEqual({
        Do: {
          CamTriggerDistance: {
            meters: 0,
            trigger_now: false,
          },
        },
      });
      expect("Nav" in leadOut.command).toBe(true);
    }
  });

  it("creates hover photo points with hold time and single-image capture commands", async () => {
    const result = assertSuccess(
      await generateSurvey(
        defaultParams({
          captureMode: "hover",
          hoverHoldTime_s: 2.5,
        }),
      ),
    );

    const navs = navItems(result.items);
    const dos = doItems(result.items);
    expect(navs.length).toBe(result.stats.photoCount);
    expect(dos).toHaveLength(result.stats.photoCount);

    for (let index = 0; index < result.items.length; index += 2) {
      const navItem = result.items[index];
      const captureItem = result.items[index + 1];
      expect("Nav" in navItem.command).toBe(true);
      expect(navItem.command).toMatchObject({
        Nav: {
          Waypoint: {
            hold_time_s: 2.5,
          },
        },
      });
      expect(captureItem.command).toEqual({
        Do: {
          ImageStartCapture: {
            instance: 0,
            interval_s: 0,
            total_images: 1,
            start_number: 0,
          },
        },
      });
    }
  });

  it("uses Terrain positions when terrain follow lookups succeed", async () => {
    const result = assertSuccess(
      await generateSurvey(
        defaultParams({
          terrainFollow: true,
          terrainLookup: async (lat, lon) => 100 + lat - lon,
        }),
      ),
    );

    for (const item of navItems(result.items)) {
      const position = positionOf(item);
      expect("Terrain" in position).toBe(true);
      expect(geoPoint3dAltitude(position)).toEqual({
        value: 100,
        frame: "terrain",
      });
    }
  });

  it("falls back to RelHome when terrain lookup returns null", async () => {
    const result = assertSuccess(
      await generateSurvey(
        defaultParams({
          terrainFollow: true,
          terrainLookup: async (_lat, lon) => (lon > 8.5405 ? null : 42),
        }),
      ),
    );

    const positions = navItems(result.items).map((item) => positionOf(item));
    expect(positions.some((position) => "Terrain" in position)).toBe(true);
    expect(positions.some((position) => "RelHome" in position)).toBe(true);
  });

  it("extends turnaround lead-in and lead-out legs by the requested distance", async () => {
    const result = assertSuccess(
      await generateSurvey(defaultParams({ turnaroundDistance_m: 30 })),
    );

    const leadIn = localPointOf(result.items[0]);
    const runStart = localPointOf(result.items[2]);
    const runEnd = localPointOf(result.items[3]);
    const leadOut = localPointOf(result.items[5]);

    expect(Math.hypot(runStart.x - leadIn.x, runStart.y - leadIn.y)).toBeCloseTo(30, 6);
    expect(Math.hypot(leadOut.x - runEnd.x, leadOut.y - runEnd.y)).toBeCloseTo(30, 6);

    expect(pointInsidePolygonInclusive(leadIn, [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ])).toBe(false);
    expect(pointInsidePolygonInclusive(leadOut, [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ])).toBe(false);
  });

  it("never marks generated items as current", async () => {
    const result = assertSuccess(await generateSurvey(defaultParams({ crosshatch: true })));
    expect(result.items.every((item) => item.current === false)).toBe(true);
  });

  it("reports GSD and estimated photo counts that match the camera math", async () => {
    const result = assertSuccess(await generateSurvey(defaultParams({ crosshatch: true })));

    expect(result.stats.gsd_m).toBeCloseTo(
      groundSampleDistance(DJI_MAVIC_3E, 100, "landscape"),
      12,
    );
    expect(result.stats.photoCount).toBe(24);
    expect(result.stats.area_m2).toBeCloseTo(10_000, 0);
  });

  it("returns an error when the polygon is too small for even one lane", async () => {
    const result = await generateSurvey(defaultParams({ polygon: squarePolygon(10) }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.code === "invalid_spacing")).toBe(true);
    }
  });

  it("treats 0% overlap as full-footprint spacing", async () => {
    const result = assertSuccess(
      await generateSurvey(
        defaultParams({
          sideOverlap_pct: 0,
          frontOverlap_pct: 0,
        }),
      ),
    );

    const footprint = imageFootprint(DJI_MAVIC_3E, 100, "landscape");
    expect(result.stats.laneSpacing_m).toBeCloseTo(footprint.width_m, 12);
    expect(result.stats.triggerDistance_m).toBeCloseTo(footprint.height_m, 12);
    expect(result.transects).toHaveLength(1);
    expect(result.stats.photoCount).toBe(1);
  });
});

describe("estimateSurveyWaypointCount", () => {
  it("matches the generated mission item count for distance capture", async () => {
    const params = defaultParams({ crosshatch: true, turnaroundDistance_m: 30 });
    const result = assertSuccess(await generateSurvey(params));
    expect(estimateSurveyWaypointCount({ ...params })).toBe(result.items.length);
  });

  it("matches the generated mission item count for hover capture", async () => {
    const params = defaultParams({ captureMode: "hover", hoverHoldTime_s: 2 });
    const result = assertSuccess(await generateSurvey(params));
    expect(estimateSurveyWaypointCount({ ...params })).toBe(result.items.length);
  });

  it("returns null for invalid survey params", () => {
    expect(
      estimateSurveyWaypointCount(defaultParams({ altitude_m: 0 })),
    ).toBeNull();
    expect(
      estimateSurveyWaypointCount(defaultParams({ sideOverlap_pct: 100 })),
    ).toBeNull();
  });
});
