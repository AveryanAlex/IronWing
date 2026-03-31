import { bearingDistance } from "./mission-coordinates";
import type { PathPoint } from "./mission-path";

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

  const warningsByIndex = new Map<number, TerrainWarning>();

  const profilePoints = densified.map<ProfilePoint>((point) => {
    const terrainMsl = terrainSampler(point.latitude_deg, point.longitude_deg);

    const flightMsl = point.isWaypoint
      ? waypointFlight[point.segmentEndIndex] ?? null
      : interpolateFlightAltitude(waypointFlight, point.segmentStartIndex, point.segmentEndIndex, point.segmentT);

    const warning = classifyWarning(terrainMsl, flightMsl, safetyMarginM);

    if (point.isWaypoint && !point.isHome && point.index !== null) {
      warningsByIndex.set(point.index, warning);
    }

    return {
      distance_m: point.distance_m,
      terrainMsl,
      flightMsl,
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
