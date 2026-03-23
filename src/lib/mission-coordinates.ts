/**
 * Flat-earth local tangent plane coordinate utilities for mission planning.
 * Accurate to <0.1% for distances under ~10 km at mid-latitudes.
 */

import type { HomePosition } from "./mavkit-types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** WGS-84 mean metres per degree of latitude. */
const METERS_PER_DEG_LAT = 111_320;

// ---------------------------------------------------------------------------
// Reference point type
// ---------------------------------------------------------------------------

export type GeoRef = {
  latitude_deg: number;
  longitude_deg: number;
};

// ---------------------------------------------------------------------------
// Flat-earth local tangent plane helpers
// ---------------------------------------------------------------------------

/** metersPerDegLon = 111_320 * cos(lat) */
export function metersPerDegLon(latDeg: number): number {
  return METERS_PER_DEG_LAT * Math.cos((latDeg * Math.PI) / 180);
}

/** X = East, Y = North (ENU convention). */
export function latLonToLocalXY(
  ref: GeoRef,
  targetLatDeg: number,
  targetLonDeg: number,
): { x_m: number; y_m: number } {
  const dLat = targetLatDeg - ref.latitude_deg;
  const dLon = targetLonDeg - ref.longitude_deg;
  return {
    x_m: dLon * metersPerDegLon(ref.latitude_deg),
    y_m: dLat * METERS_PER_DEG_LAT,
  };
}

export function localXYToLatLon(
  ref: GeoRef,
  x_m: number,
  y_m: number,
): { lat: number; lon: number } {
  const mPerDegLon = metersPerDegLon(ref.latitude_deg);
  if (mPerDegLon === 0) {
    return { lat: ref.latitude_deg + y_m / METERS_PER_DEG_LAT, lon: ref.longitude_deg };
  }
  return {
    lat: ref.latitude_deg + y_m / METERS_PER_DEG_LAT,
    lon: ref.longitude_deg + x_m / mPerDegLon,
  };
}

// ---------------------------------------------------------------------------
// Bearing and distance
// ---------------------------------------------------------------------------

/** Bearing: 0=North clockwise. Uses atan2(east, north). */
export function bearingDistance(
  ref: GeoRef,
  targetLatDeg: number,
  targetLonDeg: number,
): { bearing_deg: number; distance_m: number } {
  const { x_m, y_m } = latLonToLocalXY(ref, targetLatDeg, targetLonDeg);
  const distance_m = Math.sqrt(x_m * x_m + y_m * y_m);
  let bearing_deg = (Math.atan2(x_m, y_m) * 180) / Math.PI;
  if (bearing_deg < 0) bearing_deg += 360;
  return { bearing_deg, distance_m };
}

export function latLonFromBearingDistance(
  ref: GeoRef,
  bearing_deg: number,
  distance_m: number,
): { lat: number; lon: number } {
  const bearingRad = (bearing_deg * Math.PI) / 180;
  const y_m = distance_m * Math.cos(bearingRad);
  const x_m = distance_m * Math.sin(bearingRad);
  return localXYToLatLon(ref, x_m, y_m);
}

// ---------------------------------------------------------------------------
// Offset-from-home helpers
// ---------------------------------------------------------------------------

export function offsetFromHome(
  position: { latitude_deg: number; longitude_deg: number },
  home: HomePosition | null,
): { x_m: number; y_m: number } | null {
  if (!home) return null;
  return latLonToLocalXY(home, position.latitude_deg, position.longitude_deg);
}

export function applyOffsetFromHome(
  home: HomePosition | null,
  x_m: number,
  y_m: number,
): { latitude_deg: number; longitude_deg: number } | null {
  if (!home) return null;
  const { lat, lon } = localXYToLatLon(home, x_m, y_m);
  return { latitude_deg: lat, longitude_deg: lon };
}

// ---------------------------------------------------------------------------
// Offset-from-previous-waypoint helpers
// ---------------------------------------------------------------------------

export function offsetFromPrevious(
  position: { latitude_deg: number; longitude_deg: number },
  previousPosition: { latitude_deg: number; longitude_deg: number } | null | undefined,
): { x_m: number; y_m: number } | null {
  if (!previousPosition) return null;
  const ref: GeoRef = {
    latitude_deg: previousPosition.latitude_deg,
    longitude_deg: previousPosition.longitude_deg,
  };
  return latLonToLocalXY(ref, position.latitude_deg, position.longitude_deg);
}

