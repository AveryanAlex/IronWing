import type { MissionItem, GeoPoint2d, GeoPoint3d } from "./mavkit-types";
import {
    latLonToLocalXY,
    localXYToLatLon,
    type GeoRef,
} from "./mission-coordinates";
import {
    groundSampleDistance,
    imageFootprint,
    type CameraOrientation,
    type CameraSpec,
} from "./survey-camera";
import type {
    SurveyCaptureMode,
    TerrainLookup,
} from "./survey-grid";

export type StructureScanValidationError = {
    code:
    | "too_few_points"
    | "invalid_polygon"
    | "invalid_altitude"
    | "invalid_structure_height"
    | "invalid_scan_distance"
    | "invalid_layer_count"
    | "invalid_camera"
    | "invalid_overlap"
    | "missing_terrain_lookup"
    | "invalid_capture_mode"
    | "invalid_hover_hold_time";
    message: string;
};

export type StructureScanParams = {
    polygon: GeoPoint2d[];
    camera: CameraSpec;
    orientation: CameraOrientation;
    altitude_m: number;
    structureHeight_m: number;
    scanDistance_m: number;
    layerCount: number;
    layerOrder: "bottom_to_top" | "top_to_bottom";
    sideOverlap_pct: number;
    frontOverlap_pct: number;
    terrainFollow: boolean;
    terrainLookup?: TerrainLookup;
    captureMode: SurveyCaptureMode;
    hoverHoldTime_s?: number;
};

export type StructureScanLayer = {
    altitude_m: number;
    gimbalPitch_deg: number;
    orbitPoints: GeoPoint2d[];
    photoCount: number;
};

export type StructureScanStats = {
    gsd_m: number;
    photoCount: number;
    layerCount: number;
    photosPerLayer: number;
    layerSpacing_m: number;
    triggerDistance_m: number;
    estimatedFlightTime_s: number;
};

export type StructureScanResult =
    | {
        ok: true;
        items: MissionItem[];
        layers: StructureScanLayer[];
        stats: StructureScanStats;
        params: StructureScanParams;
    }
    | {
        ok: false;
        errors: StructureScanValidationError[];
    };

type Vec2 = { x: number; y: number };
type OrbitGeometry = {
    closedOrbitPoints: Vec2[];
    uniqueOrbitPoints: Vec2[];
    perimeter_m: number;
};
type LayerPlan = {
    altitude_m: number;
    gimbalPitch_deg: number;
    uniqueOrbitPoints: GeoPoint2d[];
    closedOrbitPoints: GeoPoint2d[];
    photoCount: number;
};
type DerivedMetrics = {
    gsd_m: number;
    triggerDistance_m: number;
    layerSpacing_m: number;
};

const DEFAULT_HOVER_HOLD_TIME_S = 1;
const EPSILON = 1e-9;
const POINT_EPSILON_M = 1e-6;
const ARC_STEP_RAD = Math.PI / 8;
const NOMINAL_ORBIT_SPEED_MPS = 4;

