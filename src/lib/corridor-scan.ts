import type { MissionItem, GeoPoint2d, GeoPoint3d } from "./mavkit-types";
import {
    latLonToLocalXY,
    localXYToLatLon,
    type GeoRef,
} from "./mission-coordinates";
import {
    groundSampleDistance,
    laneSpacing as computeLaneSpacing,
    triggerDistance as computeTriggerDistance,
    type CameraOrientation,
    type CameraSpec,
} from "./survey-camera";
import type {
    SurveyCaptureMode,
    SurveyStats,
    SurveyTransect,
    TerrainLookup,
} from "./survey-grid";

export type CorridorValidationError = {
    code:
    | "too_few_points"
    | "invalid_width"
    | "invalid_camera"
    | "invalid_overlap"
    | "invalid_altitude"
    | "missing_terrain_lookup"
    | "invalid_capture_mode"
    | "invalid_hover_hold_time"
    | "invalid_turnaround_distance";
    message: string;
};

export type CorridorParams = {
    polyline: GeoPoint2d[];
    camera: CameraSpec;
    orientation: CameraOrientation;
    altitude_m: number;
    sideOverlap_pct: number;
    frontOverlap_pct: number;
    leftWidth_m: number;
    rightWidth_m: number;
    turnaroundDistance_m: number;
    terrainFollow: boolean;
    terrainLookup?: TerrainLookup;
    captureMode: SurveyCaptureMode;
    hoverHoldTime_s?: number;
};

export type CorridorStats = SurveyStats;

export type CorridorResult =
    | {
        ok: true;
        items: MissionItem[];
        transects: SurveyTransect[];
        crosshatchTransects: [];
        stats: SurveyStats;
        params: CorridorParams;
        corridorPolygon: GeoPoint2d[];
    }
    | {
        ok: false;
        errors: CorridorValidationError[];
    };

type Vec2 = { x: number; y: number };
type Segment = {
    start: Vec2;
    end: Vec2;
    direction: Vec2;
    normal: Vec2;
    length_m: number;
};
type LocalTransect = {
    center: Vec2;
    normal: Vec2;
};
type PlannedTransect = {
    start: Vec2;
    end: Vec2;
    leadIn: Vec2 | null;
    leadOut: Vec2 | null;
    length_m: number;
    transect: SurveyTransect;
};

type DerivedMetrics = {
    laneSpacing_m: number;
    triggerDistance_m: number;
    gsd_m: number;
};

const DEFAULT_HOVER_HOLD_TIME_S = 1;
const PHOTO_COUNT_EPSILON_M = 1e-9;
const MIN_POLYLINE_POINTS = 2;
const ANGLE_EPSILON_RAD = 1e-6;
const LINE_INTERSECTION_EPSILON = 1e-9;

export async function generateCorridor(params: CorridorParams): Promise<CorridorResult> {
    const normalizedParams = normalizeCorridorParams(params);
    const validation = validateCorridorParams(normalizedParams, true);
    if (validation.length > 0) {
        return { ok: false, errors: validation };
    }

    const derived = deriveCorridorMetrics(normalizedParams);
    if (!derived.ok) {
        return { ok: false, errors: derived.errors };
    }

    const ref = polylineRef(normalizedParams.polyline);
    const localPolyline = toLocalPolyline(normalizedParams.polyline, ref);
    const localTransects = planLocalTransects(
        localPolyline,
        derived.metrics.triggerDistance_m,
        Math.max(normalizedParams.leftWidth_m, normalizedParams.rightWidth_m),
    );

    if (localTransects.length === 0) {
        return {
            ok: false,
            errors: [{
                code: "too_few_points",
                message: "Corridor generation could not derive any transects from the provided polyline.",
            }],
        };
    }

    const plannedTransects = localTransects.map((transect, index) =>
        expandTransect(
            transect,
            index,
            normalizedParams.leftWidth_m,
            normalizedParams.rightWidth_m,
            normalizedParams.turnaroundDistance_m,
            ref,
        )
    );

    const items: MissionItem[] = [];
    const positionResolver = createPositionResolver(normalizedParams);
    await appendCorridorItems(
        items,
        plannedTransects,
        normalizedParams,
        derived.metrics.triggerDistance_m,
        positionResolver,
    );

    const corridorPolygon = computeCorridorPolygon(
        normalizedParams.polyline,
        normalizedParams.leftWidth_m,
        normalizedParams.rightWidth_m,
    );
    const area_m2 = computePolygonArea(corridorPolygon, ref);
    const photoCount = plannedTransects.reduce(
        (sum, transect) => sum + photoCountForTransect(transect.length_m, derived.metrics.triggerDistance_m),
        0,
    );

    return {
        ok: true,
        items,
        transects: plannedTransects.map((transect) => transect.transect),
        crosshatchTransects: [],
        stats: {
            gsd_m: derived.metrics.gsd_m,
            photoCount,
            area_m2,
            triggerDistance_m: derived.metrics.triggerDistance_m,
            laneSpacing_m: derived.metrics.laneSpacing_m,
            laneCount: plannedTransects.length,
            crosshatchLaneCount: 0,
        },
        params: normalizedParams,
        corridorPolygon,
    };
}

