import type { FenceRegion, GeoPoint2d } from "./mavkit-types";
import { haversineM } from "./geo-utils";
import { latLonToLocalXY } from "./mission-coordinates";

export type FenceStats = {
  regionCount: number;
  /** Sum of perimeters for all regions, in metres. */
  totalPerimeterM: number;
  /** Sum of areas for all regions, in square metres. */
  totalAreaM2: number;
};

export function computeFenceStats(regions: FenceRegion[]): FenceStats {
  let totalPerimeterM = 0;
  let totalAreaM2 = 0;

  for (const region of regions) {
    if ("inclusion_polygon" in region) {
      const { perimeterM, areaM2 } = polygonMetrics(region.inclusion_polygon.vertices);
      totalPerimeterM += perimeterM;
      totalAreaM2 += areaM2;
    } else if ("exclusion_polygon" in region) {
      const { perimeterM, areaM2 } = polygonMetrics(region.exclusion_polygon.vertices);
      totalPerimeterM += perimeterM;
      totalAreaM2 += areaM2;
    } else if ("inclusion_circle" in region) {
      const r = region.inclusion_circle.radius_m;
      totalPerimeterM += 2 * Math.PI * r;
      totalAreaM2 += Math.PI * r * r;
    } else if ("exclusion_circle" in region) {
      const r = region.exclusion_circle.radius_m;
      totalPerimeterM += 2 * Math.PI * r;
      totalAreaM2 += Math.PI * r * r;
    }
  }

  return { regionCount: regions.length, totalPerimeterM, totalAreaM2 };
}

/** Compute polygon perimeter (haversine) and area (Shoelace on local metric projection). */
function polygonMetrics(
  vertices: GeoPoint2d[],
): { perimeterM: number; areaM2: number } {
  const n = vertices.length;
  if (n < 3) {
    return { perimeterM: 0, areaM2: 0 };
  }

  // Perimeter: sum of great-circle distances around the ring.
  let perimeterM = 0;
  for (let i = 0; i < n; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % n];
    perimeterM += haversineM(a.latitude_deg, a.longitude_deg, b.latitude_deg, b.longitude_deg);
  }

  // Area: Shoelace formula on locally-projected metres.
  // Use the centroid as the flat-earth reference to minimise projection error.
  const refLat = vertices.reduce((sum, v) => sum + v.latitude_deg, 0) / n;
  const refLon = vertices.reduce((sum, v) => sum + v.longitude_deg, 0) / n;
  const ref = { latitude_deg: refLat, longitude_deg: refLon };

  const projected = vertices.map((v) =>
    latLonToLocalXY(ref, v.latitude_deg, v.longitude_deg),
  );

  let shoelace = 0;
  for (let i = 0; i < n; i++) {
    const a = projected[i];
    const b = projected[(i + 1) % n];
    shoelace += a.x_m * b.y_m - b.x_m * a.y_m;
  }

  return { perimeterM, areaM2: Math.abs(shoelace) / 2 };
}
