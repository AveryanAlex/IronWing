import type { FenceRegion, GeoPoint2d } from "../mavkit-types";
import { parseLatitude, parseLongitude } from "../mission-coordinates";

type ValidationResult = { ok: true } | { ok: false; message: string };

export function validateFenceRegion(region: FenceRegion): ValidationResult {
  if ("inclusion_polygon" in region) {
    return validateFencePolygon(region.inclusion_polygon.vertices, "Fence inclusion polygons");
  }

  if ("exclusion_polygon" in region) {
    return validateFencePolygon(region.exclusion_polygon.vertices, "Fence exclusion polygons");
  }

  if ("inclusion_circle" in region) {
    return validateFenceCircle(region.inclusion_circle.center, region.inclusion_circle.radius_m, "Fence inclusion circles");
  }

  return validateFenceCircle(region.exclusion_circle.center, region.exclusion_circle.radius_m, "Fence exclusion circles");
}

export function isCoordinatePairValid(latitudeDeg: number, longitudeDeg: number): boolean {
  return parseLatitude(latitudeDeg).ok && parseLongitude(longitudeDeg).ok;
}

function validateFencePolygon(
  vertices: GeoPoint2d[],
  label: string,
): ValidationResult {
  if (vertices.length < 3) {
    return {
      ok: false,
      message: `${label} need at least three valid vertices before IronWing will update the active fence region.`,
    };
  }

  const invalidVertex = vertices.find((vertex) => !isCoordinatePairValid(vertex.latitude_deg, vertex.longitude_deg));
  if (invalidVertex) {
    return {
      ok: false,
      message: `${label} rejected malformed coordinates, so the previous fence geometry stayed visible and unchanged.`,
    };
  }

  return { ok: true };
}

function validateFenceCircle(
  center: GeoPoint2d,
  radiusM: number,
  label: string,
): ValidationResult {
  if (!isCoordinatePairValid(center.latitude_deg, center.longitude_deg)) {
    return {
      ok: false,
      message: `${label} rejected malformed center coordinates, so the previous fence geometry stayed visible and unchanged.`,
    };
  }

  if (!Number.isFinite(radiusM) || radiusM <= 0) {
    return {
      ok: false,
      message: `${label} need a radius greater than zero before IronWing will update the active fence region.`,
    };
  }

  return { ok: true };
}
