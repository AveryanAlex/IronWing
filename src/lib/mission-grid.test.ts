import { describe, it, expect } from "vitest";
import {
  generateGrid,
  validateGridParams,
  resolveStartCorner,
  estimateGridWaypointCount,
  type GridParams,
  type PolygonVertex,
  type GridResult,
} from "./mission-grid";
import {
  commandCategory,
  commandPosition,
  geoPoint3dLatLon,
  geoPoint3dAltitude,
  type MissionItem,
  type GeoPoint3d,
} from "./mavkit-types";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** ~100m square polygon near Zurich (47.38°N, 8.54°E). */
function squarePolygon(): PolygonVertex[] {
  return [
    { latitude_deg: 47.38, longitude_deg: 8.54 },
    { latitude_deg: 47.38, longitude_deg: 8.5414 },
    { latitude_deg: 47.3809, longitude_deg: 8.5414 },
    { latitude_deg: 47.3809, longitude_deg: 8.54 },
  ];
}

function defaultParams(overrides?: Partial<GridParams>): GridParams {
  return {
    polygon: squarePolygon(),
    altitude_m: 50,
    lane_spacing_m: 20,
    track_angle_deg: 0,
    start_corner: "bottom_left",
    turn_direction: "clockwise",
    ...overrides,
  };
}

function assertOk(result: GridResult) {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Expected ok result");
  return result.items;
}

function assertErr(result: GridResult) {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("Expected error result");
  return result.errors;
}

/** Extract position from a grid-generated item (always NavWaypoint). */
function itemPosition(item: MissionItem): GeoPoint3d {
  const pos = commandPosition(item.command);
  if (!pos) throw new Error("Expected command with position");
  return pos;
}

function itemLatLon(item: MissionItem): { latitude_deg: number; longitude_deg: number } {
  return geoPoint3dLatLon(itemPosition(item));
}

