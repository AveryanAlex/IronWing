import { describe, expect, it } from "vitest";

import {
    computeCorridorPolygon,
    estimateCorridorWaypointCount,
    generateCorridor,
    type CorridorParams,
} from "./corridor-scan";
import {
    commandPosition,
    geoPoint3dAltitude,
    geoPoint3dLatLon,
    type GeoPoint2d,
    type GeoPoint3d,
    type MissionItem,
} from "./mavkit-types";
import {
    latLonToLocalXY,
    localXYToLatLon,
    type GeoRef,
} from "./mission-coordinates";
import {
    groundSampleDistance,
    laneSpacing,
    triggerDistance,
    type CameraSpec,
} from "./survey-camera";

const TEST_REF: GeoRef = {
    latitude_deg: 47.38,
    longitude_deg: 8.54,
};

const DJI_MAVIC_3E: CameraSpec = {
    sensorWidth_mm: 17.3,
    sensorHeight_mm: 13,
    imageWidth_px: 5280,
    imageHeight_px: 3956,
    focalLength_mm: 12.29,
    minTriggerInterval_s: 0.7,
};

type LocalPoint = { x: number; y: number };

function polylineFromOffsets(offsets: LocalPoint[]): GeoPoint2d[] {
    return offsets.map(({ x, y }) => {
        const { lat, lon } = localXYToLatLon(TEST_REF, x, y);
        return { latitude_deg: lat, longitude_deg: lon };
    });
}

function defaultParams(overrides: Partial<CorridorParams> = {}): CorridorParams {
    return {
        polyline: polylineFromOffsets([
            { x: 0, y: 0 },
            { x: 120, y: 0 },
        ]),
        camera: DJI_MAVIC_3E,
        orientation: "landscape",
        altitude_m: 50,
        sideOverlap_pct: 70,
        frontOverlap_pct: 80,
        leftWidth_m: 40,
        rightWidth_m: 60,
        turnaroundDistance_m: 15,
        terrainFollow: false,
        captureMode: "distance",
        hoverHoldTime_s: 1,
        ...overrides,
    };
}

function assertSuccess(result: Awaited<ReturnType<typeof generateCorridor>>) {
    expect(result.ok).toBe(true);
    if (!result.ok) {
        throw new Error(`Expected success result, received: ${JSON.stringify(result.errors)}`);
    }
    return result;
}

function navItems(items: MissionItem[]): MissionItem[] {
    return items.filter((item) => "Nav" in item.command);
}

function doItems(items: MissionItem[]): MissionItem[] {
    return items.filter((item) => "Do" in item.command);
}

function positionOf(item: MissionItem): GeoPoint3d {
    const position = commandPosition(item.command);
    if (!position) {
        throw new Error("Expected mission item to carry a position.");
    }
    return position;
}

function latLonOf(item: MissionItem): { latitude_deg: number; longitude_deg: number } {
    return geoPoint3dLatLon(positionOf(item));
}

function localPointOf(item: MissionItem): LocalPoint {
    const { latitude_deg, longitude_deg } = latLonOf(item);
    const { x_m, y_m } = latLonToLocalXY(TEST_REF, latitude_deg, longitude_deg);
    return { x: x_m, y: y_m };
}

function localPointFromGeo(point: GeoPoint2d): LocalPoint {
    const { x_m, y_m } = latLonToLocalXY(TEST_REF, point.latitude_deg, point.longitude_deg);
    return { x: x_m, y: y_m };
}

function localTransect(transect: Array<{ latitude_deg: number; longitude_deg: number }>) {
    return transect.map((point) => localPointFromGeo(point));
}

function dot(a: LocalPoint, b: LocalPoint): number {
    return a.x * b.x + a.y * b.y;
}

function subtract(a: LocalPoint, b: LocalPoint): LocalPoint {
    return { x: a.x - b.x, y: a.y - b.y };
}

function distanceBetween(a: LocalPoint, b: LocalPoint): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function distancePointToSegment(point: LocalPoint, start: LocalPoint, end: LocalPoint): number {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) {
        return distanceBetween(point, start);
    }

    const projection =
        ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
    const clamped = Math.max(0, Math.min(1, projection));
    const closest = {
        x: start.x + dx * clamped,
        y: start.y + dy * clamped,
    };
    return distanceBetween(point, closest);
}

function polygonArea(points: LocalPoint[]): number {
    const ring = points[0].x === points[points.length - 1].x && points[0].y === points[points.length - 1].y
        ? points.slice(0, -1)
        : points;
    let area = 0;
    for (let index = 0; index < ring.length; index += 1) {
        const next = ring[(index + 1) % ring.length];
        area += ring[index].x * next.y - next.x * ring[index].y;
    }
    return Math.abs(area / 2);
}