export async function generateStructureScan(params: StructureScanParams): Promise<StructureScanResult> {
    const normalizedParams = normalizeStructureScanParams(params);
    const validation = validateStructureScanParams(normalizedParams, true);
    if (validation.length > 0) {
        return { ok: false, errors: validation };
    }

    const derived = deriveStructureScanMetrics(normalizedParams);
    if (!derived.ok) {
        return { ok: false, errors: derived.errors };
    }

    const ref = polygonRef(normalizedParams.polygon);
    const localPolygon = toLocalPolygon(normalizedParams.polygon, ref);
    const hull = convexHull(localPolygon);
    if (hull.length < 3 || Math.abs(signedArea(hull)) <= EPSILON) {
        return {
            ok: false,
            errors: [{
                code: "invalid_polygon",
                message: "Polygon must describe a non-degenerate footprint with measurable area.",
            }],
        };
    }

    const orbit = buildOrbitGeometry(hull, normalizedParams.scanDistance_m, derived.metrics.triggerDistance_m);
    const layers = planLayers(normalizedParams, derived.metrics, orbit, ref);
    const items: MissionItem[] = [];
    const positionResolver = createPositionResolver(normalizedParams);

    for (const layer of layers) {
        await appendLayerItems(items, layer, normalizedParams, positionResolver, derived.metrics.triggerDistance_m);
    }

    const photosPerLayer = layers[0]?.photoCount ?? 0;
    const orbitDistance_m = orbit.perimeter_m * layers.length;
    const hoverDelay_s = normalizedParams.captureMode === "hover"
        ? photosPerLayer * layers.length * (normalizedParams.hoverHoldTime_s ?? DEFAULT_HOVER_HOLD_TIME_S)
        : 0;

    return {
        ok: true,
        items,
        layers: layers.map((layer) => ({
            altitude_m: layer.altitude_m,
            gimbalPitch_deg: layer.gimbalPitch_deg,
            orbitPoints: layer.closedOrbitPoints,
            photoCount: layer.photoCount,
        })),
        stats: {
            gsd_m: derived.metrics.gsd_m,
            photoCount: photosPerLayer * layers.length,
            layerCount: layers.length,
            photosPerLayer,
            layerSpacing_m: derived.metrics.layerSpacing_m,
            triggerDistance_m: derived.metrics.triggerDistance_m,
            estimatedFlightTime_s: orbitDistance_m / NOMINAL_ORBIT_SPEED_MPS + hoverDelay_s,
        },
        params: normalizedParams,
    };
}

export function estimateStructureScanWaypointCount(
    params: Omit<StructureScanParams, "terrainLookup">,
): number | null {
    const normalizedParams = normalizeStructureScanParams(params);
    const validation = validateStructureScanParams(normalizedParams, false);
    if (validation.length > 0) {
        return null;
    }

    const derived = deriveStructureScanMetrics(normalizedParams);
    if (!derived.ok) {
        return null;
    }

    const ref = polygonRef(normalizedParams.polygon);
    const localPolygon = toLocalPolygon(normalizedParams.polygon, ref);
    const hull = convexHull(localPolygon);
    if (hull.length < 3 || Math.abs(signedArea(hull)) <= EPSILON) {
        return null;
    }

    const orbit = buildOrbitGeometry(hull, normalizedParams.scanDistance_m, derived.metrics.triggerDistance_m);
    const layers = planLayers(normalizedParams, derived.metrics, orbit, ref);

    return layers.reduce((count, layer) => count + countLayerItems(layer, normalizedParams.captureMode), 0);
}

function normalizeStructureScanParams(
    params: Omit<StructureScanParams, "terrainLookup"> & Pick<StructureScanParams, "terrainLookup">,
): StructureScanParams {
    return {
        ...params,
        hoverHoldTime_s: params.hoverHoldTime_s ?? DEFAULT_HOVER_HOLD_TIME_S,
    };
}