function itemAlt(item: MissionItem): number {
  return geoPoint3dAltitude(itemPosition(item)).value;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe("validateGridParams", () => {
  it("returns empty array for valid params", () => {
    expect(validateGridParams(defaultParams())).toEqual([]);
  });

  it("rejects polygon with fewer than 3 vertices", () => {
    const errors = validateGridParams(
      defaultParams({
        polygon: [
          { latitude_deg: 47.38, longitude_deg: 8.54 },
          { latitude_deg: 47.39, longitude_deg: 8.55 },
        ],
      }),
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].code).toBe("too_few_points");
  });

  it("rejects empty polygon", () => {
    const errors = validateGridParams(defaultParams({ polygon: [] }));
    expect(errors.some((e) => e.code === "too_few_points")).toBe(true);
  });

  it("rejects zero-area polygon (collinear points)", () => {
    const errors = validateGridParams(
      defaultParams({
        polygon: [
          { latitude_deg: 47.38, longitude_deg: 8.54 },
          { latitude_deg: 47.385, longitude_deg: 8.545 },
          { latitude_deg: 47.39, longitude_deg: 8.55 },
        ],
      }),
    );
    expect(errors.some((e) => e.code === "zero_area")).toBe(true);
  });

  it("rejects self-intersecting polygon (bowtie)", () => {
    const errors = validateGridParams(
      defaultParams({
        polygon: [
          { latitude_deg: 47.38, longitude_deg: 8.54 },
          { latitude_deg: 47.39, longitude_deg: 8.55 },
          { latitude_deg: 47.39, longitude_deg: 8.54 },
          { latitude_deg: 47.38, longitude_deg: 8.55 },
        ],
      }),
    );
    expect(errors.some((e) => e.code === "self_intersection")).toBe(true);
  });

  it("rejects zero lane spacing", () => {
    const errors = validateGridParams(defaultParams({ lane_spacing_m: 0 }));
    expect(errors.some((e) => e.code === "invalid_spacing")).toBe(true);
  });

  it("rejects negative lane spacing", () => {
    const errors = validateGridParams(defaultParams({ lane_spacing_m: -5 }));
    expect(errors.some((e) => e.code === "invalid_spacing")).toBe(true);
  });

  it("rejects NaN lane spacing", () => {
    const errors = validateGridParams(defaultParams({ lane_spacing_m: NaN }));
    expect(errors.some((e) => e.code === "invalid_spacing")).toBe(true);
  });

  it("rejects Infinity lane spacing", () => {
    const errors = validateGridParams(
      defaultParams({ lane_spacing_m: Infinity }),
    );
    expect(errors.some((e) => e.code === "invalid_spacing")).toBe(true);
  });

  it("rejects NaN altitude", () => {
    const errors = validateGridParams(defaultParams({ altitude_m: NaN }));
    expect(errors.some((e) => e.code === "invalid_altitude")).toBe(true);
  });

  it("rejects invalid coordinates (lat > 90)", () => {
    const errors = validateGridParams(
      defaultParams({
        polygon: [
          { latitude_deg: 91, longitude_deg: 8.54 },
          { latitude_deg: 47.38, longitude_deg: 8.54 },
          { latitude_deg: 47.38, longitude_deg: 8.55 },
        ],
      }),
    );
    expect(errors.some((e) => e.code === "invalid_coordinates")).toBe(true);
  });

  it("rejects invalid coordinates (lon > 180)", () => {
    const errors = validateGridParams(
      defaultParams({
        polygon: [
          { latitude_deg: 47.38, longitude_deg: 181 },
          { latitude_deg: 47.38, longitude_deg: 8.54 },
          { latitude_deg: 47.39, longitude_deg: 8.54 },
        ],
      }),
    );
    expect(errors.some((e) => e.code === "invalid_coordinates")).toBe(true);
  });

  it("rejects NaN coordinates", () => {
    const errors = validateGridParams(
      defaultParams({
        polygon: [
          { latitude_deg: NaN, longitude_deg: 8.54 },
          { latitude_deg: 47.38, longitude_deg: 8.54 },
          { latitude_deg: 47.39, longitude_deg: 8.54 },
        ],
      }),
    );
    expect(errors.some((e) => e.code === "invalid_coordinates")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Grid generation — basic shape
// ---------------------------------------------------------------------------

describe("generateGrid", () => {
  it("generates waypoints for a simple square polygon", () => {
    const items = assertOk(generateGrid(defaultParams()));
    expect(items.length).toBeGreaterThan(0);
    expect(items.length % 2).toBe(0); // each lane has 2 endpoints
  });

  it("all items are Nav Waypoint commands with RelHome frame and autocontinue", () => {
    const items = assertOk(generateGrid(defaultParams()));
    for (const item of items) {
      expect(commandCategory(item.command)).toBe("nav");
      expect(item.autocontinue).toBe(true);
      const pos = itemPosition(item);
      expect("RelHome" in pos).toBe(true);
    }
  });

  it("first item has current=true, others false", () => {
    const items = assertOk(generateGrid(defaultParams()));
    expect(items[0].current).toBe(true);
    for (let i = 1; i < items.length; i++) {
      expect(items[i].current).toBe(false);
    }
  });

  it("altitude is set on all items", () => {
    const items = assertOk(generateGrid(defaultParams({ altitude_m: 75 })));
    for (const item of items) {
      expect(itemAlt(item)).toBe(75);
    }
  });

  it("all generated waypoints are inside or near the polygon bounds", () => {
    const poly = squarePolygon();
    const items = assertOk(generateGrid(defaultParams()));

    const latMin = Math.min(...poly.map((v) => v.latitude_deg)) - 0.001;
    const latMax = Math.max(...poly.map((v) => v.latitude_deg)) + 0.001;
    const lonMin = Math.min(...poly.map((v) => v.longitude_deg)) - 0.001;
    const lonMax = Math.max(...poly.map((v) => v.longitude_deg)) + 0.001;

    for (const item of items) {
      const { latitude_deg, longitude_deg } = itemLatLon(item);
      expect(latitude_deg).toBeGreaterThan(latMin);
      expect(latitude_deg).toBeLessThan(latMax);
      expect(longitude_deg).toBeGreaterThan(lonMin);
      expect(longitude_deg).toBeLessThan(lonMax);
    }
  });

  it("NavWaypoint fields have expected defaults (hold=0, acceptance=1, pass=0, yaw=0)", () => {
    const items = assertOk(generateGrid(defaultParams()));
    for (const item of items) {
      const nav = item.command as { Nav: { Waypoint: { hold_time_s: number; acceptance_radius_m: number; pass_radius_m: number; yaw_deg: number } } };
      const wp = nav.Nav.Waypoint;
      expect(wp.hold_time_s).toBe(0);
      expect(wp.acceptance_radius_m).toBe(1);
      expect(wp.pass_radius_m).toBe(0);
      expect(wp.yaw_deg).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Track angle
// ---------------------------------------------------------------------------

describe("track angle — ENU heading interpretation", () => {
  // Track angle 0° = North: lanes run N-S, so within each lane pair the
  // latitude varies while longitude stays ~constant.
  it("0° produces north-south lanes (lat varies, lon ~constant within lane)", () => {
    const items = assertOk(
      generateGrid(defaultParams({ track_angle_deg: 0, lane_spacing_m: 20 })),
    );
    const p0 = itemLatLon(items[0]);
    const p1 = itemLatLon(items[1]);
    const dLat = Math.abs(p1.latitude_deg - p0.latitude_deg);
    const dLon = Math.abs(p1.longitude_deg - p0.longitude_deg);
    expect(dLat).toBeGreaterThan(dLon * 5);
  });

  // Track angle 90° = East: lanes run E-W, so within each lane pair the
  // longitude varies while latitude stays ~constant.
  it("90° produces east-west lanes (lon varies, lat ~constant within lane)", () => {
    const items = assertOk(
      generateGrid(defaultParams({ track_angle_deg: 90, lane_spacing_m: 20 })),
    );
    const p0 = itemLatLon(items[0]);
    const p1 = itemLatLon(items[1]);
    const dLat = Math.abs(p1.latitude_deg - p0.latitude_deg);
    const dLon = Math.abs(p1.longitude_deg - p0.longitude_deg);
    expect(dLon).toBeGreaterThan(dLat * 5);
  });

  it("180° is equivalent to 0° (both produce N-S lanes, just reversed)", () => {
    const items0 = assertOk(generateGrid(defaultParams({ track_angle_deg: 0 })));
    const items180 = assertOk(
      generateGrid(defaultParams({ track_angle_deg: 180 })),
    );
    expect(items0.length).toBe(items180.length);
  });

  it("360° is equivalent to 0°", () => {
    const items0 = assertOk(generateGrid(defaultParams({ track_angle_deg: 0 })));
    const items360 = assertOk(
      generateGrid(defaultParams({ track_angle_deg: 360 })),
    );
    expect(items0.length).toBe(items360.length);
    for (let i = 0; i < items0.length; i++) {
      const p0 = itemLatLon(items0[i]);
      const p360 = itemLatLon(items360[i]);
      expect(p360.latitude_deg).toBeCloseTo(p0.latitude_deg, 5);
      expect(p360.longitude_deg).toBeCloseTo(p0.longitude_deg, 5);
    }
  });

  it("45° produces diagonal lanes (both lat and lon change within lane)", () => {
    const items = assertOk(
      generateGrid(defaultParams({ track_angle_deg: 45, lane_spacing_m: 20 })),
    );
    const p0 = itemLatLon(items[0]);
    const p1 = itemLatLon(items[1]);
    const dLat = Math.abs(p1.latitude_deg - p0.latitude_deg);
    const dLon = Math.abs(p1.longitude_deg - p0.longitude_deg);
    expect(dLat).toBeGreaterThan(0);
    expect(dLon).toBeGreaterThan(0);
    expect(dLat / dLon).toBeGreaterThan(0.3);
    expect(dLat / dLon).toBeLessThan(3);
  });
});

// ---------------------------------------------------------------------------
// Lane spacing
// ---------------------------------------------------------------------------

describe("lane spacing", () => {
  it("fewer lanes with larger spacing", () => {
    const itemsNarrow = assertOk(
      generateGrid(defaultParams({ lane_spacing_m: 10 })),
    );
    const itemsWide = assertOk(
      generateGrid(defaultParams({ lane_spacing_m: 40 })),
    );
    expect(itemsNarrow.length).toBeGreaterThan(itemsWide.length);
  });

  it("returns error when spacing exceeds polygon width", () => {
    const errors = assertErr(
      generateGrid(defaultParams({ lane_spacing_m: 10000 })),
    );
    expect(errors.some((e) => e.code === "invalid_spacing")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Start corner
// ---------------------------------------------------------------------------

describe("start corner", () => {
  it("bottom_left and top_left produce reversed lane order", () => {
    const itemsBL = assertOk(
      generateGrid(defaultParams({ start_corner: "bottom_left" })),
    );
    const itemsTL = assertOk(
      generateGrid(defaultParams({ start_corner: "top_left" })),
    );
    const pBL = itemLatLon(itemsBL[0]);
    const pTL = itemLatLon(itemsTL[0]);
    expect(pBL.latitude_deg).not.toBe(pTL.latitude_deg);
  });

  it("bottom_left and bottom_right start from different sides", () => {
    const itemsBL = assertOk(
      generateGrid(defaultParams({ start_corner: "bottom_left", track_angle_deg: 90 })),
    );
    const itemsBR = assertOk(
      generateGrid(defaultParams({ start_corner: "bottom_right", track_angle_deg: 90 })),
    );
    const pBL = itemLatLon(itemsBL[0]);
    const pBR = itemLatLon(itemsBR[0]);
    expect(pBL.longitude_deg).not.toBe(pBR.longitude_deg);
  });
});

// ---------------------------------------------------------------------------
// Snake pattern
// ---------------------------------------------------------------------------

describe("snake pattern", () => {
  it("consecutive lane endpoints alternate direction (lawnmower pattern)", () => {
    const items = assertOk(
      generateGrid(
        defaultParams({ lane_spacing_m: 15, track_angle_deg: 0 }),
      ),
    );
    for (let lane = 0; lane + 1 < items.length / 2; lane++) {
      const laneEnd = itemLatLon(items[lane * 2 + 1]);
      const nextLaneStart = itemLatLon(items[(lane + 1) * 2]);
      const lonDiff = Math.abs(laneEnd.longitude_deg - nextLaneStart.longitude_deg);
      expect(lonDiff).toBeLessThan(0.002);
    }
  });
});

// ---------------------------------------------------------------------------
// Concave polygon
// ---------------------------------------------------------------------------

describe("concave polygon", () => {
  it("generates waypoints for an L-shaped polygon", () => {
    const lPoly: PolygonVertex[] = [
      { latitude_deg: 47.38, longitude_deg: 8.54 },
      { latitude_deg: 47.38, longitude_deg: 8.542 },
      { latitude_deg: 47.381, longitude_deg: 8.542 },
      { latitude_deg: 47.381, longitude_deg: 8.541 },
      { latitude_deg: 47.382, longitude_deg: 8.541 },
      { latitude_deg: 47.382, longitude_deg: 8.54 },
    ];
    const items = assertOk(
      generateGrid(defaultParams({ polygon: lPoly, lane_spacing_m: 15 })),
    );
    expect(items.length).toBeGreaterThan(0);
  });

  it("handles a U-shaped polygon (includes the open center per ArduPilot convention)", () => {
    const uPoly: PolygonVertex[] = [
      { latitude_deg: 47.38, longitude_deg: 8.54 },
      { latitude_deg: 47.38, longitude_deg: 8.543 },
      { latitude_deg: 47.382, longitude_deg: 8.543 },
      { latitude_deg: 47.382, longitude_deg: 8.5425 },
      { latitude_deg: 47.381, longitude_deg: 8.5425 },
      { latitude_deg: 47.381, longitude_deg: 8.5405 },
      { latitude_deg: 47.382, longitude_deg: 8.5405 },
      { latitude_deg: 47.382, longitude_deg: 8.54 },
    ];
    const result = generateGrid(
      defaultParams({ polygon: uPoly, lane_spacing_m: 15 }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.items.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Turn direction
// ---------------------------------------------------------------------------

describe("turn direction", () => {
  it("clockwise and counterclockwise produce mirrored first-lane direction", () => {
    const itemsCW = assertOk(
      generateGrid(
        defaultParams({
          start_corner: "bottom_left",
          turn_direction: "clockwise",
        }),
      ),
    );
    const itemsCCW = assertOk(
      generateGrid(
        defaultParams({
          start_corner: "bottom_left",
          turn_direction: "counterclockwise",
        }),
      ),
    );
    expect(itemsCW.length).toBe(itemsCCW.length);
    if (itemsCW.length >= 2) {
      const cwP0 = itemLatLon(itemsCW[0]);
      const cwP1 = itemLatLon(itemsCW[1]);
      const ccwP0 = itemLatLon(itemsCCW[0]);
      const ccwP1 = itemLatLon(itemsCCW[1]);
      expect(cwP0.longitude_deg).toBeCloseTo(ccwP1.longitude_deg, 5);
      expect(cwP1.longitude_deg).toBeCloseTo(ccwP0.longitude_deg, 5);
    }
  });
});

// ---------------------------------------------------------------------------
// Error propagation
// ---------------------------------------------------------------------------

describe("error propagation", () => {
  it("generateGrid returns validation errors for bad input", () => {
    const errors = assertErr(
      generateGrid(defaultParams({ lane_spacing_m: -1 })),
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it("generateGrid returns error for self-intersecting polygon", () => {
    const errors = assertErr(
      generateGrid(
        defaultParams({
          polygon: [
            { latitude_deg: 47.38, longitude_deg: 8.54 },
            { latitude_deg: 47.39, longitude_deg: 8.55 },
            { latitude_deg: 47.39, longitude_deg: 8.54 },
            { latitude_deg: 47.38, longitude_deg: 8.55 },
          ],
        }),
      ),
    );
    expect(errors.some((e) => e.code === "self_intersection")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe("determinism", () => {
  it("same inputs produce identical outputs", () => {
    const params = defaultParams();
    const a = generateGrid(params);
    const b = generateGrid(params);
    expect(a).toEqual(b);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  it("generates at least one lane for a polygon just wider than lane_spacing", () => {
    const result = generateGrid(defaultParams({ lane_spacing_m: 90 }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.items.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("handles triangle polygon", () => {
    const tri: PolygonVertex[] = [
      { latitude_deg: 47.38, longitude_deg: 8.54 },
      { latitude_deg: 47.38, longitude_deg: 8.542 },
      { latitude_deg: 47.382, longitude_deg: 8.541 },
    ];
    const items = assertOk(
      generateGrid(defaultParams({ polygon: tri, lane_spacing_m: 20 })),
    );
    expect(items.length).toBeGreaterThan(0);
  });

  it("handles negative altitude (below home)", () => {
    const items = assertOk(generateGrid(defaultParams({ altitude_m: -10 })));
    for (const item of items) {
      expect(itemAlt(item)).toBe(-10);
    }
  });

  it("handles track angle > 360", () => {
    const items = assertOk(
      generateGrid(defaultParams({ track_angle_deg: 450 })),
    );
    expect(items.length).toBeGreaterThan(0);
  });

  it("handles negative track angle", () => {
    const items = assertOk(
      generateGrid(defaultParams({ track_angle_deg: -90 })),
    );
    expect(items.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// resolveStartCorner — closest-to-home preference
// ---------------------------------------------------------------------------

describe("resolveStartCorner", () => {
  const poly = squarePolygon();
  const angle = 90;

  it("picks bottom_left when home is south-west of the polygon", () => {
    const home = { latitude_deg: 47.379, longitude_deg: 8.539 };
    expect(resolveStartCorner(poly, home, angle)).toBe("bottom_left");
  });

  it("picks top_right when home is north-east of the polygon", () => {
    const home = { latitude_deg: 47.382, longitude_deg: 8.543 };
    expect(resolveStartCorner(poly, home, angle)).toBe("top_right");
  });

  it("picks bottom_right when home is south-east", () => {
    const home = { latitude_deg: 47.379, longitude_deg: 8.543 };
    expect(resolveStartCorner(poly, home, angle)).toBe("bottom_right");
  });

  it("picks top_left when home is north-west", () => {
    const home = { latitude_deg: 47.382, longitude_deg: 8.539 };
    expect(resolveStartCorner(poly, home, angle)).toBe("top_left");
  });

  it("result changes when track angle rotates the bounding box", () => {
    const home = { latitude_deg: 47.379, longitude_deg: 8.539 };
    const at0 = resolveStartCorner(poly, home, 0);
    const at90 = resolveStartCorner(poly, home, 90);
    expect(at0).not.toBe(at90);
  });

  it("closest-to-home corner actually changes the first generated waypoint", () => {
    const homeSW = { latitude_deg: 47.379, longitude_deg: 8.539 };
    const homeNE = { latitude_deg: 47.382, longitude_deg: 8.543 };
    const cornerSW = resolveStartCorner(poly, homeSW, angle);
    const cornerNE = resolveStartCorner(poly, homeNE, angle);
    expect(cornerSW).not.toBe(cornerNE);

    const itemsSW = assertOk(
      generateGrid(defaultParams({ start_corner: cornerSW, track_angle_deg: angle })),
    );
    const itemsNE = assertOk(
      generateGrid(defaultParams({ start_corner: cornerNE, track_angle_deg: angle })),
    );
    const pSW = itemLatLon(itemsSW[0]);
    const pNE = itemLatLon(itemsNE[0]);
    expect(pSW.latitude_deg).not.toBe(pNE.latitude_deg);
  });
});

// ---------------------------------------------------------------------------
// estimateGridWaypointCount
// ---------------------------------------------------------------------------

describe("estimateGridWaypointCount", () => {
  it("matches generateGrid item count for a square polygon", () => {
    const params = defaultParams();
    const result = generateGrid(params);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(estimateGridWaypointCount(params)).toBe(result.items.length);
    }
  });

  it("matches generateGrid item count for varied angles and spacings", () => {
    for (const angle of [0, 45, 90, 135]) {
      for (const spacing of [10, 25, 50]) {
        const params = defaultParams({ track_angle_deg: angle, lane_spacing_m: spacing });
        const result = generateGrid(params);
        if (result.ok) {
          expect(estimateGridWaypointCount(params)).toBe(result.items.length);
        }
      }
    }
  });

  it("returns null for invalid params", () => {
    expect(estimateGridWaypointCount(defaultParams({ lane_spacing_m: -1 }))).toBeNull();
    expect(estimateGridWaypointCount(defaultParams({ polygon: [] }))).toBeNull();
  });
});
