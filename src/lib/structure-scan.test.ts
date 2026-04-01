import { describe, expect, it } from "vitest";

import {
    estimateStructureScanWaypointCount,
    generateStructureScan,
    type StructureScanParams,
} from "./structure-scan";
import {
    commandPosition,
    geoPoint3dAltitude,
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
    imageFootprint,
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

function polygonFromOffsets(offsets: LocalPoint[]): GeoPoint2d[] {
    return offsets.map(({ x, y }) => {
        const { lat, lon } = localXYToLatLon(TEST_REF, x, y);
        return { latitude_deg: lat, longitude_deg: lon };
    });
}

function squarePolygon(size_m = 40): GeoPoint2d[] {
    return polygonFromOffsets([
        { x: 0, y: 0 },
        { x: size_m, y: 0 },
        { x: size_m, y: size_m },
        { x: 0, y: size_m },
    ]);
}

function defaultParams(overrides: Partial<StructureScanParams> = {}): StructureScanParams {
    return {
        polygon: squarePolygon(40),
        camera: DJI_MAVIC_3E,
        orientation: "landscape",
        altitude_m: 12,
        structureHeight_m: 24,
        scanDistance_m: 18,
        layerCount: 3,
        layerOrder: "bottom_to_top",
        sideOverlap_pct: 70,
        frontOverlap_pct: 60,
        terrainFollow: false,
        captureMode: "distance",
        hoverHoldTime_s: 1,
        ...overrides,
    };
}

function assertSuccess(result: Awaited<ReturnType<typeof generateStructureScan>>) {
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

function mountItems(items: MissionItem[]): MissionItem[] {
    return doItems(items).filter((item) => {
        if (!("Do" in item.command) || typeof item.command.Do === "string") {
            return false;
        }
        return "MountControl" in item.command.Do;
    });
}

function triggerItems(items: MissionItem[]): MissionItem[] {
    return doItems(items).filter((item) => {
        if (!("Do" in item.command) || typeof item.command.Do === "string") {
            return false;
        }
        return "CamTriggerDistance" in item.command.Do;
    });
}

function imageCaptureItems(items: MissionItem[]): MissionItem[] {
    return doItems(items).filter((item) => {
        if (!("Do" in item.command) || typeof item.command.Do === "string") {
            return false;
        }
        return "ImageStartCapture" in item.command.Do;
    });
}

function positionOf(item: MissionItem): GeoPoint3d {
    const position = commandPosition(item.command);
    if (!position) {
        throw new Error("Expected mission item to carry a position.");
    }
    return position;
}

function localPointOfGeo(point: GeoPoint2d): LocalPoint {
    const { x_m, y_m } = latLonToLocalXY(TEST_REF, point.latitude_deg, point.longitude_deg);
    return { x: x_m, y: y_m };
}

function distanceBetween(a: LocalPoint, b: LocalPoint): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function polygonCentroid(points: GeoPoint2d[]): GeoPoint2d {
    let latitudeSum = 0;
    let longitudeSum = 0;
    for (const point of points) {
        latitudeSum += point.latitude_deg;
        longitudeSum += point.longitude_deg;
    }
    return {
        latitude_deg: latitudeSum / points.length,
        longitude_deg: longitudeSum / points.length,
    };
}

function yawTowardCentroid(point: GeoPoint2d, centroid: GeoPoint2d): number {
    const { x_m, y_m } = latLonToLocalXY(
        { latitude_deg: point.latitude_deg, longitude_deg: point.longitude_deg },
        centroid.latitude_deg,
        centroid.longitude_deg,
    );
    let yaw = (Math.atan2(x_m, y_m) * 180) / Math.PI;
    if (yaw < 0) {
        yaw += 360;
    }
    return yaw;
}

describe("generateStructureScan", () => {
    it("builds a multi-layer orbit from a square footprint and reports scan stats", async () => {
        const result = assertSuccess(await generateStructureScan(defaultParams()));

        expect(result.layers).toHaveLength(3);
        expect(result.stats.layerCount).toBe(3);
        expect(result.stats.photoCount).toBe(result.stats.photosPerLayer * 3);
        expect(result.stats.gsd_m).toBeCloseTo(
            groundSampleDistance(DJI_MAVIC_3E, 18, "landscape"),
            12,
        );

        for (const layer of result.layers) {
            expect(layer.photoCount).toBe(result.stats.photosPerLayer);
            expect(layer.orbitPoints[0]).toEqual(layer.orbitPoints[layer.orbitPoints.length - 1]);
            expect(layer.orbitPoints.length).toBeGreaterThan(4);
        }
    });

    it("distributes layer altitudes by midpoint and respects bottom-to-top / top-to-bottom ordering", async () => {
        const bottomToTop = assertSuccess(await generateStructureScan(defaultParams({ layerCount: 4, structureHeight_m: 20 })));
        expect(bottomToTop.layers.map((layer) => layer.altitude_m)).toEqual([14.5, 19.5, 24.5, 29.5]);

        const topToBottom = assertSuccess(
            await generateStructureScan(defaultParams({ layerCount: 4, structureHeight_m: 20, layerOrder: "top_to_bottom" })),
        );
        expect(topToBottom.layers.map((layer) => layer.altitude_m)).toEqual([29.5, 24.5, 19.5, 14.5]);
    });

    it("computes gimbal pitch with the expected sign convention, including downward top layers", async () => {
        const result = assertSuccess(await generateStructureScan(defaultParams({ layerCount: 3, structureHeight_m: 30 })));
        const [bottom, middle, top] = result.layers;

        expect(bottom.gimbalPitch_deg).toBeGreaterThan(0);
        expect(middle.gimbalPitch_deg).toBeCloseTo(0, 6);
        expect(top.gimbalPitch_deg).toBeLessThan(0);

        const firstLayerMount = mountItems(result.items)[0];
        expect(firstLayerMount.command).toMatchObject({
            Do: {
                MountControl: {
                    pitch_deg: bottom.gimbalPitch_deg,
                },
            },
        });
    });

    it("aims mount yaw toward the structure centroid for each orbit waypoint", async () => {
        const result = assertSuccess(await generateStructureScan(defaultParams({ layerCount: 1 })));
        const centroid = polygonCentroid(defaultParams().polygon);
        const firstOrbitPoint = result.layers[0].orbitPoints[0];
        const firstMount = mountItems(result.items)[0];

        if (!("Do" in firstMount.command) || typeof firstMount.command.Do === "string" || !("MountControl" in firstMount.command.Do)) {
            throw new Error("Expected first mission item to be a mount control command.");
        }

        expect(firstMount.command.Do.MountControl.yaw_deg).toBeCloseTo(
            yawTowardCentroid(firstOrbitPoint, centroid),
            6,
        );
    });

    it("samples orbit waypoints from camera footprint spacing at scan distance", async () => {
        const params = defaultParams({ layerCount: 1, sideOverlap_pct: 65 });
        const result = assertSuccess(await generateStructureScan(params));
        const uniquePoints = result.layers[0].orbitPoints.slice(0, -1).map(localPointOfGeo);
        const desiredSpacing = imageFootprint(DJI_MAVIC_3E, params.scanDistance_m, params.orientation).width_m * 0.35;

        const segmentDistances = uniquePoints.map((point, index) =>
            distanceBetween(point, uniquePoints[(index + 1) % uniquePoints.length])
        );
        const averageSpacing = segmentDistances.reduce((sum, distance) => sum + distance, 0) / segmentDistances.length;

        expect(result.stats.triggerDistance_m).toBeCloseTo(desiredSpacing, 12);
        expect(averageSpacing).toBeLessThanOrEqual(desiredSpacing * 1.05);
        expect(averageSpacing).toBeGreaterThan(desiredSpacing * 0.55);
    });

    it("scopes trigger start and stop per layer without leaving capture enabled between layers", async () => {
        const result = assertSuccess(await generateStructureScan(defaultParams({ layerCount: 2 })));
        const triggers = triggerItems(result.items);

        expect(triggers).toHaveLength(4);
        expect(triggers[0].command).toMatchObject({
            Do: {
                CamTriggerDistance: {
                    meters: result.stats.triggerDistance_m,
                    trigger_now: true,
                },
            },
        });
        expect(triggers[1].command).toEqual({
            Do: {
                CamTriggerDistance: {
                    meters: 0,
                    trigger_now: false,
                },
            },
        });
        expect(triggers[2].command).toMatchObject({
            Do: {
                CamTriggerDistance: {
                    meters: result.stats.triggerDistance_m,
                    trigger_now: true,
                },
            },
        });
        expect(triggers[3].command).toEqual({
            Do: {
                CamTriggerDistance: {
                    meters: 0,
                    trigger_now: false,
                },
            },
        });
    });

    it("uses hover-and-capture mode with hold-time waypoints and image capture commands", async () => {
        const result = assertSuccess(
            await generateStructureScan(defaultParams({ captureMode: "hover", hoverHoldTime_s: 2.5, layerCount: 2 })),
        );

        const captures = imageCaptureItems(result.items);
        const navs = navItems(result.items);
        const triggers = triggerItems(result.items);

        expect(captures.length).toBe(result.stats.photoCount);
        expect(navs.length).toBe(result.stats.photoCount);
        expect(triggers).toHaveLength(2);
        expect(triggers.every((item) => JSON.stringify(item.command) === JSON.stringify({
            Do: {
                CamTriggerDistance: {
                    meters: 0,
                    trigger_now: false,
                },
            },
        }))).toBe(true);

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

    it("uses Terrain waypoints when lookup succeeds and falls back to RelHome when it returns null", async () => {
        const result = assertSuccess(
            await generateStructureScan(
                defaultParams({
                    terrainFollow: true,
                    layerCount: 1,
                    terrainLookup: async (_lat, lon) => (lon > TEST_REF.longitude_deg + 0.0003 ? null : 150),
                }),
            ),
        );

        const positions = navItems(result.items).map((item) => positionOf(item));
        expect(positions.some((position) => "Terrain" in position)).toBe(true);
        expect(positions.some((position) => "RelHome" in position)).toBe(true);

        const terrainPosition = positions.find((position) => "Terrain" in position);
        if (!terrainPosition || !("Terrain" in terrainPosition)) {
            throw new Error("Expected a Terrain waypoint.");
        }
        expect(geoPoint3dAltitude(terrainPosition)).toEqual({
            value: result.layers[0].altitude_m,
            frame: "terrain",
        });
    });

    it("keeps estimateStructureScanWaypointCount in parity with the generated mission item count", async () => {
        const params = defaultParams({ layerCount: 2, captureMode: "hover", hoverHoldTime_s: 2 });
        const result = assertSuccess(await generateStructureScan(params));
        expect(estimateStructureScanWaypointCount({ ...params })).toBe(result.items.length);
    });

    it("returns structured validation errors for invalid geometry, dimensions, overlap, and terrain settings", async () => {
        const tooFew = await generateStructureScan(defaultParams({ polygon: [] }));
        expect(tooFew.ok).toBe(false);
        if (!tooFew.ok) {
            expect(tooFew.errors.some((error) => error.code === "too_few_points")).toBe(true);
        }

        const badHeight = await generateStructureScan(defaultParams({ structureHeight_m: 0 }));
        expect(badHeight.ok).toBe(false);
        if (!badHeight.ok) {
            expect(badHeight.errors.some((error) => error.code === "invalid_structure_height")).toBe(true);
        }

        const badDistance = await generateStructureScan(defaultParams({ scanDistance_m: 0 }));
        expect(badDistance.ok).toBe(false);
        if (!badDistance.ok) {
            expect(badDistance.errors.some((error) => error.code === "invalid_scan_distance")).toBe(true);
        }

        const badOverlap = await generateStructureScan(defaultParams({ sideOverlap_pct: 100 }));
        expect(badOverlap.ok).toBe(false);
        if (!badOverlap.ok) {
            expect(badOverlap.errors.some((error) => error.code === "invalid_overlap")).toBe(true);
        }

        const missingTerrain = await generateStructureScan(defaultParams({ terrainFollow: true }));
        expect(missingTerrain.ok).toBe(false);
        if (!missingTerrain.ok) {
            expect(missingTerrain.errors.some((error) => error.code === "missing_terrain_lookup")).toBe(true);
        }

        const invalidCamera = await generateStructureScan(defaultParams({
            camera: {
                ...DJI_MAVIC_3E,
                focalLength_mm: 0,
            },
        }));
        expect(invalidCamera.ok).toBe(false);
        if (!invalidCamera.ok) {
            expect(invalidCamera.errors.some((error) => error.code === "invalid_camera")).toBe(true);
        }
    });

    it("uses the convex hull envelope for concave footprints so the orbit stays conservative", async () => {
        const result = assertSuccess(
            await generateStructureScan(defaultParams({
                layerCount: 1,
                polygon: polygonFromOffsets([
                    { x: 0, y: 0 },
                    { x: 80, y: 0 },
                    { x: 80, y: 30 },
                    { x: 30, y: 30 },
                    { x: 30, y: 80 },
                    { x: 0, y: 80 },
                ]),
                scanDistance_m: 10,
            })),
        );

        const orbitLocal = result.layers[0].orbitPoints.slice(0, -1).map(localPointOfGeo);
        expect(orbitLocal.some((point) => point.x > 45 && point.y > 45)).toBe(true);
    });

    it("never marks generated mission items as current", async () => {
        const result = assertSuccess(await generateStructureScan(defaultParams({ layerCount: 2 })));
        expect(result.items.every((item) => item.current === false)).toBe(true);
    });

    it("uses the per-layer orbit altitude in emitted waypoint frames", async () => {
        const result = assertSuccess(await generateStructureScan(defaultParams({ layerCount: 2 })));
        const waypoints = navItems(result.items);
        expect(waypoints.length).toBeGreaterThan(0);

        const firstAltitude = geoPoint3dAltitude(positionOf(waypoints[0]));
        const secondLayerWaypoint = waypoints.find((item) => {
            const altitude = geoPoint3dAltitude(positionOf(item));
            return altitude.value === result.layers[1].altitude_m;
        });

        expect(firstAltitude).toEqual({ value: result.layers[0].altitude_m, frame: "rel_home" });
        expect(secondLayerWaypoint).toBeDefined();
    });
});
