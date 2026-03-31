/**
 * Haversine great-circle distance between two geodetic points.
 * Accurate to <0.5% for distances under ~1000 km at mid-latitudes.
 */

const EARTH_RADIUS_M = 6_371_000;

/** Returns the great-circle distance in metres between two lat/lon points. */
export function haversineM(
  lat1Deg: number,
  lon1Deg: number,
  lat2Deg: number,
  lon2Deg: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2Deg - lat1Deg);
  const dLon = toRad(lon2Deg - lon1Deg);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1Deg)) * Math.cos(toRad(lat2Deg)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}
