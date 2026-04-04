import type { FencePlan, FenceRegion, GeoPoint2d } from "../mavkit-types";
import {
    QGC_GEOFENCE_VERSION,
    type QgcFenceCircle,
    type QgcFencePolygon,
    type QgcFenceVertex,
    type QgcGeoFence,
} from "./qgc-types";

function numberOrZero(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function parseFenceVertex(vertex: QgcFenceVertex | undefined): GeoPoint2d | null {
    if (!vertex || typeof vertex !== "object") {
        return null;
    }

    const maybeLatitude = typeof vertex.latitude === "number" ? vertex.latitude : vertex.lat;
    const maybeLongitude = typeof vertex.longitude === "number" ? vertex.longitude : vertex.lon;
    if (!Number.isFinite(maybeLatitude) || !Number.isFinite(maybeLongitude)) {
        return null;
    }

    const latitude = maybeLatitude as number;
    const longitude = maybeLongitude as number;
    return {
        latitude_deg: latitude,
        longitude_deg: longitude,
    };
}

export function parseFencePlan(geoFence: QgcGeoFence | undefined, warnings: string[]): FencePlan {
    const regions: FenceRegion[] = [];

    for (const polygon of geoFence?.polygons ?? []) {
        const vertices = (polygon.polygon ?? [])
            .map(parseFenceVertex)
            .filter((vertex): vertex is GeoPoint2d => vertex !== null);
        if (vertices.length === 0) {
            warnings.push("A QGC fence polygon had no valid vertices and was skipped.");
            continue;
        }

        if (polygon.inclusion === false) {
            regions.push({ exclusion_polygon: { vertices } });
        } else {
            regions.push({ inclusion_polygon: { vertices, inclusion_group: 0 } });
        }
    }

    for (const circle of geoFence?.circles ?? []) {
        const center = parseFenceVertex(circle.circle?.center);
        const radius = numberOrZero(circle.circle?.radius);
        if (!center || radius <= 0) {
            warnings.push("A QGC fence circle was missing a valid center or positive radius and was skipped.");
            continue;
        }

        if (circle.inclusion === false) {
            regions.push({ exclusion_circle: { center, radius_m: radius } });
        } else {
            regions.push({ inclusion_circle: { center, radius_m: radius, inclusion_group: 0 } });
        }
    }

    return {
        return_point: null,
        regions,
    };
}

export function exportFencePlan(fence: FencePlan): QgcGeoFence {
    const polygons: QgcFencePolygon[] = [];
    const circles: QgcFenceCircle[] = [];

    for (const region of fence.regions) {
        if ("inclusion_polygon" in region) {
            polygons.push({
                inclusion: true,
                polygon: region.inclusion_polygon.vertices.map((vertex) => ({
                    latitude: vertex.latitude_deg,
                    longitude: vertex.longitude_deg,
                })),
            });
            continue;
        }

        if ("exclusion_polygon" in region) {
            polygons.push({
                inclusion: false,
                polygon: region.exclusion_polygon.vertices.map((vertex) => ({
                    latitude: vertex.latitude_deg,
                    longitude: vertex.longitude_deg,
                })),
            });
            continue;
        }

        if ("inclusion_circle" in region) {
            circles.push({
                inclusion: true,
                circle: {
                    center: {
                        latitude: region.inclusion_circle.center.latitude_deg,
                        longitude: region.inclusion_circle.center.longitude_deg,
                    },
                    radius: region.inclusion_circle.radius_m,
                },
            });
            continue;
        }

        circles.push({
            inclusion: false,
            circle: {
                center: {
                    latitude: region.exclusion_circle.center.latitude_deg,
                    longitude: region.exclusion_circle.center.longitude_deg,
                },
                radius: region.exclusion_circle.radius_m,
            },
        });
    }

    return {
        version: QGC_GEOFENCE_VERSION,
        polygons,
        circles,
    };
}
