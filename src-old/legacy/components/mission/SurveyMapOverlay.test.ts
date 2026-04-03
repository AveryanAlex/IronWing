import { describe, expect, it, vi } from "vitest";

import { computeCoveragePolygon, updateSurveyOverlay } from "./SurveyMapOverlay";
import type { SurveyTransect } from "../../lib/survey-grid";

const PRIMARY_TRANSECTS: SurveyTransect[] = [
  [
    { latitude_deg: 47.397742, longitude_deg: 8.545594 },
    { latitude_deg: 47.397742, longitude_deg: 8.547194 },
  ],
  [
    { latitude_deg: 47.396642, longitude_deg: 8.545594 },
    { latitude_deg: 47.396642, longitude_deg: 8.547194 },
  ],
];

function createMapStub() {
  const polygonSource = { setData: vi.fn() };
  const transectSource = { setData: vi.fn() };
  const coverageSource = { setData: vi.fn() };
  const centerlineSource = { setData: vi.fn() };
  const orbitRingSource = { setData: vi.fn() };
  const orbitLabelSource = { setData: vi.fn() };

  const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>([
    ["survey-polygon", polygonSource],
    ["survey-transects", transectSource],
    ["survey-coverage", coverageSource],
    ["survey-centerline", centerlineSource],
    ["survey-orbit-rings", orbitRingSource],
    ["survey-orbit-labels", orbitLabelSource],
  ]);

  return {
    map: {
      getSource: (id: string) => sources.get(id),
    },
    polygonSource,
    transectSource,
    coverageSource,
    centerlineSource,
    orbitRingSource,
    orbitLabelSource,
  };
}

