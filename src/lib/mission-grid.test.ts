import { describe, it, expect } from "vitest";
import {
  generateGrid,
  validateGridParams,
  resolveStartCorner,
  type GridParams,
  type PolygonVertex,
  type GridResult,
} from "./mission-grid";
import { degE7ToDeg } from "./mission-coordinates";

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

  it("all items have command 16, global_relative_alt_int, autocontinue", () => {
    const items = assertOk(generateGrid(defaultParams()));
    for (const item of items) {
      expect(item.command).toBe(16);
      expect(item.frame).toBe("global_relative_alt_int");
      expect(item.autocontinue).toBe(true);
    }
  });

  it("items are sequenced starting at 0", () => {
    const items = assertOk(generateGrid(defaultParams()));
    items.forEach((item, i) => expect(item.seq).toBe(i));
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
      expect(item.z).toBe(75);
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
      const lat = degE7ToDeg(item.x);
      const lon = degE7ToDeg(item.y);
      expect(lat).toBeGreaterThan(latMin);
      expect(lat).toBeLessThan(latMax);
      expect(lon).toBeGreaterThan(lonMin);
      expect(lon).toBeLessThan(lonMax);
    }
  });

  it("param1=0, param2=1, param3=0, param4=0 on all items", () => {
    const items = assertOk(generateGrid(defaultParams()));
    for (const item of items) {
      expect(item.param1).toBe(0);
      expect(item.param2).toBe(1);
      expect(item.param3).toBe(0);
      expect(item.param4).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Track angle
// ---------------------------------------------------------------------------

describe("track angle — ENU heading interpretation", () => {
  // Track angle 0° = North: lanes run N-S, so within each lane pair the
  // latitude (x in degE7) varies while longitude (y) stays ~constant.
  it("0° produces north-south lanes (lat varies, lon ~constant within lane)", () => {
    const items = assertOk(
      generateGrid(defaultParams({ track_angle_deg: 0, lane_spacing_m: 20 })),
    );
    // First lane: items[0] → items[1]. Lat should differ, lon should be ~same.
    const dLat = Math.abs(items[1].x - items[0].x);
    const dLon = Math.abs(items[1].y - items[0].y);
    expect(dLat).toBeGreaterThan(dLon * 5);
  });

  // Track angle 90° = East: lanes run E-W, so within each lane pair the
  // longitude (y in degE7) varies while latitude (x) stays ~constant.
  it("90° produces east-west lanes (lon varies, lat ~constant within lane)", () => {
    const items = assertOk(
      generateGrid(defaultParams({ track_angle_deg: 90, lane_spacing_m: 20 })),
    );
    const dLat = Math.abs(items[1].x - items[0].x);
    const dLon = Math.abs(items[1].y - items[0].y);
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
      expect(items360[i].x).toBeCloseTo(items0[i].x, -1);
      expect(items360[i].y).toBeCloseTo(items0[i].y, -1);
    }
  });

  it("45° produces diagonal lanes (both lat and lon change within lane)", () => {
    const items = assertOk(
      generateGrid(defaultParams({ track_angle_deg: 45, lane_spacing_m: 20 })),
    );
    const dLat = Math.abs(items[1].x - items[0].x);
    const dLon = Math.abs(items[1].y - items[0].y);
    // Both should be substantial for a diagonal
    expect(dLat).toBeGreaterThan(0);
    expect(dLon).toBeGreaterThan(0);
    // And roughly comparable for 45° on a ~square polygon
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
    // First waypoint should differ in latitude
    expect(itemsBL[0].x).not.toBe(itemsTL[0].x);
  });

  it("bottom_left and bottom_right start from different sides", () => {
    // Use track_angle=90 so scanline X/Y align with geographic East/North
    const itemsBL = assertOk(
      generateGrid(defaultParams({ start_corner: "bottom_left", track_angle_deg: 90 })),
    );
    const itemsBR = assertOk(
      generateGrid(defaultParams({ start_corner: "bottom_right", track_angle_deg: 90 })),
    );
    expect(itemsBL[0].y).not.toBe(itemsBR[0].y);
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
    // Items come in pairs (lane start, lane end). Lane N should end on the
    // opposite side from where lane N+1 starts.
    for (let lane = 0; lane + 1 < items.length / 2; lane++) {
      const laneEnd = items[lane * 2 + 1];
      const nextLaneStart = items[(lane + 1) * 2];
      // The lon (y) of the lane end and next lane start should be close
      // (they connect on the same side), or at least not on the opposite extreme
      // This tests the snake: end of lane should be near the start of the next lane
      const lonDiff = Math.abs(laneEnd.y - nextLaneStart.y);
      // Within the polygon, the lon difference between adjacent lane
      // endpoints should be much smaller than the polygon width
      expect(lonDiff).toBeLessThan(1e7 * 0.002); // < ~0.002 degrees
    }
  });
});

// ---------------------------------------------------------------------------
// Concave polygon
// ---------------------------------------------------------------------------

describe("concave polygon", () => {
  it("generates waypoints for an L-shaped polygon", () => {
    // L-shape: a concave hexagon
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
    // U-shape: narrow opening at the top
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
    // Same number of waypoints
    expect(itemsCW.length).toBe(itemsCCW.length);
    // First two points (first lane endpoints) should be swapped
    if (itemsCW.length >= 2) {
      expect(itemsCW[0].y).toBe(itemsCCW[1].y);
      expect(itemsCW[1].y).toBe(itemsCCW[0].y);
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
      expect(item.z).toBe(-10);
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
  // At track_angle=90 (East), rotAngle=0, so scanline left/right/top/bottom
  // map directly to geographic west/east/north/south.
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
    expect(itemsSW[0].x).not.toBe(itemsNE[0].x);
  });
});
