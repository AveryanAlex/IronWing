/**
 * Shared spline/arc interpolation returning GeoRef[] sequences.
 * Used by mission-path-render.ts (map polylines) and mission-terrain-profile.ts
 * (interpolated flight-altitude series) to keep the geometry in one place.
 */

import {
  latLonToLocalXY,
  localXYToLatLon,
  type GeoRef,
} from "./mission-coordinates";

// ---------------------------------------------------------------------------
// Catmull-Rom helpers
// ---------------------------------------------------------------------------

/** Evaluate one component of a Catmull-Rom spline at parameter t in [0, 1]. */
export function catmullRomComponent(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number,
): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    2 * p1 +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

// ---------------------------------------------------------------------------
// Spline sampling
// ---------------------------------------------------------------------------

/**
 * Sample a Catmull-Rom spline segment between point1 and point2 with
 * control0 and control3 as surrounding control points.
 * Returns `steps + 1` GeoRef points, with the first snapped to point1
 * and the last snapped to point2.
 */
export function sampleSplinePoints(
  control0: GeoRef,
  point1: GeoRef,
  point2: GeoRef,
  control3: GeoRef,
  steps: number,
): GeoRef[] {
  const reference = point1;
  const p0 = latLonToLocalXY(reference, control0.latitude_deg, control0.longitude_deg);
  const p1 = latLonToLocalXY(reference, point1.latitude_deg, point1.longitude_deg);
  const p2 = latLonToLocalXY(reference, point2.latitude_deg, point2.longitude_deg);
  const p3 = latLonToLocalXY(reference, control3.latitude_deg, control3.longitude_deg);

  const points: GeoRef[] = [];
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const x_m = catmullRomComponent(p0.x_m, p1.x_m, p2.x_m, p3.x_m, t);
    const y_m = catmullRomComponent(p0.y_m, p1.y_m, p2.y_m, p3.y_m, t);
    const { lat, lon } = localXYToLatLon(reference, x_m, y_m);
    points.push({ latitude_deg: lat, longitude_deg: lon });
  }

  // Snap endpoints to avoid floating-point drift.
  points[0] = { latitude_deg: point1.latitude_deg, longitude_deg: point1.longitude_deg };
  points[points.length - 1] = { latitude_deg: point2.latitude_deg, longitude_deg: point2.longitude_deg };
  return points;
}

// ---------------------------------------------------------------------------
// Arc sampling
// ---------------------------------------------------------------------------

/**
 * Sample an arc segment from start to end with the given arc angle and direction.
 * Returns `steps + 1` GeoRef points, or null when the arc cannot be computed
 * (zero angle, coincident endpoints, degenerate half-angle).
 */
export function sampleArcPoints(
  start: GeoRef,
  end: GeoRef,
  arcAngleDeg: number,
  direction: "Clockwise" | "CounterClockwise",
  steps: number,
): GeoRef[] | null {
  if (arcAngleDeg === 0) {
    return null;
  }

  const reference = start;
  const startXY = latLonToLocalXY(reference, start.latitude_deg, start.longitude_deg);
  const endXY = latLonToLocalXY(reference, end.latitude_deg, end.longitude_deg);
  const chordX = endXY.x_m - startXY.x_m;
  const chordY = endXY.y_m - startXY.y_m;
  const chordLength = Math.hypot(chordX, chordY);
  if (chordLength === 0) {
    return null;
  }

  const theta = Math.abs((arcAngleDeg * Math.PI) / 180);
  const sinHalf = Math.sin(theta / 2);
  if (Math.abs(sinHalf) < 1e-9) {
    return null;
  }

  const midpointX = (startXY.x_m + endXY.x_m) / 2;
  const midpointY = (startXY.y_m + endXY.y_m) / 2;
  const leftNormalX = -chordY / chordLength;
  const leftNormalY = chordX / chordLength;
  const normalSign = direction === "CounterClockwise" ? 1 : -1;
  const centerDistance = chordLength / (2 * Math.tan(theta / 2));
  const centerX = midpointX + leftNormalX * centerDistance * normalSign;
  const centerY = midpointY + leftNormalY * centerDistance * normalSign;
  const radius = Math.hypot(startXY.x_m - centerX, startXY.y_m - centerY);
  const startAngle = Math.atan2(startXY.y_m - centerY, startXY.x_m - centerX);
  const sweep = direction === "CounterClockwise" ? theta : -theta;

  const points: GeoRef[] = [];
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const angle = startAngle + sweep * t;
    const x_m = centerX + radius * Math.cos(angle);
    const y_m = centerY + radius * Math.sin(angle);
    const { lat, lon } = localXYToLatLon(reference, x_m, y_m);
    points.push({ latitude_deg: lat, longitude_deg: lon });
  }

  // Snap endpoints.
  points[0] = { latitude_deg: start.latitude_deg, longitude_deg: start.longitude_deg };
  points[points.length - 1] = { latitude_deg: end.latitude_deg, longitude_deg: end.longitude_deg };
  return points;
}
