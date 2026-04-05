import { describe, expect, it } from "vitest";

import type { ParsedSurveyRegion } from "./mission-plan-io";
import type { TypedDraftItem } from "./mission-draft-typed";
import type { MissionItem } from "./mavkit-types";
import { defaultGeoPoint3d } from "./mavkit-types";
import type { CatalogCamera } from "./survey-camera-catalog";
import { getBuiltinCameras } from "./survey-camera-catalog";
import type { CorridorResult } from "./corridor-scan";
import type { StructureScanResult } from "./structure-scan";
import type { SurveyResult, SurveyStats, SurveyTransect } from "./survey-grid";
import {
    addSurveyRegion,
    applyGenerationResult,
    createCorridorRegion,
    createStructureRegion,
    createSurveyDraftExtension,
    createSurveyRegion,
    dissolveRegion,
    dissolveSurveyRegion,
    flattenRegionsToItems,
    hydrateSurveyRegion,
    markItemEdited,
    moveSurveyRegionTo,
    regionHasManualEdits,
    regionItemCount,
    removeSurveyRegion,
    toExportableSurveyRegion,
    updateSurveyRegion,
} from "./survey-region";

const POLYGON = [
    { latitude_deg: 47.1, longitude_deg: 8.1 },
    { latitude_deg: 47.2, longitude_deg: 8.1 },
    { latitude_deg: 47.2, longitude_deg: 8.2 },
    { latitude_deg: 47.1, longitude_deg: 8.2 },
];

const POLYLINE = [
    { latitude_deg: 47.1, longitude_deg: 8.1 },
    { latitude_deg: 47.15, longitude_deg: 8.16 },
    { latitude_deg: 47.2, longitude_deg: 8.2 },
];

const CORRIDOR_POLYGON = [
    { latitude_deg: 47.09, longitude_deg: 8.08 },
    { latitude_deg: 47.22, longitude_deg: 8.21 },
    { latitude_deg: 47.21, longitude_deg: 8.23 },
    { latitude_deg: 47.08, longitude_deg: 8.1 },
    { latitude_deg: 47.09, longitude_deg: 8.08 },
];

const CAMERA: CatalogCamera = {
    canonicalName: "sony-rx1r",
    brand: "Sony",
    model: "RX1R",
    sensorWidth_mm: 35.8,
    sensorHeight_mm: 23.9,
    imageWidth_px: 7952,
    imageHeight_px: 5304,
    focalLength_mm: 35,
    landscape: true,
    fixedOrientation: false,
};
const BUILTIN_CAMERA = getBuiltinCameras()[0]!;