function validateStructureScanParams(
    params: StructureScanParams,
    requireTerrainLookup: boolean,
): StructureScanValidationError[] {
    const errors: StructureScanValidationError[] = [];

    if (params.polygon.length < 3) {
        errors.push({
            code: "too_few_points",
            message: `Polygon must have at least 3 vertices (got ${params.polygon.length}).`,
        });
    }

    for (let index = 0; index < params.polygon.length; index += 1) {
        const point = params.polygon[index];
        if (
            !Number.isFinite(point.latitude_deg) ||
            !Number.isFinite(point.longitude_deg) ||
            point.latitude_deg < -90 ||
            point.latitude_deg > 90 ||
            point.longitude_deg < -180 ||
            point.longitude_deg > 180
        ) {
            errors.push({
                code: "invalid_polygon",
                message: `Polygon vertex ${index} has invalid coordinates (${point.latitude_deg}, ${point.longitude_deg}).`,
            });
            break;
        }
    }

    if (!Number.isFinite(params.altitude_m) || params.altitude_m < 0) {
        errors.push({
            code: "invalid_altitude",
            message: `altitude_m must be a finite number greater than or equal to zero (got ${params.altitude_m}).`,
        });
    }

    if (!Number.isFinite(params.structureHeight_m) || params.structureHeight_m <= 0) {
        errors.push({
            code: "invalid_structure_height",
            message: `structureHeight_m must be a finite number greater than zero (got ${params.structureHeight_m}).`,
        });
    }

    if (!Number.isFinite(params.scanDistance_m) || params.scanDistance_m <= 0) {
        errors.push({
            code: "invalid_scan_distance",
            message: `scanDistance_m must be a finite number greater than zero (got ${params.scanDistance_m}).`,
        });
    }

    if (!Number.isInteger(params.layerCount) || params.layerCount < 1) {
        errors.push({
            code: "invalid_layer_count",
            message: `layerCount must be an integer greater than or equal to one (got ${params.layerCount}).`,
        });
    }

    if (!isValidOverlap(params.sideOverlap_pct)) {
        errors.push({
            code: "invalid_overlap",
            message: `sideOverlap_pct must be in the range 0..1 or 0..100 (got ${params.sideOverlap_pct}).`,
        });
    }

    if (!isValidOverlap(params.frontOverlap_pct)) {
        errors.push({
            code: "invalid_overlap",
            message: `frontOverlap_pct must be in the range 0..1 or 0..100 (got ${params.frontOverlap_pct}).`,
        });
    }

    if (params.captureMode !== "distance" && params.captureMode !== "hover") {
        errors.push({
            code: "invalid_capture_mode",
            message: `captureMode must be either \"distance\" or \"hover\" (got ${String(params.captureMode)}).`,
        });
    }

    if (
        params.captureMode === "hover" &&
        (!Number.isFinite(params.hoverHoldTime_s) || (params.hoverHoldTime_s ?? 0) <= 0)
    ) {
        errors.push({
            code: "invalid_hover_hold_time",
            message: `hoverHoldTime_s must be a finite number greater than zero in hover capture mode (got ${params.hoverHoldTime_s}).`,
        });
    }

    if (params.terrainFollow && requireTerrainLookup && !params.terrainLookup) {
        errors.push({
            code: "missing_terrain_lookup",
            message: "terrainLookup is required when terrainFollow is enabled.",
        });
    }

    if (errors.length > 0) {
        return errors;
    }

    const ref = polygonRef(params.polygon);
    const localPolygon = toLocalPolygon(params.polygon, ref);
    const hull = convexHull(localPolygon);
    if (hull.length < 3 || Math.abs(signedArea(hull)) <= EPSILON) {
        errors.push({
            code: "invalid_polygon",
            message: "Polygon must describe a non-degenerate footprint with measurable area.",
        });
    }

    try {
        groundSampleDistance(params.camera, params.scanDistance_m, params.orientation);
    } catch (error) {
        errors.push({
            code: "invalid_camera",
            message: error instanceof Error ? error.message : "Camera parameters are invalid.",
        });
    }

    return errors;
}

