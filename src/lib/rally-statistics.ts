import type { GeoPoint3d } from "./mavkit-types";
import { geoPoint3dLatLon } from "./mavkit-types";
import { haversineM } from "./geo-utils";

export type RallyStats = {
  pointCount: number;
  /** Maximum haversine distance from home to any rally point, or null when home is unavailable. */
  maxDistanceFromHomeM: number | null;
};

/**
 * Compute summary statistics for a rally plan.
 *
 * When home is null (vehicle has not reported a home position), distance
 * metrics cannot be computed and are returned as null.
 */
export function computeRallyStats(
  points: GeoPoint3d[],
  home: { latitude_deg: number; longitude_deg: number } | null,
): RallyStats {
  const pointCount = points.length;

  if (pointCount === 0 || home === null) {
    return { pointCount, maxDistanceFromHomeM: null };
  }

  let maxDistanceFromHomeM = 0;
  for (const point of points) {
    const { latitude_deg, longitude_deg } = geoPoint3dLatLon(point);
    const d = haversineM(home.latitude_deg, home.longitude_deg, latitude_deg, longitude_deg);
    if (d > maxDistanceFromHomeM) {
      maxDistanceFromHomeM = d;
    }
  }

  return { pointCount, maxDistanceFromHomeM };
}