function makeWaypoint(lat: number, lon: number, alt: number): MissionItem {
    return {
        command: {
            Nav: {
                Waypoint: {
                    position: defaultGeoPoint3d(lat, lon, alt),
                    hold_time_s: 0,
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

function makeDraftItem(index: number, item: MissionItem): TypedDraftItem {
    return {
        uiId: index + 1,
        index,
        document: item,
        readOnly: false,
        preview: {
            latitude_deg: null,
            longitude_deg: null,
            altitude_m: null,
        },
    };
}

function makeTransect(startLat: number, startLon: number, endLat: number, endLon: number): SurveyTransect {
    return [
        { latitude_deg: startLat, longitude_deg: startLon },
        { latitude_deg: endLat, longitude_deg: endLon },
    ];
}

function makeStats(): SurveyStats {
    return {
        gsd_m: 0.018,
        photoCount: 24,
        area_m2: 18000,
        triggerDistance_m: 12,
        laneSpacing_m: 18,
        laneCount: 4,
        crosshatchLaneCount: 2,
    };
}

function makeStructureSuccessResult(items: MissionItem[]): StructureScanResult {
    return {
        ok: true,
        items,
        layers: [
            {
                altitude_m: 56,
                gimbalPitch_deg: -12,
                orbitPoints: [
                    { latitude_deg: 47.11, longitude_deg: 8.11 },
                    { latitude_deg: 47.12, longitude_deg: 8.11 },
                    { latitude_deg: 47.12, longitude_deg: 8.12 },
                    { latitude_deg: 47.11, longitude_deg: 8.12 },
                    { latitude_deg: 47.11, longitude_deg: 8.11 },
                ],
                photoCount: 4,
            },
            {
                altitude_m: 62,
                gimbalPitch_deg: 0,
                orbitPoints: [
                    { latitude_deg: 47.111, longitude_deg: 8.111 },
                    { latitude_deg: 47.121, longitude_deg: 8.111 },
                    { latitude_deg: 47.121, longitude_deg: 8.121 },
                    { latitude_deg: 47.111, longitude_deg: 8.121 },
                    { latitude_deg: 47.111, longitude_deg: 8.111 },
                ],
                photoCount: 4,
            },
        ],
        stats: {
            gsd_m: 0.012,
            photoCount: 8,
            layerCount: 2,
            photosPerLayer: 4,
            layerSpacing_m: 6,
            triggerDistance_m: 10,
            estimatedFlightTime_s: 84,
        },
        params: {
            polygon: POLYGON,
            camera: CAMERA,
            orientation: "landscape",
            altitude_m: 50,
            structureHeight_m: 12,
            scanDistance_m: 15,
            layerCount: 2,
            layerOrder: "bottom_to_top",
            sideOverlap_pct: 70,
            frontOverlap_pct: 80,
            terrainFollow: false,
            captureMode: "distance",
        },
    };
}

function makeSuccessResult(items: MissionItem[]): SurveyResult {
    return {
        ok: true,
        items,
        transects: [makeTransect(47.1, 8.1, 47.2, 8.1)],
        crosshatchTransects: [makeTransect(47.1, 8.15, 47.2, 8.15)],
        stats: makeStats(),
        params: {
            polygon: POLYGON,
            camera: CAMERA,
            orientation: "landscape",
            altitude_m: 50,
            sideOverlap_pct: 70,
            frontOverlap_pct: 80,
            trackAngle_deg: 0,
            startCorner: "bottom_left",
            turnDirection: "clockwise",
            crosshatch: true,
            turnaroundDistance_m: 0,
            terrainFollow: false,
            captureMode: "distance",
        },
    };
}

function makeCorridorSuccessResult(items: MissionItem[]): CorridorResult {
    return {
        ok: true,
        items,
        transects: [makeTransect(47.1, 8.1, 47.12, 8.12)],
        crosshatchTransects: [],
        stats: {
            ...makeStats(),
            laneCount: 3,
            crosshatchLaneCount: 0,
        },
        params: {
            polyline: POLYLINE,
            camera: CAMERA,
            orientation: "landscape",
            altitude_m: 50,
            sideOverlap_pct: 70,
            frontOverlap_pct: 80,
            leftWidth_m: 50,
            rightWidth_m: 60,
            turnaroundDistance_m: 10,
            terrainFollow: false,
            captureMode: "distance",
        },
        corridorPolygon: CORRIDOR_POLYGON,
    };
}

function makeParsedRegion(overrides: Partial<ParsedSurveyRegion> = {}): ParsedSurveyRegion {
    return {
        patternType: "grid",
        position: 0,
        polygon: POLYGON,
        polyline: [],
        camera: { canonicalName: CAMERA.canonicalName },
        params: {
            altitude_m: 65,
            frontOverlap_pct: 82,
        },
        embeddedItems: [makeWaypoint(47.14, 8.14, 55)],
        qgcPassthrough: {
            complexItemType: "survey",
            TransectStyleComplexItem: {
                CameraCalc: {
                    CameraName: CAMERA.canonicalName,
                    SensorWidth: CAMERA.sensorWidth_mm,
                    SensorHeight: CAMERA.sensorHeight_mm,
                    ImageWidth: CAMERA.imageWidth_px,
                    ImageHeight: CAMERA.imageHeight_px,
                    FocalLength: CAMERA.focalLength_mm,
                    Landscape: CAMERA.landscape,
                    FixedOrientation: CAMERA.fixedOrientation,
                },
            },
        },
        warnings: ["CameraTriggerInTurnAround was preserved."],
        ...overrides,
    };
}

describe("survey-region", () => {
    it("createSurveyRegion produces valid defaults with sensible param values", () => {
        const region = createSurveyRegion(POLYGON);

        expect(region.id).toMatch(/^survey-region-\d+$/);
        expect(region.patternType).toBe("grid");
        expect(region.polygon).toEqual(POLYGON);
        expect(region.polyline).toEqual([]);
        expect(region.corridorPolygon).toEqual([]);
        expect(region.cameraId).toBeNull();
        expect(region.camera).toBeNull();
        expect(region.params).toEqual({
            sideOverlap_pct: 70,
            frontOverlap_pct: 80,
            altitude_m: 50,
            trackAngle_deg: 0,
            orientation: "landscape",
            crosshatch: false,
            turnaroundDistance_m: 0,
            terrainFollow: false,
            captureMode: "distance",
            startCorner: "bottom_left",
            turnDirection: "clockwise",
            leftWidth_m: 0,
            rightWidth_m: 0,
            structureHeight_m: 20,
            scanDistance_m: 15,
            layerCount: 3,
            layerOrder: "bottom_to_top",
        });
        expect(region.generatedLayers).toEqual([]);
        expect(regionItemCount(region)).toBe(0);
        expect(region.collapsed).toBe(false);
        expect(region.generationState).toBe("idle");
        expect(region.generationMessage).toBeNull();
        expect(region.errors).toEqual([]);
        expect(regionHasManualEdits(region)).toBe(false);
    });

    it("createCorridorRegion stores the polyline and corridor defaults", () => {
        const region = createCorridorRegion(POLYLINE);

        expect(region.patternType).toBe("corridor");
        expect(region.polygon).toEqual([]);
        expect(region.polyline).toEqual(POLYLINE);
        expect(region.corridorPolygon).toEqual([]);
        expect(region.params.leftWidth_m).toBe(50);
        expect(region.params.rightWidth_m).toBe(50);
    });

    it("createStructureRegion stores polygon geometry with structure defaults", () => {
        const region = createStructureRegion(POLYGON);

        expect(region.patternType).toBe("structure");
        expect(region.polygon).toEqual(POLYGON);
        expect(region.polyline).toEqual([]);
        expect(region.generatedLayers).toEqual([]);
        expect(region.params.structureHeight_m).toBe(20);
        expect(region.params.scanDistance_m).toBe(15);
        expect(region.params.layerCount).toBe(3);
        expect(region.params.layerOrder).toBe("bottom_to_top");
    });

    it("applyGenerationResult with ok result populates items and stats and clears manual edits", () => {
        const generatedItems = [makeWaypoint(47.11, 8.11, 50), makeWaypoint(47.12, 8.12, 50)];
        const manualEdit = makeWaypoint(47.13, 8.13, 55);
        const seeded = markItemEdited(
            applyGenerationResult(createSurveyRegion(POLYGON), makeSuccessResult([makeWaypoint(47.1, 8.1, 50)])),
            0,
            manualEdit,
        );

        const updated = applyGenerationResult(seeded, makeSuccessResult(generatedItems));

        expect(updated.generatedItems).toEqual(generatedItems);
        expect(updated.generatedTransects).toEqual([makeTransect(47.1, 8.1, 47.2, 8.1)]);
        expect(updated.generatedCrosshatch).toEqual([makeTransect(47.1, 8.15, 47.2, 8.15)]);
        expect(updated.generatedStats).toEqual(makeStats());
        expect(updated.corridorPolygon).toEqual([]);
        expect(updated.errors).toEqual([]);
        expect(updated.manualEdits.size).toBe(0);
        expect(regionHasManualEdits(updated)).toBe(false);
    });

    it("applyGenerationResult stores corridor polygons for corridor results", () => {
        const generatedItems = [makeWaypoint(47.11, 8.11, 50), makeWaypoint(47.12, 8.12, 50)];
        const updated = applyGenerationResult(createCorridorRegion(POLYLINE), makeCorridorSuccessResult(generatedItems));

        expect(updated.patternType).toBe("corridor");
        expect(updated.generatedItems).toEqual(generatedItems);
        expect(updated.generatedTransects).toEqual([makeTransect(47.1, 8.1, 47.12, 8.12)]);
        expect(updated.generatedCrosshatch).toEqual([]);
        expect(updated.generatedStats?.crosshatchLaneCount).toBe(0);
        expect(updated.corridorPolygon).toEqual(CORRIDOR_POLYGON);
    });

    it("applyGenerationResult stores structure layers for structure results", () => {
        const generatedItems = [makeWaypoint(47.11, 8.11, 56), makeWaypoint(47.12, 8.12, 62)];
        const updated = applyGenerationResult(createStructureRegion(POLYGON), makeStructureSuccessResult(generatedItems));

        expect(updated.patternType).toBe("structure");
        expect(updated.generatedItems).toEqual(generatedItems);
        expect(updated.generatedTransects).toEqual([]);
        expect(updated.generatedCrosshatch).toEqual([]);
        expect(updated.generatedLayers).toHaveLength(2);
        expect(updated.generatedLayers[0]?.altitude_m).toBe(56);
        expect(updated.generatedStats?.layerCount).toBe(2);
        expect(updated.generatedStats?.photosPerLayer).toBe(4);
        expect(updated.corridorPolygon).toEqual([]);
    });

    it("applyGenerationResult with error result populates errors and keeps previous items", () => {
        const generatedItems = [makeWaypoint(47.11, 8.11, 50), makeWaypoint(47.12, 8.12, 50)];
        const seeded = applyGenerationResult(createSurveyRegion(POLYGON), makeSuccessResult(generatedItems));

        const updated = applyGenerationResult(seeded, {
            ok: false,
            errors: [{ code: "invalid_overlap", message: "side overlap is invalid" }],
        });

        expect(updated.generatedItems).toEqual(generatedItems);
        expect(updated.generatedStats).toEqual(makeStats());
        expect(updated.errors).toEqual([{ code: "invalid_overlap", message: "side overlap is invalid" }]);
        expect(updated.manualEdits.size).toBe(0);
    });

    it("markItemEdited records edits and regionHasManualEdits returns true", () => {
        const region = applyGenerationResult(
            createSurveyRegion(POLYGON),
            makeSuccessResult([makeWaypoint(47.11, 8.11, 50), makeWaypoint(47.12, 8.12, 50)]),
        );
        const editedItem = makeWaypoint(47.22, 8.22, 65);

        const updated = markItemEdited(region, 1, editedItem);

        expect(updated.manualEdits.get(1)).toEqual(editedItem);
        expect(regionHasManualEdits(updated)).toBe(true);
    });

    it("dissolveRegion applies manual edits over generated items", () => {
        const generated = [makeWaypoint(47.11, 8.11, 50), makeWaypoint(47.12, 8.12, 50)];
        const editedItem = makeWaypoint(47.5, 8.5, 70);
        const region = markItemEdited(
            applyGenerationResult(createSurveyRegion(POLYGON), makeSuccessResult(generated)),
            1,
            editedItem,
        );

        expect(dissolveRegion(region)).toEqual([generated[0], editedItem]);
    });

    it("flattenRegionsToItems correctly interleaves regular items and mixed region items in order", () => {
        const draftItems = [
            makeDraftItem(0, makeWaypoint(47.01, 8.01, 30)),
            makeDraftItem(1, makeWaypoint(47.02, 8.02, 30)),
            makeDraftItem(2, makeWaypoint(47.03, 8.03, 30)),
        ];

        const startRegion = applyGenerationResult(
            createSurveyRegion(POLYGON),
            makeSuccessResult([makeWaypoint(47.11, 8.11, 50)]),
        );
        const middleCorridorRegion = markItemEdited(
            applyGenerationResult(
                createCorridorRegion(POLYLINE),
                makeCorridorSuccessResult([makeWaypoint(47.21, 8.21, 50), makeWaypoint(47.22, 8.22, 50)]),
            ),
            0,
            makeWaypoint(47.25, 8.25, 60),
        );

        let extension = createSurveyDraftExtension();
        extension = addSurveyRegion(extension, middleCorridorRegion, 0);
        extension = addSurveyRegion(extension, startRegion, -1);

        expect(extension.surveyRegionOrder).toEqual([
            { regionId: startRegion.id, position: 0 },
            { regionId: middleCorridorRegion.id, position: 1 },
        ]);
        expect(flattenRegionsToItems(draftItems, extension)).toEqual([
            makeWaypoint(47.11, 8.11, 50),
            makeWaypoint(47.01, 8.01, 30),
            makeWaypoint(47.25, 8.25, 60),
            makeWaypoint(47.22, 8.22, 50),
            makeWaypoint(47.02, 8.02, 30),
            makeWaypoint(47.03, 8.03, 30),
        ]);
    });

    it("addSurveyRegion, moveSurveyRegionTo, updateSurveyRegion, removeSurveyRegion, and dissolveSurveyRegion manage the extension", () => {
        const first = applyGenerationResult(
            createSurveyRegion(POLYGON),
            makeSuccessResult([makeWaypoint(47.11, 8.11, 50)]),
        );
        const second = applyGenerationResult(
            createSurveyRegion(POLYGON),
            makeSuccessResult([makeWaypoint(47.21, 8.21, 50), makeWaypoint(47.22, 8.22, 50)]),
        );

        let extension = createSurveyDraftExtension();
        extension = addSurveyRegion(extension, first, 0);
        extension = addSurveyRegion(extension, second, 1);

        expect(extension.surveyRegionOrder).toEqual([
            { regionId: first.id, position: 1 },
            { regionId: second.id, position: 2 },
        ]);

        extension = moveSurveyRegionTo(extension, second.id, 0);
        expect(extension.surveyRegionOrder).toEqual([
            { regionId: second.id, position: 0 },
            { regionId: first.id, position: 1 },
        ]);

        extension = updateSurveyRegion(extension, second.id, (region) => ({
            ...region,
            collapsed: true,
            cameraId: CAMERA.canonicalName,
            camera: CAMERA,
        }));
        expect(extension.surveyRegions.get(second.id)?.collapsed).toBe(true);
        expect(extension.surveyRegions.get(second.id)?.cameraId).toBe(CAMERA.canonicalName);

        const dissolved = dissolveSurveyRegion(extension, second.id);
        expect(dissolved.dissolvedItems).toEqual([makeWaypoint(47.21, 8.21, 50), makeWaypoint(47.22, 8.22, 50)]);
        expect(dissolved.extension.surveyRegions.has(second.id)).toBe(false);
        expect(dissolved.extension.surveyRegionOrder).toEqual([{ regionId: first.id, position: 1 }]);

        const removed = removeSurveyRegion(dissolved.extension, first.id);
        expect(removed.surveyRegions.size).toBe(0);
        expect(removed.surveyRegionOrder).toEqual([]);
    });

    it("hydrateSurveyRegion merges defaults, passthrough-backed camera data, and import metadata", () => {
        const parsed = makeParsedRegion({
            patternType: "corridor",
            position: 2,
            polygon: [],
            polyline: POLYLINE,
            params: {
                leftWidth_m: 80,
                turnaroundDistance_m: 12,
            },
        });

        const region = hydrateSurveyRegion(parsed);

        expect(region.patternType).toBe("corridor");
        expect(region.polyline).toEqual(POLYLINE);
        expect(region.polygon).toEqual([]);
        expect(region.cameraId).toBe(CAMERA.canonicalName);
        expect(region.camera).toEqual(expect.objectContaining({
            canonicalName: CAMERA.canonicalName,
            sensorWidth_mm: CAMERA.sensorWidth_mm,
            sensorHeight_mm: CAMERA.sensorHeight_mm,
            imageWidth_px: CAMERA.imageWidth_px,
            imageHeight_px: CAMERA.imageHeight_px,
            focalLength_mm: CAMERA.focalLength_mm,
            landscape: CAMERA.landscape,
            fixedOrientation: CAMERA.fixedOrientation,
        }));
        expect(region.params.leftWidth_m).toBe(80);
        expect(region.params.rightWidth_m).toBe(50);
        expect(region.params.turnaroundDistance_m).toBe(12);
        expect(region.generatedItems).toEqual(parsed.embeddedItems);
        expect(region.qgcPassthrough).toEqual(parsed.qgcPassthrough);
        expect(region.importWarnings).toEqual(parsed.warnings);

        (parsed.qgcPassthrough.TransectStyleComplexItem as { CameraCalc?: { CameraName?: string } }).CameraCalc!.CameraName = "changed";
        expect((region.qgcPassthrough?.TransectStyleComplexItem as { CameraCalc?: { CameraName?: string } }).CameraCalc?.CameraName)
            .toBe(CAMERA.canonicalName);
    });

    it("hydrateSurveyRegion recovers a full catalog camera from canonicalName-only imports", () => {
        const region = hydrateSurveyRegion(makeParsedRegion({
            camera: { canonicalName: BUILTIN_CAMERA.canonicalName },
            qgcPassthrough: {},
        }));

        expect(region.cameraId).toBe(BUILTIN_CAMERA.canonicalName);
        expect(region.camera).toEqual(BUILTIN_CAMERA);
    });

    it("toExportableSurveyRegion preserves positions, passthrough camera recovery, and manual edits", () => {
        const parsed = makeParsedRegion();
        const editedItem = makeWaypoint(47.5, 8.5, 80);
        const region = markItemEdited(hydrateSurveyRegion(parsed), 0, editedItem);
        region.camera = null;

        const exportable = toExportableSurveyRegion(region, 7);

        expect(exportable.position).toBe(7);
        expect(exportable.patternType).toBe("grid");
        expect(exportable.polygon).toEqual(POLYGON);
        expect(exportable.polyline).toEqual([]);
        expect(exportable.camera).toEqual(expect.objectContaining({
            canonicalName: CAMERA.canonicalName,
            sensorWidth_mm: CAMERA.sensorWidth_mm,
            sensorHeight_mm: CAMERA.sensorHeight_mm,
            imageWidth_px: CAMERA.imageWidth_px,
            imageHeight_px: CAMERA.imageHeight_px,
            focalLength_mm: CAMERA.focalLength_mm,
            landscape: CAMERA.landscape,
            fixedOrientation: CAMERA.fixedOrientation,
        }));
        expect(exportable.embeddedItems).toEqual([editedItem]);
        expect(exportable.qgcPassthrough).toEqual(parsed.qgcPassthrough);
        expect(exportable.params.altitude_m).toBe(65);
        expect(exportable.params.frontOverlap_pct).toBe(82);
    });

    it("toExportableSurveyRegion rejects authored regions without a resolvable camera", () => {
        const region = createSurveyRegion(POLYGON);

        expect(() => toExportableSurveyRegion(region, 0)).toThrow(/resolved camera/i);
    });

    it("toExportableSurveyRegion rejects malformed authored geometry", () => {
        const region = createCorridorRegion(POLYLINE.slice(0, 1));
        region.camera = CAMERA;
        region.cameraId = CAMERA.canonicalName;

        expect(() => toExportableSurveyRegion(region, 0)).toThrow(/geometry/i);
    });

    it("dissolve empty region and region with no generation return empty arrays", () => {
        const emptyRegion = createSurveyRegion(POLYGON);
        const extension = addSurveyRegion(createSurveyDraftExtension(), emptyRegion, 0);

        expect(dissolveRegion(emptyRegion)).toEqual([]);
        expect(dissolveSurveyRegion(extension, emptyRegion.id).dissolvedItems).toEqual([]);
    });
});
