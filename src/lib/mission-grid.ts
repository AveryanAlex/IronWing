/**
 * Polygon-to-grid (lawnmower/snake) mission generator.
 *
 * Accepts polygon vertices + survey parameters and emits ordinary
 * NAV_WAYPOINT mission items.  Pure TypeScript, no React dependency.
 *
 * Algorithm:
 *   1. Project polygon vertices from lat/lon to local XY (ENU).
 *   2. Rotate polygon so the track angle aligns with the X axis.
 *   3. Sweep horizontal scanlines spaced by `lane_spacing_m`.
 *   4. Intersect each scanline with polygon edges, pair intersections
 *      into lane segments.
 *   5. Snake (alternate direction) through the segments.
 *   6. Choose the start corner closest to `start_corner` preference.
 *   7. Back-project waypoints to lat/lon, emit MissionItems.
 *
 * Limitations (v1, by design):
 *   - No island detection (inner polygons not excluded).
 *   - No camera-trigger commands, spline generation, or terrain following.
 *   - Sequence assignment is external (items start at seq 0).
 */

import type { MissionItem } from "../mission";
import {
  type GeoRef,
  latLonToLocalXY,
  localXYToLatLon,
  degToDegE7,
} from "./mission-coordinates";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A polygon vertex in decimal degrees. */
export type PolygonVertex = {
  latitude_deg: number;
  longitude_deg: number;
};

/** Which corner of the bounding box the path should start from. */
export type StartCorner =
  | "top_left"
  | "top_right"
  | "bottom_left"
  | "bottom_right";

/** Turn direction at the end of each lane. */
export type TurnDirection = "clockwise" | "counterclockwise";

/** All inputs needed to generate a grid. */
export type GridParams = {
  /** Ordered polygon vertices (minimum 3, no need to close). */
  polygon: PolygonVertex[];
  /** Altitude of generated waypoints, metres above home. */
  altitude_m: number;
  /** Distance between parallel lanes, metres. Must be > 0. */
  lane_spacing_m: number;
  /** Track angle of the lanes in degrees (0 = North, clockwise). */
  track_angle_deg: number;
  /** Which corner of the polygon bounding box to start from. */
  start_corner: StartCorner;
  /** Turn direction at lane ends. */
  turn_direction: TurnDirection;
};

/** Structured validation failure. */
export type GridValidationError = {
  code:
    | "too_few_points"
    | "zero_area"
    | "self_intersection"
    | "invalid_spacing"
    | "invalid_altitude"
    | "invalid_coordinates";
  message: string;
};

export type GridResult =
  | { ok: true; items: MissionItem[] }
  | { ok: false; errors: GridValidationError[] };

// ---------------------------------------------------------------------------
// Internal 2-D helpers
// ---------------------------------------------------------------------------

type Vec2 = { x: number; y: number };

function rotatePoint(p: Vec2, angleDeg: number): Vec2 {
  const rad = (angleDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

/** Signed area of a simple polygon (positive = CCW). */
function signedArea(pts: Vec2[]): number {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
  }
  return area / 2;
}

/**
 * Check whether any non-adjacent edges of a simple polygon intersect.
 * O(n²) — fine for the small polygons used in survey planning.
 */
function hasSelfIntersection(pts: Vec2[]): boolean {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      // Skip adjacent edge pairs (share a vertex).
      if (i === 0 && j === n - 1) continue;
      const c = pts[j];
      const d = pts[(j + 1) % n];
      if (segmentsIntersect(a, b, c, d)) return true;
    }
  }
  return false;
}

/** Proper intersection test (excludes shared endpoints). */
function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  // Collinear overlap cases
  if (d1 === 0 && onSegment(c, d, a)) return true;
  if (d2 === 0 && onSegment(c, d, b)) return true;
  if (d3 === 0 && onSegment(a, b, c)) return true;
  if (d4 === 0 && onSegment(a, b, d)) return true;

  return false;
}

function cross(o: Vec2, a: Vec2, b: Vec2): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function onSegment(p: Vec2, q: Vec2, r: Vec2): boolean {
  return (
    Math.min(p.x, q.x) <= r.x &&
    r.x <= Math.max(p.x, q.x) &&
    Math.min(p.y, q.y) <= r.y &&
    r.y <= Math.max(p.y, q.y)
  );
}

/**
 * Intersect a horizontal scanline at `y` with the polygon edges.
 * Returns sorted X coordinates of intersection points.
 */
