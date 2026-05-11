import type { SimGeoPoint } from "./types";

const METERS_PER_DEG_LAT = 111_320;

export function metersPerDegLon(latitudeDeg: number) {
  return METERS_PER_DEG_LAT * Math.cos((latitudeDeg * Math.PI) / 180);
}

export function offsetMeters(origin: SimGeoPoint, position: SimGeoPoint) {
  return {
    east_m: (position.longitude_deg - origin.longitude_deg) * metersPerDegLon(origin.latitude_deg),
    north_m: (position.latitude_deg - origin.latitude_deg) * METERS_PER_DEG_LAT,
  };
}

export function translatePosition(position: SimGeoPoint, northM: number, eastM: number): SimGeoPoint {
  return {
    latitude_deg: position.latitude_deg + northM / METERS_PER_DEG_LAT,
    longitude_deg: position.longitude_deg + eastM / metersPerDegLon(position.latitude_deg),
  };
}

export function horizontalDistanceM(from: SimGeoPoint, to: SimGeoPoint) {
  const offset = offsetMeters(from, to);
  return Math.hypot(offset.east_m, offset.north_m);
}

export function headingToTargetDeg(from: SimGeoPoint, to: SimGeoPoint) {
  const offset = offsetMeters(from, to);
  const heading = (Math.atan2(offset.east_m, offset.north_m) * 180) / Math.PI;
  return (heading + 360) % 360;
}