export function estimateCorridorWaypointCount(
    params: Omit<CorridorParams, "terrainLookup">,
): number | null {
    const normalizedParams = normalizeCorridorParams(params);
    const validation = validateCorridorParams(normalizedParams, false);
    if (validation.length > 0) {
        return null;
    }

    const derived = deriveCorridorMetrics(normalizedParams);
    if (!derived.ok) {
        return null;
    }

    const ref = polylineRef(normalizedParams.polyline);
    const localPolyline = toLocalPolyline(normalizedParams.polyline, ref);
    const localTransects = planLocalTransects(
        localPolyline,
        derived.metrics.triggerDistance_m,
        Math.max(normalizedParams.leftWidth_m, normalizedParams.rightWidth_m),
    );
    if (localTransects.length === 0) {
        return null;
    }

    const plannedTransects = localTransects.map((transect, index) =>
        expandTransect(
            transect,
            index,
            normalizedParams.leftWidth_m,
            normalizedParams.rightWidth_m,
            normalizedParams.turnaroundDistance_m,
            ref,
        )
    );

    return countMissionItems(plannedTransects, normalizedParams, derived.metrics.triggerDistance_m);
}

export function computeCorridorPolygon(
    polyline: GeoPoint2d[],
    leftWidth_m: number,
    rightWidth_m: number,
): GeoPoint2d[] {
    if (polyline.length < MIN_POLYLINE_POINTS) {
        return [];
    }

    if (!Number.isFinite(leftWidth_m) || leftWidth_m <= 0 || !Number.isFinite(rightWidth_m) || rightWidth_m <= 0) {
        return [];
    }

    const ref = polylineRef(polyline);
    const localPolyline = toLocalPolyline(polyline, ref);
    const leftOffsets = buildOffsetPath(localPolyline, leftWidth_m, "left");
    const rightOffsets = buildOffsetPath(localPolyline, rightWidth_m, "right");
    if (leftOffsets.length === 0 || rightOffsets.length === 0) {
        return [];
    }

    const ring = [...leftOffsets, ...[...rightOffsets].reverse()];
    if (ring.length < 3) {
        return [];
    }

    const dedupedRing = dedupeSequentialPoints(ring);
    if (dedupedRing.length < 3) {
        return [];
    }

    const closedRing = isSamePoint(dedupedRing[0], dedupedRing[dedupedRing.length - 1])
        ? dedupedRing
        : [...dedupedRing, dedupedRing[0]];

    return closedRing.map((point) => localPointToGeoWithRef(point, ref));
}

function normalizeCorridorParams(
    params: Omit<CorridorParams, "terrainLookup"> & Pick<CorridorParams, "terrainLookup">,
): CorridorParams {
    return {
        ...params,
        hoverHoldTime_s: params.hoverHoldTime_s ?? DEFAULT_HOVER_HOLD_TIME_S,
    };
}