describe("generateCorridor", () => {
    it("builds a straight corridor with expected transect count, spacing-derived stats, and perpendicular transects", async () => {
        const params = defaultParams();
        const result = assertSuccess(await generateCorridor(params));

        const expectedTriggerDistance = triggerDistance(DJI_MAVIC_3E, 50, 80, "landscape");
        const expectedLaneSpacing = laneSpacing(DJI_MAVIC_3E, 50, 70, "landscape");
        const expectedTransects = Math.floor(120 / expectedTriggerDistance) + 2;

        expect(result.transects).toHaveLength(expectedTransects);
        expect(result.crosshatchTransects).toEqual([]);
        expect(result.stats.laneCount).toBe(expectedTransects);
        expect(result.stats.crosshatchLaneCount).toBe(0);
        expect(result.stats.triggerDistance_m).toBeCloseTo(expectedTriggerDistance, 12);
        expect(result.stats.laneSpacing_m).toBeCloseTo(expectedLaneSpacing, 12);

        const corridorDirection = { x: 120, y: 0 };
        for (const transect of result.transects) {
            const [start, end] = localTransect(transect);
            const direction = subtract(end, start);
            expect(Math.abs(dot(direction, corridorDirection))).toBeLessThan(1e-3);
        }
    });

    it("applies asymmetric left/right widths to transect endpoints", async () => {
        const result = assertSuccess(
            await generateCorridor(defaultParams({ leftWidth_m: 30, rightWidth_m: 70, turnaroundDistance_m: 0 })),
        );

        const [firstStart, firstEnd] = localTransect(result.transects[0]);
        const ys = [firstStart.y, firstEnd.y].sort((a, b) => a - b);
        expect(ys[0]).toBeCloseTo(-70, 6);
        expect(ys[1]).toBeCloseTo(30, 6);
    });

    it("fans transects around a sharp bend instead of keeping a single fixed heading", async () => {
        const result = assertSuccess(
            await generateCorridor(
                defaultParams({
                    polyline: polylineFromOffsets([
                        { x: 0, y: 0 },
                        { x: 80, y: 0 },
                        { x: 80, y: 80 },
                    ]),
                    turnaroundDistance_m: 0,
                }),
            ),
        );

        const bendPoint = { x: 80, y: 0 };
        const centerTransects = result.transects.filter((transect) => {
            const [start, end] = localTransect(transect);
            return distancePointToSegment(bendPoint, start, end) < 0.5;
        });

        expect(centerTransects.length).toBeGreaterThanOrEqual(2);

        const orientations = centerTransects.map((transect) => {
            const [start, end] = localTransect(transect);
            return Math.atan2(end.y - start.y, end.x - start.x);
        });

        const spread = Math.max(...orientations) - Math.min(...orientations);
        expect(spread).toBeGreaterThan(0.5);
    });

    it("extends lead-in and lead-out by the requested turnaround distance", async () => {
        const result = assertSuccess(await generateCorridor(defaultParams({ turnaroundDistance_m: 25 })));

        const leadIn = localPointOf(result.items[0]);
        const runStart = localPointOf(result.items[2]);
        const runEnd = localPointOf(result.items[3]);
        const leadOut = localPointOf(result.items[5]);

        expect(distanceBetween(leadIn, runStart)).toBeCloseTo(25, 6);
        expect(distanceBetween(runEnd, leadOut)).toBeCloseTo(25, 6);
    });

    it("scopes distance triggering per transect with start/stop pairs bracketing each photo run", async () => {
        const result = assertSuccess(await generateCorridor(defaultParams({ turnaroundDistance_m: 10 })));

        for (let transectIndex = 0; transectIndex < result.transects.length; transectIndex += 1) {
            const offset = transectIndex * 6;
            expect(result.items[offset + 1].command).toEqual({
                Do: {
                    CamTriggerDistance: {
                        meters: result.stats.triggerDistance_m,
                        trigger_now: true,
                    },
                },
            });
            expect(result.items[offset + 4].command).toEqual({
                Do: {
                    CamTriggerDistance: {
                        meters: 0,
                        trigger_now: false,
                    },
                },
            });
        }
    });

    it("uses hover capture waypoint+image pairs and disables distance triggering for each transect", async () => {
        const result = assertSuccess(
            await generateCorridor(
                defaultParams({
                    captureMode: "hover",
                    hoverHoldTime_s: 2.5,
                    turnaroundDistance_m: 0,
                }),
            ),
        );

        const disableTriggers = doItems(result.items).filter((item) =>
            JSON.stringify(item.command) === JSON.stringify({
                Do: {
                    CamTriggerDistance: {
                        meters: 0,
                        trigger_now: false,
                    },
                },
            })
        );
        const captures = doItems(result.items).filter((item) => {
            if (!("Do" in item.command) || typeof item.command.Do === "string") {
                return false;
            }
            return "ImageStartCapture" in item.command.Do;
        });
        const navs = navItems(result.items);

        expect(disableTriggers).toHaveLength(result.transects.length);
        expect(captures.length).toBe(result.stats.photoCount);
        expect(navs.length).toBe(result.stats.photoCount);

        for (const item of navs) {
            expect(item.command).toMatchObject({
                Nav: {
                    Waypoint: {
                        hold_time_s: 2.5,
                    },
                },
            });
        }
    });

    it("uses Terrain frame when lookup resolves and RelHome fallback when it returns null", async () => {
        const result = assertSuccess(
            await generateCorridor(
                defaultParams({
                    terrainFollow: true,
                    terrainLookup: async (_lat, lon) => (lon > TEST_REF.longitude_deg + 0.0005 ? null : 123),
                }),
            ),
        );

        const positions = navItems(result.items).map((item) => positionOf(item));
        expect(positions.some((position) => "Terrain" in position)).toBe(true);
        expect(positions.some((position) => "RelHome" in position)).toBe(true);

        const terrainPosition = positions.find((position) => "Terrain" in position);
        if (!terrainPosition || !("Terrain" in terrainPosition)) {
            throw new Error("Expected at least one Terrain waypoint.");
        }
        expect(geoPoint3dAltitude(terrainPosition)).toEqual({
            value: 50,
            frame: "terrain",
        });
    });

    it("reports stats with camera GSD, computed area, lane count, and no crosshatch lanes", async () => {
        const result = assertSuccess(await generateCorridor(defaultParams({ turnaroundDistance_m: 0 })));
        const polygonLocal = result.corridorPolygon.map(localPointFromGeo);

        expect(result.stats.gsd_m).toBeCloseTo(
            groundSampleDistance(DJI_MAVIC_3E, 50, "landscape"),
            12,
        );
        expect(result.stats.photoCount).toBeGreaterThan(0);
        expect(result.stats.area_m2).toBeCloseTo(polygonArea(polygonLocal), 3);
        expect(result.stats.area_m2).toBeCloseTo(120 * (40 + 60), 0);
        expect(result.stats.laneCount).toBe(result.transects.length);
        expect(result.stats.crosshatchLaneCount).toBe(0);
    });

    it("keeps estimateCorridorWaypointCount consistent with generated item count", async () => {
        const params = defaultParams({ turnaroundDistance_m: 10 });
        const result = assertSuccess(await generateCorridor(params));
        expect(estimateCorridorWaypointCount({ ...params })).toBe(result.items.length);
    });

    it("builds a closed asymmetric corridor polygon for live preview", () => {
        const polygon = computeCorridorPolygon(
            polylineFromOffsets([
                { x: 0, y: 0 },
                { x: 120, y: 0 },
            ]),
            20,
            50,
        );

        expect(polygon.length).toBeGreaterThanOrEqual(5);
        expect(polygon[0]).toEqual(polygon[polygon.length - 1]);

        const local = polygon.map(localPointFromGeo);
        const ys = local.map((point) => point.y);
        expect(Math.max(...ys)).toBeCloseTo(20, 6);
        expect(Math.min(...ys)).toBeCloseTo(-50, 6);
    });

    it("returns validation errors for too few points, invalid width, invalid altitude, and invalid camera", async () => {
        const tooFew = await generateCorridor(defaultParams({ polyline: [] }));
        expect(tooFew.ok).toBe(false);
        if (!tooFew.ok) {
            expect(tooFew.errors.some((error) => error.code === "too_few_points")).toBe(true);
        }

        const zeroWidth = await generateCorridor(defaultParams({ leftWidth_m: 0 }));
        expect(zeroWidth.ok).toBe(false);
        if (!zeroWidth.ok) {
            expect(zeroWidth.errors.some((error) => error.code === "invalid_width")).toBe(true);
        }

        const negativeWidth = await generateCorridor(defaultParams({ rightWidth_m: -5 }));
        expect(negativeWidth.ok).toBe(false);
        if (!negativeWidth.ok) {
            expect(negativeWidth.errors.some((error) => error.code === "invalid_width")).toBe(true);
        }

        const invalidAltitude = await generateCorridor(defaultParams({ altitude_m: 0 }));
        expect(invalidAltitude.ok).toBe(false);
        if (!invalidAltitude.ok) {
            expect(invalidAltitude.errors.some((error) => error.code === "invalid_altitude")).toBe(true);
        }

        const invalidCamera = await generateCorridor(
            defaultParams({
                camera: {
                    ...DJI_MAVIC_3E,
                    focalLength_mm: 0,
                },
            }),
        );
        expect(invalidCamera.ok).toBe(false);
        if (!invalidCamera.ok) {
            expect(invalidCamera.errors.some((error) => error.code === "invalid_camera")).toBe(true);
        }
    });
});
