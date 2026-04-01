import { describe, expect, it } from "vitest";

import {
  estimateSurveyFlightTime,
  FOOTPRINT_LOD_THRESHOLD,
  formatSurveyStats,
  shouldUseSwathLod,
  surveyFootprints,
  surveyPhotocenters,
  surveySwathBands,
  surveyTransectsToGeoJson,
  type FormattedSurveyStats,
} from "./survey-preview";
import type { GeoPoint2d, MissionItem } from "./mavkit-types";
import { defaultGeoPoint3d } from "./mavkit-types";
import { latLonToLocalXY, localXYToLatLon, type GeoRef } from "./mission-coordinates";
import type { StructureScanStats } from "./structure-scan";
import type { SurveyStats, SurveyTransect } from "./survey-grid";

const TEST_REF: GeoRef = {
  latitude_deg: 47.38,
  longitude_deg: 8.54,
};

type LocalPoint = { x: number; y: number };

function pointFromOffset(x: number, y: number, ref: GeoRef = TEST_REF): GeoPoint2d {
  const { lat, lon } = localXYToLatLon(ref, x, y);
  return {
    latitude_deg: lat,
    longitude_deg: lon,
  };
}

function transectFromOffsets(offsets: LocalPoint[]): SurveyTransect {
  return offsets.map(({ x, y }) => pointFromOffset(x, y));
}

function polygonArea(points: LocalPoint[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const nextIndex = (index + 1) % points.length;
    area += points[index].x * points[nextIndex].y;
    area -= points[nextIndex].x * points[index].y;
  }
  return Math.abs(area / 2);
}

function ringToLocalPoints(
  ring: Array<[number, number]>,
  ref: GeoRef,
): LocalPoint[] {
  return ring.map(([longitude_deg, latitude_deg]) => {
    const { x_m, y_m } = latLonToLocalXY(ref, latitude_deg, longitude_deg);
    return { x: x_m, y: y_m };
  });
}

function bandWidth(points: LocalPoint[]): number {
  const xs = points.map((point) => point.x);
  return Math.max(...xs) - Math.min(...xs);
}

function navWaypoint(point: GeoPoint2d): MissionItem {
  return {
    command: {
      Nav: {
        Waypoint: {
          position: defaultGeoPoint3d(point.latitude_deg, point.longitude_deg, 100),
          hold_time_s: 0,
          acceptance_radius_m: 1,
          pass_radius_m: 0,
          yaw_deg: 0,
        },
      },
    },
    current: false,
    autocontinue: true,
  };
}

describe("surveyPhotocenters", () => {
  it("samples photo centers at trigger-distance intervals along each transect", () => {
    const transects = [
      transectFromOffsets([
        { x: 0, y: 0 },
        { x: 0, y: 100 },
      ]),
      transectFromOffsets([
        { x: 25, y: 0 },
        { x: 25, y: 10 },
      ]),
    ];

    const centers = surveyPhotocenters(transects, 30);

    expect(centers).toHaveLength(2);
    expect(centers[0]).toHaveLength(4);
    expect(centers[1]).toHaveLength(1);

    const firstTransectLocalY = centers[0].map((point) =>
      latLonToLocalXY(TEST_REF, point.latitude_deg, point.longitude_deg).y_m,
    );
    expect(firstTransectLocalY).toEqual(
      firstTransectLocalY.map((value) => expect.closeTo(value, 6)),
    );
    expect(firstTransectLocalY[0]).toBeCloseTo(0, 6);
    expect(firstTransectLocalY[1]).toBeCloseTo(30, 6);
    expect(firstTransectLocalY[2]).toBeCloseTo(60, 6);
    expect(firstTransectLocalY[3]).toBeCloseTo(90, 6);
  });

  it("returns empty outputs for malformed or degenerate sampling inputs", () => {
    expect(surveyPhotocenters([], 30)).toEqual([]);
    expect(
      surveyPhotocenters(
        [
          transectFromOffsets([
            { x: 0, y: 0 },
            { x: 0, y: 100 },
          ]),
        ],
        0,
      ),
    ).toEqual([]);
    expect(
      surveyPhotocenters(
        [
          transectFromOffsets([
            { x: 0, y: 0 },
            { x: 0, y: 0 },
          ]),
        ],
        30,
      ),
    ).toEqual([[]]);
    expect(
      surveyPhotocenters(
        [
          transectFromOffsets([
            { x: 0, y: 0 },
          ]),
        ],
        30,
      ),
    ).toEqual([[]]);
  });
});

describe("surveyFootprints", () => {
  it("builds closed footprint polygons centered on each photocenter with the expected area", () => {
    const photoCenter = pointFromOffset(100, 200);
    const features = surveyFootprints(
      [[photoCenter]],
      {
        width_m: 40,
        height_m: 60,
      },
      30,
    );

    expect(features).toHaveLength(1);
    const ring = features[0].geometry.coordinates[0];
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);

    const localRing = ringToLocalPoints(ring.slice(0, -1) as Array<[number, number]>, photoCenter);
    const centerX = localRing.reduce((sum, point) => sum + point.x, 0) / localRing.length;
    const centerY = localRing.reduce((sum, point) => sum + point.y, 0) / localRing.length;
    expect(centerX).toBeCloseTo(0, 6);
    expect(centerY).toBeCloseTo(0, 6);
    expect(polygonArea(localRing)).toBeCloseTo(40 * 60, 3);
  });
});