describe("computeCoveragePolygon", () => {
  it("returns a closed polygon ring for the buffered transect hull", () => {
    const feature = computeCoveragePolygon(PRIMARY_TRANSECTS, false, 24);

    expect(feature).not.toBeNull();
    expect(feature?.geometry.type).toBe("Polygon");

    const ring = feature?.geometry.coordinates[0] ?? [];
    expect(ring.length).toBeGreaterThanOrEqual(4);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it("returns null when there are no usable transects", () => {
    expect(computeCoveragePolygon([], false, 24)).toBeNull();
    expect(
      computeCoveragePolygon(
        [[{ latitude_deg: 47.397742, longitude_deg: 8.545594 }]],
        false,
        24,
      ),
    ).toBeNull();
  });

  it("marks crosshatch coverage in feature properties", () => {
    const primary = computeCoveragePolygon(PRIMARY_TRANSECTS, false, 24);
    const crosshatch = computeCoveragePolygon(PRIMARY_TRANSECTS, true, 24);

    expect(primary?.properties.crosshatch).toBe(false);
    expect(crosshatch?.properties.crosshatch).toBe(true);
    expect(primary?.properties.laneSpacing_m).toBe(24);
  });
});

describe("updateSurveyOverlay", () => {
  it("publishes corridor polygon, centerline, and transects to the correct sources", () => {
    const { map, polygonSource, transectSource, coverageSource, centerlineSource } = createMapStub();
    const corridorPolygon = [
      { latitude_deg: 47.3978, longitude_deg: 8.5455 },
      { latitude_deg: 47.3980, longitude_deg: 8.5460 },
      { latitude_deg: 47.3973, longitude_deg: 8.5473 },
      { latitude_deg: 47.3969, longitude_deg: 8.5468 },
      { latitude_deg: 47.3978, longitude_deg: 8.5455 },
    ];
    const centerline = [
      { latitude_deg: 47.397742, longitude_deg: 8.545594 },
      { latitude_deg: 47.397142, longitude_deg: 8.546394 },
      { latitude_deg: 47.396642, longitude_deg: 8.547194 },
    ];

    updateSurveyOverlay(map as never, {
      patternType: "corridor",
      polygon: [],
      centerline,
      corridorPolygon,
      transects: PRIMARY_TRANSECTS,
      crosshatchTransects: [],
      laneSpacing_m: 24,
    });

    expect(polygonSource.setData).toHaveBeenCalledWith({ type: "FeatureCollection", features: [] });

    const coverageGeoJson = coverageSource.setData.mock.calls[0]?.[0] as GeoJSON.FeatureCollection<GeoJSON.Polygon>;
    expect(coverageGeoJson.features).toHaveLength(1);
    expect(coverageGeoJson.features[0]?.geometry.coordinates[0]?.[0]).toEqual([8.5455, 47.3978]);

    const centerlineGeoJson = centerlineSource.setData.mock.calls[0]?.[0] as GeoJSON.FeatureCollection<GeoJSON.LineString>;
    expect(centerlineGeoJson.features).toHaveLength(1);
    expect(centerlineGeoJson.features[0]?.geometry.coordinates).toEqual(centerline.map((point) => [point.longitude_deg, point.latitude_deg]));

    const transectsGeoJson = transectSource.setData.mock.calls[0]?.[0] as GeoJSON.FeatureCollection<GeoJSON.LineString>;
    expect(transectsGeoJson.features).toHaveLength(2);
    expect(transectsGeoJson.features[0]?.properties?.kind).toBe("primary");
  });

  it("publishes structure orbit rings and altitude labels without reusing the transect layer", () => {
    const {
      map,
      transectSource,
      coverageSource,
      centerlineSource,
      orbitRingSource,
      orbitLabelSource,
    } = createMapStub();

    updateSurveyOverlay(map as never, {
      patternType: "structure",
      polygon: [
        { latitude_deg: 47.3978, longitude_deg: 8.5455 },
        { latitude_deg: 47.3980, longitude_deg: 8.5460 },
        { latitude_deg: 47.3973, longitude_deg: 8.5473 },
      ],
      transects: [],
      crosshatchTransects: [],
      laneSpacing_m: 0,
      orbitRings: [
        [
          { latitude_deg: 47.3978, longitude_deg: 8.5455 },
          { latitude_deg: 47.3980, longitude_deg: 8.5460 },
          { latitude_deg: 47.3973, longitude_deg: 8.5473 },
        ],
        [
          { latitude_deg: 47.3977, longitude_deg: 8.5456 },
          { latitude_deg: 47.3979, longitude_deg: 8.5461 },
          { latitude_deg: 47.3972, longitude_deg: 8.5472 },
        ],
      ],
      orbitLabels: [
        { point: { latitude_deg: 47.3978, longitude_deg: 8.5455 }, altitude_m: 56 },
        { point: { latitude_deg: 47.3977, longitude_deg: 8.5456 }, altitude_m: 62 },
      ],
    });

    const transectsGeoJson = transectSource.setData.mock.calls[0]?.[0] as GeoJSON.FeatureCollection<GeoJSON.LineString>;
    expect(transectsGeoJson.features).toHaveLength(0);

    const coverageGeoJson = coverageSource.setData.mock.calls[0]?.[0] as GeoJSON.FeatureCollection<GeoJSON.Polygon>;
    expect(coverageGeoJson.features).toHaveLength(0);

    const structureCenterlineGeoJson = centerlineSource.setData.mock.calls[0]?.[0] as GeoJSON.FeatureCollection<GeoJSON.LineString>;
    expect(structureCenterlineGeoJson.features).toHaveLength(0);

    const orbitRingsGeoJson = orbitRingSource.setData.mock.calls[0]?.[0] as GeoJSON.FeatureCollection<GeoJSON.LineString>;
    expect(orbitRingsGeoJson.features).toHaveLength(2);
    expect(orbitRingsGeoJson.features[0]?.geometry.coordinates[0]).toEqual([8.5455, 47.3978]);
    expect(orbitRingsGeoJson.features[0]?.geometry.coordinates[0]).toEqual(
      orbitRingsGeoJson.features[0]?.geometry.coordinates[orbitRingsGeoJson.features[0]!.geometry.coordinates.length - 1],
    );
    expect(orbitRingsGeoJson.features[0]?.properties?.opacity ?? 0).toBeGreaterThan(0);
    expect(orbitRingsGeoJson.features[0]?.properties?.color).toMatch(/^#/);

    const orbitLabelsGeoJson = orbitLabelSource.setData.mock.calls[0]?.[0] as GeoJSON.FeatureCollection<GeoJSON.Point>;
    expect(orbitLabelsGeoJson.features).toHaveLength(2);
    expect(orbitLabelsGeoJson.features[0]?.properties?.label).toBe("56 m");
    expect(orbitLabelsGeoJson.features[1]?.properties?.label).toBe("62 m");
  });
});