function deriveStructureScanMetrics(
    params: StructureScanParams,
):
    | { ok: true; metrics: DerivedMetrics }
    | { ok: false; errors: StructureScanValidationError[] } {
    try {
        const footprint = imageFootprint(params.camera, params.scanDistance_m, params.orientation);
        const gsd_m = groundSampleDistance(params.camera, params.scanDistance_m, params.orientation);
        const triggerDistance_m = footprint.width_m * (1 - normalizeOverlap(params.sideOverlap_pct));
        const layerSpacing_m = params.structureHeight_m / params.layerCount;

        const errors: StructureScanValidationError[] = [];
        if (!Number.isFinite(triggerDistance_m) || triggerDistance_m <= 0) {
            errors.push({
                code: "invalid_overlap",
                message: `Computed orbit trigger distance must be greater than zero (got ${triggerDistance_m}). Reduce side overlap below 100%.`,
            });
        }

        if (!Number.isFinite(layerSpacing_m) || layerSpacing_m <= 0) {
            errors.push({
                code: "invalid_layer_count",
                message: `Computed layer spacing must be greater than zero (got ${layerSpacing_m}).`,
            });
        }

        if (errors.length > 0) {
            return { ok: false, errors };
        }

        return {
            ok: true,
            metrics: {
                gsd_m,
                triggerDistance_m,
                layerSpacing_m,
            },
        };
    } catch (error) {
        return {
            ok: false,
            errors: [{
                code: "invalid_camera",
                message: error instanceof Error ? error.message : "Failed to derive structure scan camera metrics.",
            }],
        };
    }
}

function planLayers(
    params: StructureScanParams,
    metrics: DerivedMetrics,
    orbit: OrbitGeometry,
    ref: GeoRef,
): LayerPlan[] {
    const naturalOrder = Array.from({ length: params.layerCount }, (_, index) => index);
    const orderedLayerIndexes = params.layerOrder === "bottom_to_top" ? naturalOrder : [...naturalOrder].reverse();
    const structureCenterHeight_m = params.structureHeight_m / 2;

    return orderedLayerIndexes.map((layerIndex) => {
        const layerMidpointHeight_m = (layerIndex + 0.5) * metrics.layerSpacing_m;
        const altitude_m = params.altitude_m + layerMidpointHeight_m;
        const pitchRad = Math.atan2(structureCenterHeight_m - layerMidpointHeight_m, params.scanDistance_m);
        const gimbalPitch_deg = (pitchRad * 180) / Math.PI;
        const uniqueOrbitPoints = orbit.uniqueOrbitPoints.map((point) => localPointToGeoWithRef(point, ref));
        const closedOrbitPoints = orbit.closedOrbitPoints.map((point) => localPointToGeoWithRef(point, ref));

        return {
            altitude_m,
            gimbalPitch_deg,
            uniqueOrbitPoints,
            closedOrbitPoints,
            photoCount: orbit.uniqueOrbitPoints.length,
        };
    });
}

function buildOrbitGeometry(hull: Vec2[], scanDistance_m: number, desiredSpacing_m: number): OrbitGeometry {
    const ccwHull = signedArea(hull) >= 0 ? hull : [...hull].reverse();
    const approximatedRing = approximateRoundedOffsetRing(ccwHull, scanDistance_m);
    const perimeter_m = closedPathLength(approximatedRing);
    const photoCount = Math.max(3, Math.ceil(perimeter_m / Math.max(desiredSpacing_m, POINT_EPSILON_M)));
    const uniqueOrbitPoints = sampleClosedPath(approximatedRing, photoCount);
    const closedOrbitPoints = [...uniqueOrbitPoints, uniqueOrbitPoints[0]];

    return {
        closedOrbitPoints,
        uniqueOrbitPoints,
        perimeter_m,
    };
}