describe("surveySwathBands", () => {
  it("returns one swath band per transect with width close to lane spacing", () => {
    const transects = [
      transectFromOffsets([
        { x: 0, y: 0 },
        { x: 0, y: 100 },
      ]),
      transectFromOffsets([
        { x: 25, y: 0 },
        { x: 25, y: 100 },
      ]),
    ];

    const bands = surveySwathBands(transects, 20, 0);

    expect(bands).toHaveLength(2);
    for (const band of bands) {
      const ring = ringToLocalPoints(
        band.geometry.coordinates[0] as Array<[number, number]>,
        TEST_REF,
      );
      expect(ring).toHaveLength(5);
      expect(bandWidth(ring.slice(0, -1))).toBeCloseTo(20, 3);
    }
  });
});

describe("surveyTransectsToGeoJson", () => {
  it("converts primary and crosshatch transects into tagged GeoJSON line features", () => {
    const featureCollection = surveyTransectsToGeoJson(
      [
        transectFromOffsets([
          { x: 0, y: 0 },
          { x: 0, y: 50 },
        ]),
        transectFromOffsets([
          { x: 20, y: 0 },
          { x: 20, y: 50 },
        ]),
      ],
      [
        transectFromOffsets([
          { x: 0, y: 10 },
          { x: 50, y: 10 },
        ]),
      ],
    );

    expect(featureCollection.type).toBe("FeatureCollection");
    expect(featureCollection.features).toHaveLength(3);
    expect(featureCollection.features.filter((feature) => feature.properties.kind === "primary")).toHaveLength(2);
    expect(featureCollection.features.filter((feature) => feature.properties.kind === "crosshatch")).toHaveLength(1);
    expect(featureCollection.features[0].geometry.type).toBe("LineString");
  });
});

describe("formatSurveyStats", () => {
  it("formats stats into display strings, including min:sec flight time and km² thresholding", () => {
    const baseStats: SurveyStats = {
      gsd_m: 0.02673838587357598,
      photoCount: 24,
      area_m2: 10_000,
      triggerDistance_m: 28.152969894222938,
      laneSpacing_m: 31.733116354759975,
      laneCount: 3,
      crosshatchLaneCount: 2,
    };

    const formatted = formatSurveyStats(baseStats, 125);
    expectFormattedStats(formatted, {
      gsd: "2.7 cm/px",
      photoCount: "24",
      area: "10,000 m²",
      triggerDistance: "28.2 m",
      laneSpacing: "31.7 m",
      laneCount: "3",
      crosshatchLaneCount: "2",
      flightTime: "2:05",
    });

    const km2Formatted = formatSurveyStats({ ...baseStats, area_m2: 1_500_000 }, null);
    expect(km2Formatted.area).toBe("1.50 km²");
    expect(km2Formatted.flightTime).toBe("—");
  });

  it("formats structure scan stats with layer-centric fields", () => {
    const structureStats: StructureScanStats = {
      gsd_m: 0.018,
      photoCount: 36,
      layerCount: 3,
      photosPerLayer: 12,
      layerSpacing_m: 8,
      triggerDistance_m: 14,
      estimatedFlightTime_s: 180,
    };

    const formatted = formatSurveyStats(structureStats, 185);

    expect(formatted).toEqual({
      gsd: "1.8 cm/px",
      photoCount: "36",
      area: "—",
      triggerDistance: "14.0 m",
      laneSpacing: "—",
      laneCount: "—",
      crosshatchLaneCount: "—",
      flightTime: "3:05",
      layerCount: "3",
      photosPerLayer: "12",
      layerSpacing: "8.0 m",
    });
  });
});

describe("estimateSurveyFlightTime", () => {
  it("sums waypoint-to-waypoint travel distance and divides by cruise speed", () => {
    const items: MissionItem[] = [
      navWaypoint(pointFromOffset(0, 0)),
      {
        command: {
          Do: {
            CamTriggerDistance: {
              meters: 30,
              trigger_now: true,
            },
          },
        },
        current: false,
        autocontinue: true,
      },
      navWaypoint(pointFromOffset(0, 100)),
      navWaypoint(pointFromOffset(0, 200)),
    ];

    expect(estimateSurveyFlightTime(items, 20)).toBeCloseTo(10, 3);
  });
});

describe("shouldUseSwathLod", () => {
  it("switches to swath LOD at the configured footprint threshold", () => {
    expect(shouldUseSwathLod(FOOTPRINT_LOD_THRESHOLD - 1)).toBe(false);
    expect(shouldUseSwathLod(FOOTPRINT_LOD_THRESHOLD)).toBe(true);
    expect(shouldUseSwathLod(FOOTPRINT_LOD_THRESHOLD + 1)).toBe(true);
  });
});

function expectFormattedStats(
  actual: FormattedSurveyStats,
  expected: FormattedSurveyStats,
): void {
  expect(actual).toEqual(expected);
}
