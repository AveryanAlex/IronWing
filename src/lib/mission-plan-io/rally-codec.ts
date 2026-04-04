import type { GeoPoint3d, RallyPlan } from "../mavkit-types";
import { QGC_RALLY_VERSION, type QgcRallyExport, type QgcRallyPoints } from "./qgc-types";

function numberOrZero(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function parseRallyPlan(rallyPoints: QgcRallyPoints | undefined, warnings: string[]): RallyPlan {
    const points: GeoPoint3d[] = [];

    for (const [index, point] of (rallyPoints?.points ?? []).entries()) {
        if (!Array.isArray(point) || point.length < 3) {
            warnings.push(`Rally point ${index + 1} was malformed and was skipped.`);
            continue;
        }

        points.push({
            RelHome: {
                latitude_deg: numberOrZero(point[0]),
                longitude_deg: numberOrZero(point[1]),
                relative_alt_m: numberOrZero(point[2]),
            },
        });
    }

    return { points };
}

export function exportRallyPlan(rally: RallyPlan, warnings: string[]): QgcRallyExport {
    return {
        version: QGC_RALLY_VERSION,
        points: rally.points.map((point, index) => {
            if (!("RelHome" in point)) {
                warnings.push(`Rally point ${index + 1} used a non-RelHome altitude frame and was exported lossily as a QGC relative-alt point.`);
            }

            if ("Msl" in point) {
                return [point.Msl.latitude_deg, point.Msl.longitude_deg, point.Msl.altitude_msl_m];
            }
            if ("Terrain" in point) {
                return [point.Terrain.latitude_deg, point.Terrain.longitude_deg, point.Terrain.altitude_terrain_m];
            }
            return [point.RelHome.latitude_deg, point.RelHome.longitude_deg, point.RelHome.relative_alt_m];
        }),
    };
}
