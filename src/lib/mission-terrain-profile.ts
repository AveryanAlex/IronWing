import { bearingDistance, type GeoRef } from "./mission-coordinates";
import type { PathPoint } from "./mission-path";
import { sampleArcPoints, sampleSplinePoints } from "./mission-path-interpolation";

export type TerrainWarning = "none" | "below_terrain" | "near_terrain" | "no_data";

export type DensifiedPoint = PathPoint & {
  distance_m: number;
  segmentStartIndex: number;
  segmentEndIndex: number;
  segmentT: number;
  isWaypoint: boolean;
};

export type ProfilePoint = {
  distance_m: number;
  terrainMsl: number | null;
  flightMsl: number | null;
  /** Flight MSL computed along the interpolated (spline/arc) path.
   *  Equals flightMsl for straight segments; differs when the curved path
   *  crosses different terrain (terrain-frame waypoints) or when the path
   *  geometry differs from the straight-line approximation. */
  interpolatedFlightMsl: number | null;
  clearance_m: number | null;
  warning: TerrainWarning;
  index: number | null;
  isHome: boolean;
  isWaypoint: boolean;
};

export type ProfileResult = {
  points: ProfilePoint[];
  warningsByIndex: Map<number, TerrainWarning>;
};

export const TERRAIN_WARNING_NEAR_THRESHOLD_M = 10;
export const DEFAULT_PROFILE_MAX_SPACING_M = 50;

/** Minimum flat-segment span for a loiter dwell on the terrain profile, in metres.
 *  When a loiter radius is zero or very small, this ensures the flat line is still
 *  visible on the chart. */
const LOITER_MIN_SPAN_M = 60;

/** Number of sample steps for interpolated curve geometry. */
const INTERPOLATION_STEPS = 40;

export type TerrainProfileOptions = {
  /** Safety margin in metres below which flight altitude is classified as "near_terrain". Defaults to TERRAIN_WARNING_NEAR_THRESHOLD_M. */
  safetyMarginM?: number;
};

export function cumulativeDistances(points: PathPoint[]): number[] {
  if (points.length === 0) return [];

  const distances = [0];

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const segment = bearingDistance(previous, current.latitude_deg, current.longitude_deg);
    distances.push(distances[index - 1] + segment.distance_m);
  }

  return distances;
}

export function densifyPath(points: PathPoint[], maxSpacing_m: number): DensifiedPoint[] {
  if (points.length === 0) return [];

  const distances = cumulativeDistances(points);
  const densified: DensifiedPoint[] = [
    {
      ...points[0],
      distance_m: 0,
      segmentStartIndex: 0,
      segmentEndIndex: 0,
      segmentT: 0,
      isWaypoint: true,
    },
  ];

  if (points.length === 1) return densified;

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const startDistance = distances[index - 1] ?? 0;
    const endDistance = distances[index] ?? startDistance;
    const segmentDistance = endDistance - startDistance;

    const stepCount =
      maxSpacing_m > 0 && Number.isFinite(maxSpacing_m)
        ? Math.max(1, Math.ceil(segmentDistance / maxSpacing_m))
        : 1;

    for (let step = 1; step < stepCount; step += 1) {
      const t = step / stepCount;
      densified.push({
        latitude_deg: start.latitude_deg + (end.latitude_deg - start.latitude_deg) * t,
        longitude_deg: start.longitude_deg + (end.longitude_deg - start.longitude_deg) * t,
        altitude_m: null,
        frame: null,
        index: null,
        isHome: false,
        distance_m: startDistance + segmentDistance * t,
        segmentStartIndex: index - 1,
        segmentEndIndex: index,
        segmentT: t,
        isWaypoint: false,
      });
    }

    densified.push({
      ...end,
      distance_m: endDistance,
      segmentStartIndex: index - 1,
      segmentEndIndex: index,
      segmentT: 1,
      isWaypoint: true,
    });

    // Loiter commands dwell at a fixed altitude; insert a second point at the
    // far edge of the loiter circle so the profile shows a flat horizontal
    // segment rather than a single spike.
    if (end.isLoiter) {
      const span = Math.max(LOITER_MIN_SPAN_M, (end.loiterRadius_m ?? 0) * 2);
      densified.push({
        ...end,
        distance_m: endDistance + span,
        segmentStartIndex: index - 1,
        segmentEndIndex: index,
        segmentT: 1,
        isWaypoint: true,
      });
    }
  }

  return densified;
}

