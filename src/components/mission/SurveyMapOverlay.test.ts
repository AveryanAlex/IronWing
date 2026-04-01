import { describe, expect, it } from "vitest";

import { computeCoveragePolygon } from "./SurveyMapOverlay";
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