function scanlineIntersections(poly: Vec2[], y: number): number[] {
  const xs: number[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];

    // Skip horizontal edges
    if (a.y === b.y) continue;

    // Check if scanline y is within the edge's y range (half-open interval)
    const yMin = Math.min(a.y, b.y);
    const yMax = Math.max(a.y, b.y);

    // Use half-open interval [yMin, yMax) to avoid double-counting vertices
    if (y < yMin || y >= yMax) continue;

    // Linear interpolation for X at the given Y
    const t = (y - a.y) / (b.y - a.y);
    xs.push(a.x + t * (b.x - a.x));
  }

  xs.sort((a, b) => a - b);
  return xs;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateGridParams(params: GridParams): GridValidationError[] {
  const errors: GridValidationError[] = [];

  if (params.polygon.length < 3) {
    errors.push({
      code: "too_few_points",
      message: `Polygon must have at least 3 vertices (got ${params.polygon.length}).`,
    });
  }

  // Check for invalid coordinates
  for (let i = 0; i < params.polygon.length; i++) {
    const v = params.polygon[i];
    if (
      !Number.isFinite(v.latitude_deg) ||
      !Number.isFinite(v.longitude_deg) ||
      v.latitude_deg < -90 ||
      v.latitude_deg > 90 ||
      v.longitude_deg < -180 ||
      v.longitude_deg > 180
    ) {
      errors.push({
        code: "invalid_coordinates",
        message: `Vertex ${i} has invalid coordinates (${v.latitude_deg}, ${v.longitude_deg}).`,
      });
    }
  }

  if (!Number.isFinite(params.lane_spacing_m) || params.lane_spacing_m <= 0) {
    errors.push({
      code: "invalid_spacing",
      message: `Lane spacing must be a positive number (got ${params.lane_spacing_m}).`,
    });
  }

  if (!Number.isFinite(params.altitude_m)) {
    errors.push({
      code: "invalid_altitude",
      message: `Altitude must be a finite number (got ${params.altitude_m}).`,
    });
  }

  // Skip geometric checks if we already know the polygon is malformed
  if (errors.length > 0) return errors;

  // Project to local XY for geometric checks using centroid as reference
  const ref = polygonCentroid(params.polygon);
  const localPts = params.polygon.map((v) => {
    const { x_m, y_m } = latLonToLocalXY(ref, v.latitude_deg, v.longitude_deg);
    return { x: x_m, y: y_m };
  });

  const area = Math.abs(signedArea(localPts));
  if (area < 1e-6) {
    errors.push({
      code: "zero_area",
      message: "Polygon has zero or near-zero area (collinear or duplicate points).",
    });
  }

  if (hasSelfIntersection(localPts)) {
    errors.push({
      code: "self_intersection",
      message: "Polygon edges intersect each other.",
    });
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Core generation
// ---------------------------------------------------------------------------

/**
 * Generate a lawnmower/snake grid pattern from a polygon.
 *
 * Items are returned with seq starting at 0, using `command: 16`
 * (NAV_WAYPOINT), `frame: "global_relative_alt_int"`, `autocontinue: true`.
 * External code is responsible for re-sequencing into the overall mission.
 */
export function generateGrid(params: GridParams): GridResult {
  const errors = validateGridParams(params);
  if (errors.length > 0) return { ok: false, errors };

  const ref = polygonCentroid(params.polygon);

  // 1. Project polygon to local XY
  const localPoly = params.polygon.map((v) => {
    const { x_m, y_m } = latLonToLocalXY(ref, v.latitude_deg, v.longitude_deg);
    return { x: x_m, y: y_m };
  });

  // Heading-to-rotation: track_angle is a compass heading (0=N, 90=E, CW).
  // Scanlines are horizontal (along X). To align heading h with the X axis
  // in ENU (X=East, Y=North): rotate by (90 - h) degrees.
  //   h=0  (N, +Y) → rotate 90°  → +Y maps to +X  ✓
  //   h=90 (E, +X) → rotate 0°   → +X stays +X    ✓
  const rotAngle = 90 - params.track_angle_deg;
  const rotPoly = localPoly.map((p) => rotatePoint(p, rotAngle));

  // 3. Compute bounding box in rotated space
  let minY = Infinity,
    maxY = -Infinity;
  for (const p of rotPoly) {
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  // 4. Generate scanlines
  const spacing = params.lane_spacing_m;
  // Small inset to avoid edge-case intersections exactly at polygon vertices
  const eps = spacing * 1e-6;
  const firstY = minY + spacing / 2;

  const lanes: Array<{ left: Vec2; right: Vec2 }> = [];
  for (let y = firstY; y < maxY - eps; y += spacing) {
    const xs = scanlineIntersections(rotPoly, y);
    // Pair intersections into lane segments
    for (let i = 0; i + 1 < xs.length; i += 2) {
      lanes.push({
        left: { x: xs[i], y },
        right: { x: xs[i + 1], y },
      });
    }
  }

  if (lanes.length === 0) {
    // Spacing is wider than the polygon
    return { ok: false, errors: [{
      code: "invalid_spacing",
      message: "Lane spacing is wider than the polygon — no lanes generated.",
    }] };
  }

  // 5. Snake the lanes: alternate endpoint direction per row
  const snaked: Vec2[] = [];
  // Determine initial direction based on start_corner and turn_direction
  const startRight = shouldStartRight(params.start_corner, params.turn_direction);
  const startBottom = shouldStartBottom(params.start_corner);

  // If starting from top, reverse the lane order
  const orderedLanes = startBottom ? lanes : [...lanes].reverse();

  for (let i = 0; i < orderedLanes.length; i++) {
    const lane = orderedLanes[i];
    // Alternate direction, starting from the chosen side
    const goRight = (i % 2 === 0) === startRight;
    if (goRight) {
      snaked.push(lane.left, lane.right);
    } else {
      snaked.push(lane.right, lane.left);
    }
  }

  // 6. Rotate points back to local ENU
  const localWaypoints = snaked.map((p) => rotatePoint(p, -rotAngle));

  // 7. Convert back to lat/lon and emit MissionItems
  const items: MissionItem[] = localWaypoints.map((p, i) => {
    const { lat, lon } = localXYToLatLon(ref, p.x, p.y);
    return {
      seq: i,
      command: 16,
      frame: "global_relative_alt_int" as const,
      current: i === 0,
      autocontinue: true,
      param1: 0,
      param2: 1,
      param3: 0,
      param4: 0,
      x: degToDegE7(lat),
      y: degToDegE7(lon),
      z: params.altitude_m,
    };
  });

  return { ok: true, items };
}

// ---------------------------------------------------------------------------
// Start-corner helpers
// ---------------------------------------------------------------------------

function shouldStartRight(corner: StartCorner, turn: TurnDirection): boolean {
  // "right" means first lane traversal goes left→right
  switch (corner) {
    case "bottom_left":
      return turn === "clockwise";
    case "bottom_right":
      return turn === "counterclockwise";
    case "top_left":
      return turn === "counterclockwise";
    case "top_right":
      return turn === "clockwise";
  }
}

function shouldStartBottom(corner: StartCorner): boolean {
  return corner === "bottom_left" || corner === "bottom_right";
}

// ---------------------------------------------------------------------------
// Closest-to-home corner resolution
// ---------------------------------------------------------------------------

/**
 * Pick the `StartCorner` whose bounding-box corner (in rotated scanline
 * space) is closest to `home`.  Matches Mission Planner's default behavior.
 */
export function resolveStartCorner(
  polygon: PolygonVertex[],
  home: PolygonVertex,
  trackAngleDeg: number,
): StartCorner {
  const ref = polygonCentroid(polygon);
  const rotAngle = 90 - trackAngleDeg;

  const rotPoly = polygon.map((v) => {
    const { x_m, y_m } = latLonToLocalXY(ref, v.latitude_deg, v.longitude_deg);
    return rotatePoint({ x: x_m, y: y_m }, rotAngle);
  });

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of rotPoly) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const { x_m, y_m } = latLonToLocalXY(ref, home.latitude_deg, home.longitude_deg);
  const rotHome = rotatePoint({ x: x_m, y: y_m }, rotAngle);

  const candidates: Array<{ corner: StartCorner; x: number; y: number }> = [
    { corner: "bottom_left", x: minX, y: minY },
    { corner: "bottom_right", x: maxX, y: minY },
    { corner: "top_left", x: minX, y: maxY },
    { corner: "top_right", x: maxX, y: maxY },
  ];

  let best = candidates[0];
  let bestDist = Infinity;
  for (const c of candidates) {
    const dx = c.x - rotHome.x;
    const dy = c.y - rotHome.y;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }

  return best.corner;
}

// ---------------------------------------------------------------------------
// Centroid helper
// ---------------------------------------------------------------------------

function polygonCentroid(vertices: PolygonVertex[]): GeoRef {
  let latSum = 0;
  let lonSum = 0;
  for (const v of vertices) {
    latSum += v.latitude_deg;
    lonSum += v.longitude_deg;
  }
  return {
    latitude_deg: latSum / vertices.length,
    longitude_deg: lonSum / vertices.length,
  };
}