export function flightAltitudeMsl(
  point: PathPoint,
  homeAltMsl: number | null,
  terrainMsl: number | null = null,
): number | null {
  if (point.altitude_m === null || point.frame === null) return null;

  if (point.frame === "msl") return point.altitude_m;
  if (point.frame === "rel_home") {
    return homeAltMsl === null ? null : homeAltMsl + point.altitude_m;
  }

  return terrainMsl === null ? null : terrainMsl + point.altitude_m;
}

export function computeTerrainProfile(
  points: PathPoint[],
  terrainSampler: (lat: number, lon: number) => number | null,
  homeAltMsl: number | null,
  options?: TerrainProfileOptions,
): ProfileResult {
  if (points.length === 0) {
    return { points: [], warningsByIndex: new Map<number, TerrainWarning>() };
  }

  const safetyMarginM = options?.safetyMarginM ?? TERRAIN_WARNING_NEAR_THRESHOLD_M;
  const densified = densifyPath(points, DEFAULT_PROFILE_MAX_SPACING_M);
  const waypointTerrain = points.map((point) => terrainSampler(point.latitude_deg, point.longitude_deg));
  const waypointFlight = points.map((point, index) =>
    flightAltitudeMsl(point, homeAltMsl, waypointTerrain[index] ?? null),
  );

  // Pre-compute curved-path GeoRef sequences per segment for spline/arc legs.
  const curvedPaths = buildCurvedPaths(points);

  const warningsByIndex = new Map<number, TerrainWarning>();

  const profilePoints = densified.map<ProfilePoint>((point) => {
    const terrainMsl = terrainSampler(point.latitude_deg, point.longitude_deg);

    const flightMsl = point.isWaypoint
      ? waypointFlight[point.segmentEndIndex] ?? null
      : interpolateFlightAltitude(waypointFlight, point.segmentStartIndex, point.segmentEndIndex, point.segmentT);

    // Compute the interpolated flight MSL along the curved path.
    const interpolatedFlightMsl = computeInterpolatedFlightMsl(
      point, curvedPaths, waypointFlight, terrainSampler, homeAltMsl, points,
    );

    // Warnings use the interpolated altitude — it represents the real flight path.
    const warningAlt = interpolatedFlightMsl ?? flightMsl;
    const curvedGeo = lookupCurvedPosition(point, curvedPaths);
    const warningTerrain = curvedGeo
      ? terrainSampler(curvedGeo.latitude_deg, curvedGeo.longitude_deg)
      : terrainMsl;
    const warning = classifyWarning(warningTerrain, warningAlt, safetyMarginM);

    if (point.isWaypoint && !point.isHome && point.index !== null) {
      warningsByIndex.set(point.index, warning);
    }

    return {
      distance_m: point.distance_m,
      terrainMsl,
      flightMsl,
      interpolatedFlightMsl,
      clearance_m: terrainMsl === null || flightMsl === null ? null : flightMsl - terrainMsl,
      warning,
      index: point.index,
      isHome: point.isHome,
      isWaypoint: point.isWaypoint,
    };
  });

  return {
    points: profilePoints,
    warningsByIndex,
  };
}

// ---------------------------------------------------------------------------
// Curved-path helpers
// ---------------------------------------------------------------------------

type CurvedPath = {
  /** Dense GeoRef samples along the curve, indexed by a uniform t in [0, 1]. */
  samples: GeoRef[];
};

/**
 * Build an array of curved-path samples, one entry per segment (index 1..N-1).
 * Segments that are straight get null.
 * A segment ending at a spline waypoint (or whose predecessor is spline) uses Catmull-Rom.
 * A segment ending at an arc waypoint uses the arc geometry.
 */
function buildCurvedPaths(points: PathPoint[]): Array<CurvedPath | null> {
  const paths: Array<CurvedPath | null> = [null]; // index 0 is unused (first waypoint)

  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];

    if (curr.isArc && curr.arcAngleDeg && curr.arcDirection) {
      const samples = sampleArcPoints(
        prev, curr, curr.arcAngleDeg, curr.arcDirection, INTERPOLATION_STEPS,
      );
      paths.push(samples ? { samples } : null);
    } else if (prev.isSpline || curr.isSpline) {
      const control0 = points[i - 2] ?? prev;
      const control3 = points[i + 1] ?? curr;
      const samples = sampleSplinePoints(control0, prev, curr, control3, INTERPOLATION_STEPS);
      paths.push({ samples });
    } else {
      paths.push(null);
    }
  }

  return paths;
}