function approximateRoundedOffsetRing(hull: Vec2[], radius_m: number): Vec2[] {
    const ring: Vec2[] = [];
    const vertexCount = hull.length;

    for (let index = 0; index < vertexCount; index += 1) {
        const prev = hull[(index - 1 + vertexCount) % vertexCount];
        const current = hull[index];
        const next = hull[(index + 1) % vertexCount];
        const prevDirection = normalize(subtract(current, prev));
        const nextDirection = normalize(subtract(next, current));
        const startNormal = outwardNormal(prevDirection);
        const endNormal = outwardNormal(nextDirection);
        const tangentStart = add(current, scale(startNormal, radius_m));
        const tangentEnd = add(current, scale(endNormal, radius_m));

        if (ring.length === 0) {
            ring.push(tangentStart);
        } else if (!isSamePoint(ring[ring.length - 1], tangentStart)) {
            ring.push(tangentStart);
        }

        const startAngle = Math.atan2(startNormal.y, startNormal.x);
        const endAngle = normalizeArcAngle(startAngle, Math.atan2(endNormal.y, endNormal.x));
        const sweep = endAngle - startAngle;
        const steps = Math.max(1, Math.ceil(Math.abs(sweep) / ARC_STEP_RAD));

        for (let step = 1; step <= steps; step += 1) {
            const angle = startAngle + (sweep * step) / steps;
            const point = add(current, {
                x: Math.cos(angle) * radius_m,
                y: Math.sin(angle) * radius_m,
            });
            if (!isSamePoint(ring[ring.length - 1], point)) {
                ring.push(point);
            }
        }

        if (!isSamePoint(ring[ring.length - 1], tangentEnd)) {
            ring.push(tangentEnd);
        }
    }

    return dedupeSequentialPoints(ring);
}

function sampleClosedPath(path: Vec2[], sampleCount: number): Vec2[] {
    const segmentLengths = path.map((point, index) => distanceBetween(point, path[(index + 1) % path.length]));
    const perimeter_m = segmentLengths.reduce((sum, length) => sum + length, 0);
    if (perimeter_m <= POINT_EPSILON_M) {
        return [path[0], path[0], path[0]];
    }

    return Array.from({ length: sampleCount }, (_, index) => {
        const targetDistance = (perimeter_m * index) / sampleCount;
        return pointAlongClosedPath(path, segmentLengths, targetDistance);
    });
}

function pointAlongClosedPath(path: Vec2[], segmentLengths: number[], targetDistance_m: number): Vec2 {
    let remaining = targetDistance_m;

    for (let index = 0; index < path.length; index += 1) {
        const start = path[index];
        const end = path[(index + 1) % path.length];
        const segmentLength = segmentLengths[index];
        if (segmentLength <= POINT_EPSILON_M) {
            continue;
        }

        if (remaining <= segmentLength + POINT_EPSILON_M) {
            const t = Math.max(0, Math.min(1, remaining / segmentLength));
            return {
                x: start.x + (end.x - start.x) * t,
                y: start.y + (end.y - start.y) * t,
            };
        }

        remaining -= segmentLength;
    }

    return path[0];
}

async function appendLayerItems(
    items: MissionItem[],
    layer: LayerPlan,
    params: StructureScanParams,
    positionResolver: (point: GeoPoint2d, altitude_m: number) => Promise<GeoPoint3d>,
    triggerDistance_m: number,
): Promise<void> {
    const centroid = polygonRef(params.polygon);
    const yawSequence = layer.closedOrbitPoints.map((point) => yawToCentroid(point, centroid));
    const holdTime_s = params.hoverHoldTime_s ?? DEFAULT_HOVER_HOLD_TIME_S;

    if (params.captureMode === "distance") {
        items.push(createMountControlItem(layer.gimbalPitch_deg, yawSequence[0]));
        items.push(createTriggerDistanceItem(triggerDistance_m, true));

        for (let index = 0; index < layer.closedOrbitPoints.length; index += 1) {
            if (index > 0) {
                items.push(createMountControlItem(layer.gimbalPitch_deg, yawSequence[index]));
            }
            items.push(
                createWaypointItem(
                    await positionResolver(layer.closedOrbitPoints[index], layer.altitude_m),
                ),
            );
        }

        items.push(createTriggerDistanceItem(0, false));
        return;
    }

    items.push(createTriggerDistanceItem(0, false));
    items.push(createMountControlItem(layer.gimbalPitch_deg, yawSequence[0]));

    for (let index = 0; index < layer.uniqueOrbitPoints.length; index += 1) {
        if (index > 0) {
            items.push(createMountControlItem(layer.gimbalPitch_deg, yawSequence[index]));
        }

        items.push(
            createWaypointItem(
                await positionResolver(layer.uniqueOrbitPoints[index], layer.altitude_m),
                holdTime_s,
            ),
        );
        items.push(createImageStartCaptureItem());
    }
}