function validateCorridorParams(
    params: CorridorParams,
    requireTerrainLookup: boolean,
): CorridorValidationError[] {
    const errors: CorridorValidationError[] = [];

    if (params.polyline.length < MIN_POLYLINE_POINTS) {
        errors.push({
            code: "too_few_points",
            message: `Corridor path must have at least 2 points (got ${params.polyline.length}).`,
        });
    }

    if (!Number.isFinite(params.leftWidth_m) || params.leftWidth_m <= 0) {
        errors.push({
            code: "invalid_width",
            message: `leftWidth_m must be a finite number greater than zero (got ${params.leftWidth_m}).`,
        });
    }

    if (!Number.isFinite(params.rightWidth_m) || params.rightWidth_m <= 0) {
        errors.push({
            code: "invalid_width",
            message: `rightWidth_m must be a finite number greater than zero (got ${params.rightWidth_m}).`,
        });
    }

    if (!Number.isFinite(params.altitude_m) || params.altitude_m <= 0) {
        errors.push({
            code: "invalid_altitude",
            message: `altitude_m must be a finite number greater than zero (got ${params.altitude_m}).`,
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

    if (!Number.isFinite(params.turnaroundDistance_m) || params.turnaroundDistance_m < 0) {
        errors.push({
            code: "invalid_turnaround_distance",
            message: `turnaroundDistance_m must be a finite number greater than or equal to zero (got ${params.turnaroundDistance_m}).`,
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

    try {
        groundSampleDistance(params.camera, params.altitude_m, params.orientation);
    } catch (error) {
        errors.push({
            code: "invalid_camera",
            message: error instanceof Error ? error.message : "Camera parameters are invalid.",
        });
    }

    return errors;
}

function deriveCorridorMetrics(
    params: CorridorParams,
):
    | { ok: true; metrics: DerivedMetrics }
    | { ok: false; errors: CorridorValidationError[] } {
    try {
        const laneSpacing_m = computeLaneSpacing(
            params.camera,
            params.altitude_m,
            params.sideOverlap_pct,
            params.orientation,
        );
        const triggerDistance_m = computeTriggerDistance(
            params.camera,
            params.altitude_m,
            params.frontOverlap_pct,
            params.orientation,
        );
        const gsd_m = groundSampleDistance(
            params.camera,
            params.altitude_m,
            params.orientation,
        );

        const errors: CorridorValidationError[] = [];

        if (!Number.isFinite(laneSpacing_m) || laneSpacing_m <= 0) {
            errors.push({
                code: "invalid_overlap",
                message: `Computed lane spacing must be greater than zero (got ${laneSpacing_m}). Reduce side overlap below 100%.`,
            });
        }

        if (!Number.isFinite(triggerDistance_m) || triggerDistance_m <= 0) {
            errors.push({
                code: "invalid_overlap",
                message: `Computed trigger distance must be greater than zero (got ${triggerDistance_m}). Reduce front overlap below 100%.`,
            });
        }

        if (errors.length > 0) {
            return { ok: false, errors };
        }

        return {
            ok: true,
            metrics: {
                laneSpacing_m,
                triggerDistance_m,
                gsd_m,
            },
        };
    } catch (error) {
        return {
            ok: false,
            errors: [{
                code: "invalid_camera",
                message: error instanceof Error ? error.message : "Failed to derive corridor survey metrics.",
            }],
        };
    }
}

function planLocalTransects(polyline: Vec2[], spacing_m: number, fanRadius_m: number): LocalTransect[] {
    const segments = buildSegments(polyline);
    if (segments.length === 0) {
        return [];
    }

    const transects: LocalTransect[] = [{
        center: segments[0].start,
        normal: segments[0].normal,
    }];

    for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index];
        for (let distance_m = spacing_m; distance_m < segment.length_m - PHOTO_COUNT_EPSILON_M; distance_m += spacing_m) {
            transects.push({
                center: {
                    x: segment.start.x + segment.direction.x * distance_m,
                    y: segment.start.y + segment.direction.y * distance_m,
                },
                normal: segment.normal,
            });
        }

        if (index < segments.length - 1) {
            const next = segments[index + 1];
            const fanNormals = interpolateFanNormals(
                segment.normal,
                next.normal,
                segment.direction,
                next.direction,
                spacing_m,
                fanRadius_m,
            );
            for (const normal of fanNormals) {
                transects.push({ center: segment.end, normal });
            }
        }
    }

    transects.push({
        center: segments[segments.length - 1].end,
        normal: segments[segments.length - 1].normal,
    });

    return dedupeTransects(transects);
}

function expandTransect(
    transect: LocalTransect,
    index: number,
    leftWidth_m: number,
    rightWidth_m: number,
    turnaroundDistance_m: number,
    ref: GeoRef,
): PlannedTransect {
    const leftBoundary = add(transect.center, scale(transect.normal, leftWidth_m));
    const rightBoundary = add(transect.center, scale(transect.normal, -rightWidth_m));
    const serpentineForward = index % 2 === 0;
    const start = serpentineForward ? leftBoundary : rightBoundary;
    const end = serpentineForward ? rightBoundary : leftBoundary;
    const direction = normalize(subtract(end, start));
    const leadIn = turnaroundDistance_m > 0
        ? add(start, scale(direction, -turnaroundDistance_m))
        : null;
    const leadOut = turnaroundDistance_m > 0
        ? add(end, scale(direction, turnaroundDistance_m))
        : null;

    return {
        start,
        end,
        leadIn,
        leadOut,
        length_m: distanceBetween(start, end),
        transect: [
            localPointToGeoWithRef(start, ref),
            localPointToGeoWithRef(end, ref),
        ],
    };
}

async function appendCorridorItems(
    items: MissionItem[],
    transects: PlannedTransect[],
    params: CorridorParams,
    triggerDistance_m: number,
    positionResolver: (point: GeoPoint2d) => Promise<GeoPoint3d>,
): Promise<void> {
    for (const transect of transects) {
        if (transect.leadIn) {
            items.push(createWaypointItem(await positionResolver(localPointToGeo(transect.leadIn, params.polyline))));
        }

        if (params.captureMode === "distance") {
            items.push(createTriggerDistanceItem(triggerDistance_m, true));
            items.push(createWaypointItem(await positionResolver(localPointToGeo(transect.start, params.polyline))));
            items.push(createWaypointItem(await positionResolver(localPointToGeo(transect.end, params.polyline))));
            items.push(createTriggerDistanceItem(0, false));
        } else {
            items.push(createTriggerDistanceItem(0, false));
            const photoPoints = samplePhotoPoints(transect.start, transect.end, triggerDistance_m)
                .map((point) => localPointToGeo(point, params.polyline));
            for (const photoPoint of photoPoints) {
                items.push(
                    createWaypointItem(
                        await positionResolver(photoPoint),
                        params.hoverHoldTime_s ?? DEFAULT_HOVER_HOLD_TIME_S,
                    ),
                );
                items.push(createImageStartCaptureItem());
            }
        }

        if (transect.leadOut) {
            items.push(createWaypointItem(await positionResolver(localPointToGeo(transect.leadOut, params.polyline))));
        }
    }
}

function countMissionItems(
    transects: PlannedTransect[],
    params: CorridorParams,
    triggerDistance_m: number,
): number {
    return transects.reduce((count, transect) => {
        const turnaroundItems = (transect.leadIn ? 1 : 0) + (transect.leadOut ? 1 : 0);
        if (params.captureMode === "distance") {
            return count + turnaroundItems + 4;
        }

        const photoCount = photoCountForTransect(transect.length_m, triggerDistance_m);
        return count + turnaroundItems + 1 + photoCount * 2;
    }, 0);
}

function createPositionResolver(params: CorridorParams) {
    const cache = new Map<string, Promise<GeoPoint3d>>();

    return async (point: GeoPoint2d): Promise<GeoPoint3d> => {
        const key = `${point.latitude_deg.toFixed(10)},${point.longitude_deg.toFixed(10)}`;
        const existing = cache.get(key);
        if (existing) {
            return existing;
        }

        const pending = (async () => {
            if (params.terrainFollow && params.terrainLookup) {
                const terrainElevation = await params.terrainLookup(point.latitude_deg, point.longitude_deg);
                if (terrainElevation !== null) {
                    return {
                        Terrain: {
                            latitude_deg: point.latitude_deg,
                            longitude_deg: point.longitude_deg,
                            altitude_terrain_m: params.altitude_m,
                        },
                    };
                }
            }

            return {
                RelHome: {
                    latitude_deg: point.latitude_deg,
                    longitude_deg: point.longitude_deg,
                    relative_alt_m: params.altitude_m,
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

function polylineRef(polyline: GeoPoint2d[]): GeoRef {
    let latitudeSum = 0;
    let longitudeSum = 0;
    for (const point of polyline) {
        latitudeSum += point.latitude_deg;
        longitudeSum += point.longitude_deg;
    }
    return {
        latitude_deg: latitudeSum / polyline.length,
        longitude_deg: longitudeSum / polyline.length,
    };
}

function toLocalPolyline(polyline: GeoPoint2d[], ref: GeoRef): Vec2[] {
    return polyline.map((point) => {
        const { x_m, y_m } = latLonToLocalXY(ref, point.latitude_deg, point.longitude_deg);
        return { x: x_m, y: y_m };
    });
}

function buildSegments(polyline: Vec2[]): Segment[] {
    const segments: Segment[] = [];
    for (let index = 0; index < polyline.length - 1; index += 1) {
        const start = polyline[index];
        const end = polyline[index + 1];
        const delta = subtract(end, start);
        const length_m = Math.hypot(delta.x, delta.y);
        if (length_m <= PHOTO_COUNT_EPSILON_M) {
            continue;
        }

        const direction = {
            x: delta.x / length_m,
            y: delta.y / length_m,
        };
        segments.push({
            start,
            end,
            direction,
            normal: leftNormal(direction),
            length_m,
        });
    }
    return segments;
}

function interpolateFanNormals(
    prevNormal: Vec2,
    nextNormal: Vec2,
    prevDirection: Vec2,
    nextDirection: Vec2,
    spacing_m: number,
    fanRadius_m: number,
): Vec2[] {
    const turnAngle = signedAngle(prevDirection, nextDirection);
    if (Math.abs(turnAngle) <= ANGLE_EPSILON_RAD) {
        return [normalize(add(prevNormal, nextNormal))];
    }

    const outerRadius_m = Math.max(fanRadius_m, PHOTO_COUNT_EPSILON_M);
    const arcLength_m = Math.abs(turnAngle) * outerRadius_m;
    const fanCount = Math.max(1, Math.ceil(arcLength_m / Math.max(spacing_m, PHOTO_COUNT_EPSILON_M)));
    const prevAngle = Math.atan2(prevNormal.y, prevNormal.x);
    const nextAngle = prevAngle + turnAngle;

    return Array.from({ length: fanCount }, (_, index) => {
        const t = (index + 1) / (fanCount + 1);
        const angle = prevAngle + (nextAngle - prevAngle) * t;
        return { x: Math.cos(angle), y: Math.sin(angle) };
    });
}

function buildOffsetPath(polyline: Vec2[], distance_m: number, side: "left" | "right"): Vec2[] {
    const segments = buildSegments(polyline);
    if (segments.length === 0) {
        return [];
    }

    const path: Vec2[] = [offsetPoint(segments[0].start, segments[0].normal, distance_m, side)];

    for (let index = 1; index < polyline.length - 1; index += 1) {
        const prev = segments[index - 1];
        const next = segments[index];
        const turn = crossZ(prev.direction, next.direction);
        const isOutsideTurn = side === "left" ? turn > 0 : turn < 0;

        if (isOutsideTurn) {
            const arcPoints = sampleJoinArc(polyline[index], prev.normal, next.normal, distance_m, side, turn);
            path.push(...arcPoints);
            continue;
        }

        const intersection = intersectOffsetLines(prev, next, polyline[index], distance_m, side);
        path.push(intersection ?? offsetPoint(polyline[index], normalize(add(prev.normal, next.normal)), distance_m, side));
    }

    path.push(offsetPoint(segments[segments.length - 1].end, segments[segments.length - 1].normal, distance_m, side));

    return dedupeSequentialPoints(path);
}

function offsetPoint(point: Vec2, normal: Vec2, distance_m: number, side: "left" | "right"): Vec2 {
    const signedDistance = side === "left" ? distance_m : -distance_m;
    return add(point, scale(normal, signedDistance));
}

function sampleJoinArc(
    center: Vec2,
    prevNormal: Vec2,
    nextNormal: Vec2,
    distance_m: number,
    side: "left" | "right",
    turn: number,
): Vec2[] {
    const startAngle = Math.atan2(prevNormal.y, prevNormal.x);
    const rawEndAngle = Math.atan2(nextNormal.y, nextNormal.x);
    const delta = normalizeArcDelta(rawEndAngle - startAngle, side, turn);
    const steps = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 8)));

    return Array.from({ length: steps }, (_, index) => {
        const t = (index + 1) / steps;
        const angle = startAngle + delta * t;
        const normal = { x: Math.cos(angle), y: Math.sin(angle) };
        return offsetPoint(center, normal, distance_m, side);
    });
}

function normalizeArcDelta(delta: number, side: "left" | "right", turn: number): number {
    let normalized = delta;
    while (normalized <= -Math.PI) {
        normalized += Math.PI * 2;
    }
    while (normalized > Math.PI) {
        normalized -= Math.PI * 2;
    }

    if ((side === "left" && turn > 0) || (side === "right" && turn < 0)) {
        if (normalized < 0) {
            normalized += Math.PI * 2;
        }
    } else if (normalized > 0) {
        normalized -= Math.PI * 2;
    }

    return normalized;
}

function intersectOffsetLines(
    prev: Segment,
    next: Segment,
    vertex: Vec2,
    distance_m: number,
    side: "left" | "right",
): Vec2 | null {
    const line1Point = offsetPoint(vertex, prev.normal, distance_m, side);
    const line2Point = offsetPoint(vertex, next.normal, distance_m, side);
    const intersection = lineIntersection(line1Point, prev.direction, line2Point, next.direction);
    return intersection;
}

function lineIntersection(pointA: Vec2, directionA: Vec2, pointB: Vec2, directionB: Vec2): Vec2 | null {
    const determinant = directionA.x * directionB.y - directionA.y * directionB.x;
    if (Math.abs(determinant) <= LINE_INTERSECTION_EPSILON) {
        return null;
    }

    const delta = subtract(pointB, pointA);
    const t = (delta.x * directionB.y - delta.y * directionB.x) / determinant;
    return add(pointA, scale(directionA, t));
}

function dedupeTransects(transects: LocalTransect[]): LocalTransect[] {
    const deduped: LocalTransect[] = [];
    for (const transect of transects) {
        const previous = deduped[deduped.length - 1];
        if (
            previous &&
            distanceBetween(previous.center, transect.center) <= 1e-6 &&
            distanceBetween(previous.normal, transect.normal) <= 1e-6
        ) {
            continue;
        }
        deduped.push({
            center: transect.center,
            normal: normalize(transect.normal),
        });
    }
    return deduped;
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

function computePolygonArea(polygon: GeoPoint2d[], ref: GeoRef): number {
    if (polygon.length < 4) {
        return 0;
    }

    const local = polygon.map((point) => {
        const { x_m, y_m } = latLonToLocalXY(ref, point.latitude_deg, point.longitude_deg);
        return { x: x_m, y: y_m };
    });
    const openLocal = isSamePoint(local[0], local[local.length - 1]) ? local.slice(0, -1) : local;
    return Math.abs(signedArea(openLocal));
}

function signedArea(points: Vec2[]): number {
    let area = 0;
    for (let index = 0; index < points.length; index += 1) {
        const nextIndex = (index + 1) % points.length;
        area += points[index].x * points[nextIndex].y;
        area -= points[nextIndex].x * points[index].y;
    }
    return area / 2;
}

function localPointToGeo(point: Vec2, polyline: GeoPoint2d[]): GeoPoint2d {
    return localPointToGeoWithRef(point, polylineRef(polyline));
}

function localPointToGeoWithRef(point: Vec2, ref: GeoRef): GeoPoint2d {
    const { lat, lon } = localXYToLatLon(ref, point.x, point.y);
    return { latitude_deg: lat, longitude_deg: lon };
}

function samplePhotoPoints(start: Vec2, end: Vec2, triggerDistance_m: number): Vec2[] {
    const length_m = distanceBetween(start, end);
    const photoCount = photoCountForTransect(length_m, triggerDistance_m);
    if (photoCount <= 1 || length_m === 0) {
        return [start];
    }

    return Array.from({ length: photoCount }, (_, index) => {
        const distance_m = Math.min(index * triggerDistance_m, length_m);
        const t = length_m === 0 ? 0 : distance_m / length_m;
        return {
            x: start.x + (end.x - start.x) * t,
            y: start.y + (end.y - start.y) * t,
        };
    });
}

function photoCountForTransect(length_m: number, triggerDistance_m: number): number {
    if (triggerDistance_m <= 0) {
        return 0;
    }
    return Math.max(1, Math.floor((length_m + PHOTO_COUNT_EPSILON_M) / triggerDistance_m) + 1);
}

function isValidOverlap(overlap: number): boolean {
    return Number.isFinite(overlap) && overlap >= 0 && overlap <= 100;
}

function leftNormal(direction: Vec2): Vec2 {
    return {
        x: -direction.y,
        y: direction.x,
    };
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
    if (magnitude <= PHOTO_COUNT_EPSILON_M) {
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

function crossZ(a: Vec2, b: Vec2): number {
    return a.x * b.y - a.y * b.x;
}

function signedAngle(a: Vec2, b: Vec2): number {
    return Math.atan2(crossZ(a, b), a.x * b.x + a.y * b.y);
}

function isSamePoint(a: Vec2, b: Vec2, epsilon = 1e-6): boolean {
    return distanceBetween(a, b) <= epsilon;
}
