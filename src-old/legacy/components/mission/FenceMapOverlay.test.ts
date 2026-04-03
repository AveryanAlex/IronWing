import { describe, it, expect } from "vitest";
import { circleToPolygon, fenceRegionsToGeoJson } from "./FenceMapOverlay";
import type { FenceRegion } from "../../lib/mavkit-types";

describe("circleToPolygon", () => {
  it("generates correct vertex count (64 + 1 closing)", () => {
    const center = { latitude_deg: 47.397, longitude_deg: 8.545 };
    const polygon = circleToPolygon(center, 100);

    expect(polygon.type).toBe("Polygon");
    expect(polygon.coordinates).toHaveLength(1);
    // 64 vertices + 1 closing = 65 points in the ring
    expect(polygon.coordinates[0]).toHaveLength(65);
  });

  it("closes the ring (first === last)", () => {
    const center = { latitude_deg: 47.397, longitude_deg: 8.545 };
    const polygon = circleToPolygon(center, 200);
    const ring = polygon.coordinates[0];

    expect(ring[ring.length - 1]).toEqual(ring[0]);
  });

  it("produces coordinates within reasonable distance from center", () => {
    const center = { latitude_deg: 47.397, longitude_deg: 8.545 };
    const radiusM = 500;
    const polygon = circleToPolygon(center, radiusM);
    const ring = polygon.coordinates[0];

    const metersPerDegLat = 111320;
    const metersPerDegLon =
      111320 * Math.cos((center.latitude_deg * Math.PI) / 180);

    for (const [lon, lat] of ring) {
      const dLatM = Math.abs(lat - center.latitude_deg) * metersPerDegLat;
      const dLonM = Math.abs(lon - center.longitude_deg) * metersPerDegLon;
      const dist = Math.sqrt(dLatM * dLatM + dLonM * dLonM);
      // Allow 1% tolerance for flat-earth approximation
      expect(dist).toBeCloseTo(radiusM, -1);
    }
  });

  it("respects custom vertex count", () => {
    const center = { latitude_deg: 0, longitude_deg: 0 };
    const polygon = circleToPolygon(center, 100, 32);

    // 32 vertices + 1 closing = 33
    expect(polygon.coordinates[0]).toHaveLength(33);
  });
});

describe("fenceRegionsToGeoJson", () => {
  it("converts polygon region to GeoJSON feature with correct geometry and properties", () => {
    const regions: FenceRegion[] = [
      {
        inclusion_polygon: {
          vertices: [
            { latitude_deg: 47.0, longitude_deg: 8.0 },
            { latitude_deg: 47.1, longitude_deg: 8.0 },
            { latitude_deg: 47.1, longitude_deg: 8.1 },
          ],
          inclusion_group: 0,
        },
      },
    ];

    const fc = fenceRegionsToGeoJson(regions, null);

    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toHaveLength(1);

    const feature = fc.features[0];
    expect(feature.geometry.type).toBe("Polygon");

    // Ring should be closed (4 points: 3 vertices + closing)
    const coords = (feature.geometry as GeoJSON.Polygon).coordinates[0];
    expect(coords).toHaveLength(4);
    expect(coords[3]).toEqual(coords[0]);

    // Coordinates are [lon, lat]
    expect(coords[0]).toEqual([8.0, 47.0]);
    expect(coords[1]).toEqual([8.0, 47.1]);
    expect(coords[2]).toEqual([8.1, 47.1]);

    expect(feature.properties).toEqual({
      regionIndex: 0,
      isExclusion: false,
      isSelected: false,
      inclusionGroup: 0,
    });
  });

  it("marks selected region in properties", () => {
    const regions: FenceRegion[] = [
      {
        inclusion_polygon: {
          vertices: [
            { latitude_deg: 47.0, longitude_deg: 8.0 },
            { latitude_deg: 47.1, longitude_deg: 8.0 },
            { latitude_deg: 47.1, longitude_deg: 8.1 },
          ],
          inclusion_group: 0,
        },
      },
      {
        exclusion_polygon: {
          vertices: [
            { latitude_deg: 47.05, longitude_deg: 8.03 },
            { latitude_deg: 47.06, longitude_deg: 8.03 },
            { latitude_deg: 47.06, longitude_deg: 8.05 },
          ],
        },
      },
    ];

    const fc = fenceRegionsToGeoJson(regions, 1);

    expect(fc.features[0].properties).toHaveProperty("isSelected", false);
    expect(fc.features[1].properties).toHaveProperty("isSelected", true);
  });

  it("handles exclusion vs inclusion properties correctly", () => {
    const regions: FenceRegion[] = [
      {
        inclusion_polygon: {
          vertices: [
            { latitude_deg: 47.0, longitude_deg: 8.0 },
            { latitude_deg: 47.1, longitude_deg: 8.0 },
            { latitude_deg: 47.1, longitude_deg: 8.1 },
          ],
          inclusion_group: 2,
        },
      },
      {
        exclusion_polygon: {
          vertices: [
            { latitude_deg: 47.05, longitude_deg: 8.03 },
            { latitude_deg: 47.06, longitude_deg: 8.03 },
            { latitude_deg: 47.06, longitude_deg: 8.05 },
          ],
        },
      },
    ];

    const fc = fenceRegionsToGeoJson(regions, null);

    // Inclusion polygon
    expect(fc.features[0].properties).toHaveProperty("isExclusion", false);
    expect(fc.features[0].properties).toHaveProperty("inclusionGroup", 2);

    // Exclusion polygon
    expect(fc.features[1].properties).toHaveProperty("isExclusion", true);
    expect(fc.features[1].properties).toHaveProperty("inclusionGroup", null);
  });

  it("converts circle region to polygon feature", () => {
    const regions: FenceRegion[] = [
      {
        inclusion_circle: {
          center: { latitude_deg: 47.0, longitude_deg: 8.0 },
          radius_m: 200,
          inclusion_group: 0,
        },
      },
    ];

    const fc = fenceRegionsToGeoJson(regions, null);

    expect(fc.features).toHaveLength(1);
    const feature = fc.features[0];
    expect(feature.geometry.type).toBe("Polygon");

    // Circle approximated as 64-point polygon + closing = 65 points
    const coords = (feature.geometry as GeoJSON.Polygon).coordinates[0];
    expect(coords).toHaveLength(65);

    expect(feature.properties).toEqual({
      regionIndex: 0,
      isExclusion: false,
      isSelected: false,
      inclusionGroup: 0,
    });
  });

  it("converts exclusion circle to polygon feature with correct properties", () => {
    const regions: FenceRegion[] = [
      {
        exclusion_circle: {
          center: { latitude_deg: 47.0, longitude_deg: 8.0 },
          radius_m: 100,
        },
      },
    ];

    const fc = fenceRegionsToGeoJson(regions, 0);

    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].properties).toEqual({
      regionIndex: 0,
      isExclusion: true,
      isSelected: true,
      inclusionGroup: null,
    });
  });

  it("returns empty FeatureCollection for empty regions", () => {
    const fc = fenceRegionsToGeoJson([], null);

    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toHaveLength(0);
  });
});