function countLayerItems(layer: LayerPlan, captureMode: SurveyCaptureMode): number {
    if (captureMode === "distance") {
        return 1 + 1 + layer.closedOrbitPoints.length + (layer.closedOrbitPoints.length - 1) + 1;
    }

    return 1 + 1 + layer.uniqueOrbitPoints.length * 2 + (layer.uniqueOrbitPoints.length - 1);
}

function createPositionResolver(params: StructureScanParams) {
    const cache = new Map<string, Promise<GeoPoint3d>>();

    return async (point: GeoPoint2d, altitude_m: number): Promise<GeoPoint3d> => {
        const key = `${point.latitude_deg.toFixed(10)},${point.longitude_deg.toFixed(10)},${altitude_m.toFixed(3)}`;
        const existing = cache.get(key);
        if (existing) {
            return existing;
        }

        const pending = (async () => {
            if (params.terrainFollow && params.terrainLookup) {
                const terrain = await params.terrainLookup(point.latitude_deg, point.longitude_deg);
                if (terrain !== null) {
                    return {
                        Terrain: {
                            latitude_deg: point.latitude_deg,
                            longitude_deg: point.longitude_deg,
                            altitude_terrain_m: altitude_m,
                        },
                    };
                }
            }

            return {
                RelHome: {
                    latitude_deg: point.latitude_deg,
                    longitude_deg: point.longitude_deg,
                    relative_alt_m: altitude_m,
                },
            };
        })();

        cache.set(key, pending);
        return pending;
    };
}

function createWaypointItem(position: GeoPoint3d, hold_time_s = 0): MissionItem {
    return {
        command: {
            Nav: {
                Waypoint: {
                    position,
                    hold_time_s,
                    acceptance_radius_m: 1,
                    pass_radius_m: 0,
                    yaw_deg: 0,
                },
            },
        },
        current: false,
        autocontinue: true,
    };
}

function createMountControlItem(pitch_deg: number, yaw_deg: number): MissionItem {
    return {
        command: {
            Do: {
                MountControl: {
                    pitch_deg,
                    roll_deg: 0,
                    yaw_deg,
                },
            },
        },
        current: false,
        autocontinue: true,
    };
}

function createTriggerDistanceItem(meters: number, trigger_now: boolean): MissionItem {
    return {
        command: {
            Do: {
                CamTriggerDistance: {
                    meters,
                    trigger_now,
                },
            },
        },
        current: false,
        autocontinue: true,
    };
}

function createImageStartCaptureItem(): MissionItem {
    return {
        command: {
            Do: {
                ImageStartCapture: {
                    instance: 0,
                    interval_s: 0,
                    total_images: 1,
                    start_number: 0,
                },
            },
        },
        current: false,
        autocontinue: true,
    };
}

function polygonRef(polygon: GeoPoint2d[]): GeoRef {
    let latitudeSum = 0;
    let longitudeSum = 0;
    for (const point of polygon) {
        latitudeSum += point.latitude_deg;
        longitudeSum += point.longitude_deg;
    }
    return {
        latitude_deg: latitudeSum / polygon.length,
        longitude_deg: longitudeSum / polygon.length,
    };
}

function toLocalPolygon(polygon: GeoPoint2d[], ref: GeoRef): Vec2[] {
    return polygon.map((point) => {
        const { x_m, y_m } = latLonToLocalXY(ref, point.latitude_deg, point.longitude_deg);
        return { x: x_m, y: y_m };
    });
}

function localPointToGeoWithRef(point: Vec2, ref: GeoRef): GeoPoint2d {
    const { lat, lon } = localXYToLatLon(ref, point.x, point.y);
    return { latitude_deg: lat, longitude_deg: lon };
}