/** Look up the GeoRef on the curved path for a densified point, or null if the segment is straight. */
function lookupCurvedPosition(
  point: DensifiedPoint,
  curvedPaths: Array<CurvedPath | null>,
): GeoRef | null {
  // segmentEndIndex corresponds to the "i" index in buildCurvedPaths.
  const curved = curvedPaths[point.segmentEndIndex];
  if (!curved) return null;

  const t = point.segmentT;
  const sampleIndex = Math.round(t * (curved.samples.length - 1));
  return curved.samples[Math.min(sampleIndex, curved.samples.length - 1)] ?? null;
}

/**
 * Compute the flight MSL along the interpolated (curved) path for a densified point.
 * For straight segments, this equals the regular flightMsl.
 * For spline/arc segments, terrain is sampled at the curved-path position, which can
 * produce a different MSL for terrain-frame waypoints.
 */
function computeInterpolatedFlightMsl(
  point: DensifiedPoint,
  curvedPaths: Array<CurvedPath | null>,
  waypointFlight: Array<number | null>,
  terrainSampler: (lat: number, lon: number) => number | null,
  homeAltMsl: number | null,
  allPoints: PathPoint[],
): number | null {
  const curved = curvedPaths[point.segmentEndIndex];
  if (!curved) {
    // Straight segment — same as flightMsl.
    return point.isWaypoint
      ? waypointFlight[point.segmentEndIndex] ?? null
      : interpolateFlightAltitude(waypointFlight, point.segmentStartIndex, point.segmentEndIndex, point.segmentT);
  }

  // For waypoints at endpoints, the position is exact — use the pre-computed value.
  if (point.isWaypoint) {
    return waypointFlight[point.segmentEndIndex] ?? null;
  }

  // For mid-segment points: the flight altitude is linearly interpolated
  // between the start and end waypoint altitudes. For MSL/rel_home frames,
  // this is identical to flightMsl. For terrain-frame waypoints, we need
  // terrain at the curved position to compute the endpoint flight MSL, then
  // interpolate.
  const startPoint = allPoints[point.segmentStartIndex];
  const endPoint = allPoints[point.segmentEndIndex];
  if (!startPoint || !endPoint) return null;

  // Check if any endpoint uses terrain frame — only then do we need to
  // re-sample terrain along the curve.
  const needsCurvedTerrain = startPoint.frame === "terrain" || endPoint.frame === "terrain";

  if (!needsCurvedTerrain) {
    // MSL/rel_home — altitude doesn't depend on ground position.
    return interpolateFlightAltitude(waypointFlight, point.segmentStartIndex, point.segmentEndIndex, point.segmentT);
  }

  // Re-compute waypoint flight altitudes using terrain at curved positions.
  const curvedGeo = lookupCurvedPosition(point, curvedPaths);
  if (!curvedGeo) return null;

  // For interpolation endpoints, sample terrain at their exact (original) positions.
  const startTerrain = terrainSampler(startPoint.latitude_deg, startPoint.longitude_deg);
  const endTerrain = terrainSampler(endPoint.latitude_deg, endPoint.longitude_deg);
  const startFlight = flightAltitudeMsl(startPoint, homeAltMsl, startTerrain);
  const endFlight = flightAltitudeMsl(endPoint, homeAltMsl, endTerrain);

  if (startFlight === null || endFlight === null) return null;
  return startFlight + (endFlight - startFlight) * point.segmentT;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function interpolateFlightAltitude(
  waypointFlight: Array<number | null>,
  startIndex: number,
  endIndex: number,
  t: number,
): number | null {
  const start = waypointFlight[startIndex] ?? null;
  const end = waypointFlight[endIndex] ?? null;

  if (start === null || end === null) return null;
  if (startIndex === endIndex) return end;

  return start + (end - start) * t;
}

function classifyWarning(
  terrainMsl: number | null,
  flightMsl: number | null,
  safetyMarginM: number,
): TerrainWarning {
  if (terrainMsl === null || flightMsl === null) return "no_data";

  const clearance_m = flightMsl - terrainMsl;
  if (clearance_m <= 0) return "below_terrain";
  if (clearance_m < safetyMarginM) return "near_terrain";
  return "none";
}