export function applyOffsetFromPrevious(
  previousPosition: { latitude_deg: number; longitude_deg: number } | null | undefined,
  x_m: number,
  y_m: number,
): { latitude_deg: number; longitude_deg: number } | null {
  if (!previousPosition) return null;
  const ref: GeoRef = {
    latitude_deg: previousPosition.latitude_deg,
    longitude_deg: previousPosition.longitude_deg,
  };
  const { lat, lon } = localXYToLatLon(ref, x_m, y_m);
  return { latitude_deg: lat, longitude_deg: lon };
}

// ---------------------------------------------------------------------------
// Bearing/distance from home and previous
// ---------------------------------------------------------------------------

export function bearingDistanceFromHome(
  position: { latitude_deg: number; longitude_deg: number },
  home: HomePosition | null,
): { bearing_deg: number; distance_m: number } | null {
  if (!home) return null;
  return bearingDistance(home, position.latitude_deg, position.longitude_deg);
}

export function bearingDistanceFromPrevious(
  position: { latitude_deg: number; longitude_deg: number },
  previousPosition: { latitude_deg: number; longitude_deg: number } | null | undefined,
): { bearing_deg: number; distance_m: number } | null {
  if (!previousPosition) return null;
  const ref: GeoRef = {
    latitude_deg: previousPosition.latitude_deg,
    longitude_deg: previousPosition.longitude_deg,
  };
  return bearingDistance(ref, position.latitude_deg, position.longitude_deg);
}

// ---------------------------------------------------------------------------
// Parsing and formatting guards
// ---------------------------------------------------------------------------

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export function parseLatitude(input: string | number): ParseResult<number> {
  if (typeof input === "string" && input.trim() === "") return { ok: false, error: "Invalid number" };
  const n = typeof input === "string" ? Number(input) : input;
  if (!Number.isFinite(n)) return { ok: false, error: "Invalid number" };
  if (n < -90 || n > 90) return { ok: false, error: "Latitude must be between -90 and 90" };
  return { ok: true, value: n };
}

export function parseLongitude(input: string | number): ParseResult<number> {
  if (typeof input === "string" && input.trim() === "") return { ok: false, error: "Invalid number" };
  const n = typeof input === "string" ? Number(input) : input;
  if (!Number.isFinite(n)) return { ok: false, error: "Invalid number" };
  if (n < -180 || n > 180) return { ok: false, error: "Longitude must be between -180 and 180" };
  return { ok: true, value: n };
}

export function parseDistance(input: string | number): ParseResult<number> {
  if (typeof input === "string" && input.trim() === "") return { ok: false, error: "Invalid number" };
  const n = typeof input === "string" ? Number(input) : input;
  if (!Number.isFinite(n)) return { ok: false, error: "Invalid number" };
  if (n < 0) return { ok: false, error: "Distance must be non-negative" };
  return { ok: true, value: n };
}

/** Normalizes to [0, 360). */
export function parseBearing(input: string | number): ParseResult<number> {
  if (typeof input === "string" && input.trim() === "") return { ok: false, error: "Invalid number" };
  const n = typeof input === "string" ? Number(input) : input;
  if (!Number.isFinite(n)) return { ok: false, error: "Invalid number" };
  const normalized = ((n % 360) + 360) % 360;
  return { ok: true, value: normalized };
}

export function parseOffset(input: string | number): ParseResult<number> {
  if (typeof input === "string" && input.trim() === "") return { ok: false, error: "Invalid number" };
  const n = typeof input === "string" ? Number(input) : input;
  if (!Number.isFinite(n)) return { ok: false, error: "Invalid number" };
  return { ok: true, value: n };
}

export function formatDeg(deg: number, decimals = 7): string {
  return deg.toFixed(decimals);
}

export function formatDistance(m: number, decimals = 1): string {
  return m.toFixed(decimals);
}

export function formatBearing(deg: number, decimals = 1): string {
  return deg.toFixed(decimals);
}

// ---------------------------------------------------------------------------
// Validation guards
// ---------------------------------------------------------------------------

export function isHomeValid(home: HomePosition | null): home is HomePosition {
  if (!home) return false;
  if (!Number.isFinite(home.latitude_deg) || !Number.isFinite(home.longitude_deg)) return false;
  return true;
}