function yawToCentroid(point: GeoPoint2d, centroid: GeoPoint2d): number {
    const { x_m, y_m } = latLonToLocalXY(
        { latitude_deg: point.latitude_deg, longitude_deg: point.longitude_deg },
        centroid.latitude_deg,
        centroid.longitude_deg,
    );
    let yaw_deg = (Math.atan2(x_m, y_m) * 180) / Math.PI;
    if (yaw_deg < 0) {
        yaw_deg += 360;
    }
    return yaw_deg;
}

function convexHull(points: Vec2[]): Vec2[] {
    const sorted = dedupeSequentialPoints([...points].sort((left, right) => left.x - right.x || left.y - right.y));
    if (sorted.length <= 1) {
        return sorted;
    }

    const lower: Vec2[] = [];
    for (const point of sorted) {
        while (lower.length >= 2 && cross(subtract(lower[lower.length - 1], lower[lower.length - 2]), subtract(point, lower[lower.length - 1])) <= 0) {
            lower.pop();
        }
        lower.push(point);
    }

    const upper: Vec2[] = [];
    for (let index = sorted.length - 1; index >= 0; index -= 1) {
        const point = sorted[index];
        while (upper.length >= 2 && cross(subtract(upper[upper.length - 1], upper[upper.length - 2]), subtract(point, upper[upper.length - 1])) <= 0) {
            upper.pop();
        }
        upper.push(point);
    }

    lower.pop();
    upper.pop();
    return [...lower, ...upper];
}

function normalizeOverlap(overlap_pct: number): number {
    if (overlap_pct <= 1) {
        return overlap_pct;
    }
    return overlap_pct / 100;
}

function isValidOverlap(overlap: number): boolean {
    return Number.isFinite(overlap) && overlap >= 0 && overlap <= 100;
}

function outwardNormal(direction: Vec2): Vec2 {
    return {
        x: direction.y,
        y: -direction.x,
    };
}

function normalizeArcAngle(start: number, end: number): number {
    let normalizedEnd = end;
    while (normalizedEnd <= start) {
        normalizedEnd += Math.PI * 2;
    }
    return normalizedEnd;
}

function closedPathLength(path: Vec2[]): number {
    return path.reduce((sum, point, index) => sum + distanceBetween(point, path[(index + 1) % path.length]), 0);
}

function dedupeSequentialPoints(points: Vec2[]): Vec2[] {
    const deduped: Vec2[] = [];
    for (const point of points) {
        if (deduped.length === 0 || !isSamePoint(deduped[deduped.length - 1], point)) {
            deduped.push(point);
        }
    }
    return deduped;
}

function signedArea(points: Vec2[]): number {
    let area = 0;
    for (let index = 0; index < points.length; index += 1) {
        const next = points[(index + 1) % points.length];
        area += points[index].x * next.y - next.x * points[index].y;
    }
    return area / 2;
}

function add(a: Vec2, b: Vec2): Vec2 {
    return { x: a.x + b.x, y: a.y + b.y };
}

function subtract(a: Vec2, b: Vec2): Vec2 {
    return { x: a.x - b.x, y: a.y - b.y };
}

function scale(vector: Vec2, factor: number): Vec2 {
    return { x: vector.x * factor, y: vector.y * factor };
}

function normalize(vector: Vec2): Vec2 {
    const magnitude = Math.hypot(vector.x, vector.y);
    if (magnitude <= POINT_EPSILON_M) {
        return { x: 0, y: 0 };
    }
    return {
        x: vector.x / magnitude,
        y: vector.y / magnitude,
    };
}

function distanceBetween(a: Vec2, b: Vec2): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function cross(a: Vec2, b: Vec2): number {
    return a.x * b.y - a.y * b.x;
}

function isSamePoint(a: Vec2, b: Vec2, epsilon = POINT_EPSILON_M): boolean {
    return distanceBetween(a, b) <= epsilon;
}
