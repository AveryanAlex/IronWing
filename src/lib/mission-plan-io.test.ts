import { describe, expect, it } from "vitest";

import fenceFixtureJson from "../../tests/contracts/fence.plan.json";
import missionFixtureJson from "../../tests/contracts/mission.plan.json";
import rallyFixtureJson from "../../tests/contracts/rally.plan.json";
import corridorComplexFixtureJson from "../../tests/contracts/corridor-complex.plan.json";
import structureComplexFixtureJson from "../../tests/contracts/structure-complex.plan.json";
import surveyComplexFixtureJson from "../../tests/contracts/survey-complex.plan.json";
import type { CatalogCamera } from "./survey-camera-catalog";
import { createSurveyRegion, toExportableSurveyRegion as toSurveyRegionExportable } from "./survey-region";
import type { FencePlan, HomePosition, MissionPlan, RallyPlan } from "./mavkit-types";
import {
    exportPlanFile,
    missionFrameFromNumeric,
    missionFrameToNumeric,
    parsePlanFile,
    type ExportableSurveyRegion,
    type ParsedSurveyRegion,
} from "./mission-plan-io";

function makePlanJson(
    items: unknown[],
    extras: {
        mission?: Record<string, unknown>;
        [key: string]: unknown;
    } = {},
) {
    const { mission: missionExtras = {}, ...planExtras } = extras;

    return {
        fileType: "Plan",
        version: 1,
        groundStation: "QGroundControl",
        mission: {
            version: 2,
            firmwareType: 12,
            vehicleType: 2,
            cruiseSpeed: 15,
            hoverSpeed: 5,
            plannedHomePosition: [47.397742, 8.545594, 488],
            items,
            ...missionExtras,
        },
        ...planExtras,
    };
}

function toExportableSurveyRegion(region: ParsedSurveyRegion): ExportableSurveyRegion {
    return {
        patternType: region.patternType,
        polygon: region.polygon.map((point) => ({ ...point })),
        polyline: region.polyline.map((point) => ({ ...point })),
        camera: region.camera as CatalogCamera | null,
        params: { ...region.params },
        embeddedItems: region.embeddedItems.map((item) => ({ ...item })),
        qgcPassthrough: JSON.parse(JSON.stringify(region.qgcPassthrough)) as Record<string, unknown>,
        position: region.position,
    };
}

describe("mission-plan-io: parsePlanFile", () => {
    it("returns explicit planning speeds from a QGC plan", () => {
        const result = parsePlanFile(makePlanJson([], {
            mission: {
                cruiseSpeed: 21,
                hoverSpeed: 8,
            },
        }));

        expect(result.cruiseSpeed).toBe(21);
        expect(result.hoverSpeed).toBe(8);
    });

    it("parses mission-only plans with typed commands and preserves unknown commands as Other", () => {
        const input = makePlanJson([
            {
                type: "SimpleItem",
                autoContinue: true,
                command: 22,
                doJumpId: 7,
                frame: 3,
                params: [15, 0, 0, 0, 47.397742, 8.545594, 25],
            },
            {
                type: "SimpleItem",
                autoContinue: true,
                command: 16,
                doJumpId: 8,
                frame: 3,
                params: [0, 1, 0, 0, 47.4, 8.55, 30],
            },
            {
                type: "SimpleItem",
                autoContinue: false,
                command: 4242,
                doJumpId: 9,
                frame: 0,
                params: [1, 2, 3, 4, 47.5, 8.6, 700],
            },
        ]);

        const result = parsePlanFile(input);

        expect(result.home).toEqual({ latitude_deg: 47.397742, longitude_deg: 8.545594, altitude_m: 488 });
        expect(result.fence).toEqual({ return_point: null, regions: [] });
        expect(result.rally).toEqual({ points: [] });
        expect(result.mission.items).toHaveLength(3);

        expect(result.mission.items[0]).toEqual({
            command: {
                Nav: {
                    Takeoff: {
                        position: {
                            RelHome: {
                                latitude_deg: 47.397742,
                                longitude_deg: 8.545594,
                                relative_alt_m: 25,
                            },
                        },
                        pitch_deg: 15,
                    },
                },
            },
            current: true,
            autocontinue: true,
        });

        expect(result.mission.items[1]).toEqual({
            command: {
                Nav: {
                    Waypoint: {
                        position: {
                            RelHome: {
                                latitude_deg: 47.4,
                                longitude_deg: 8.55,
                                relative_alt_m: 30,
                            },
                        },
                        hold_time_s: 0,
                        acceptance_radius_m: 1,
                        pass_radius_m: 0,
                        yaw_deg: 0,
                    },
                },
            },
            current: false,
            autocontinue: true,
        });

        expect(result.mission.items[2]).toEqual({
            command: {
                Other: {
                    command: 4242,
                    frame: "Global",
                    param1: 1,
                    param2: 2,
                    param3: 3,
                    param4: 4,
                    x: 47.5,
                    y: 8.6,
                    z: 700,
                },
            },
            current: false,
            autocontinue: false,
        });

        expect(result.warnings).toEqual(
            expect.arrayContaining([
                expect.stringContaining("not in COMMAND_CATALOG"),
                expect.stringContaining("float degrees"),
            ]),
        );
    });

    it("parses mission, fence, rally, and home sections together", () => {
        const input = makePlanJson(
            [
                {
                    type: "SimpleItem",
                    autoContinue: true,
                    command: 16,
                    doJumpId: 1,
                    frame: 3,
                    params: [0, 0, 0, 0, 47.41, 8.56, 40],
                },
            ],
            {
                geoFence: {
                    version: 2,
                    polygons: [
                        {
                            inclusion: true,
                            polygon: [
                                { latitude: 47.39, longitude: 8.53 },
                                { lat: 47.41, lon: 8.53 },
                                { lat: 47.41, lon: 8.56 },
                            ],
                        },
                    ],
                    circles: [
                        {
                            inclusion: false,
                            circle: {
                                center: { lat: 47.4, lon: 8.545 },
                                radius: 50,
                            },
                        },
                    ],
                },
                rallyPoints: {
                    version: 2,
                    points: [
                        [47.397, 8.545, 30],
                        [47.5, 8.55, 45],
                    ],
                },
            },
        );

        const result = parsePlanFile(input);

        expect(result.home).toEqual({ latitude_deg: 47.397742, longitude_deg: 8.545594, altitude_m: 488 });
        expect(result.fence).toEqual({
            return_point: null,
            regions: [
                {
                    inclusion_polygon: {
                        vertices: [
                            { latitude_deg: 47.39, longitude_deg: 8.53 },
                            { latitude_deg: 47.41, longitude_deg: 8.53 },
                            { latitude_deg: 47.41, longitude_deg: 8.56 },
                        ],
                        inclusion_group: 0,
                    },
                },
                {
                    exclusion_circle: {
                        center: { latitude_deg: 47.4, longitude_deg: 8.545 },
                        radius_m: 50,
                    },
                },
            ],
        });
        expect(result.rally).toEqual({
            points: [
                { RelHome: { latitude_deg: 47.397, longitude_deg: 8.545, relative_alt_m: 30 } },
                { RelHome: { latitude_deg: 47.5, longitude_deg: 8.55, relative_alt_m: 45 } },
            ],
        });
        expect(result.warnings).toEqual([]);
    });

    it("parses survey ComplexItems into surveyRegions and preserves embedded mission items", () => {
        const result = parsePlanFile(surveyComplexFixtureJson);
        const survey = result.surveyRegions[0];

        expect(result.mission.items).toHaveLength(2);
        expect(result.surveyRegions).toHaveLength(2);
        expect(survey).toMatchObject({
            patternType: "grid",
            position: 1,
            polygon: [
                { latitude_deg: 47.3981, longitude_deg: 8.5451 },
                { latitude_deg: 47.3984, longitude_deg: 8.5463 },
                { latitude_deg: 47.3977, longitude_deg: 8.5468 },
                { latitude_deg: 47.3974, longitude_deg: 8.5455 },
            ],
            camera: {
                canonicalName: "Sony ILCE-QX1",
                focalLength_mm: 16,
                imageWidth_px: 5456,
                imageHeight_px: 3632,
            },
            params: {
                altitude_m: 120,
                sideOverlap_pct: 70,
                frontOverlap_pct: 75,
                trackAngle_deg: 32,
                orientation: "landscape",
                crosshatch: true,
                turnaroundDistance_m: 18,
                terrainFollow: false,
                captureMode: "distance",
                startCorner: "bottom_left",
            },
        });
        expect(survey.embeddedItems).toHaveLength(2);
        expect(survey.embeddedItems[1]?.command).toEqual({ Nav: "ReturnToLaunch" });
        expect(survey.qgcPassthrough.flyAlternateTransects).toBe(true);
        expect((survey.qgcPassthrough.TransectStyleComplexItem as { CameraTriggerInTurnAround?: boolean }).CameraTriggerInTurnAround).toBe(true);
        expect(result.warnings).toEqual(
            expect.arrayContaining([
                expect.stringContaining("flyAlternateTransects is not modeled"),
                expect.stringContaining("CameraTriggerInTurnAround is not modeled"),
            ]),
        );
    });

    it("imports manual-camera surveys as camera-less regions with explicit warnings", () => {
        const result = parsePlanFile(surveyComplexFixtureJson);
        const manualSurvey = result.surveyRegions[1];

        expect(manualSurvey).toMatchObject({
            patternType: "grid",
            position: 1,
            camera: null,
            params: {
                altitude_m: 55,
                sideOverlap_pct: 65,
                frontOverlap_pct: 80,
                orientation: "portrait",
                terrainFollow: true,
                captureMode: "hover",
                turnaroundDistance_m: 9,
            },
        });
        expect(manualSurvey.embeddedItems).toHaveLength(1);
        expect(result.warnings).toEqual(
            expect.arrayContaining([
                expect.stringContaining("Manual (no camera specs)"),
            ]),
        );
    });

    it("parses corridor ComplexItems with polyline geometry and symmetric width mapping", () => {
        const result = parsePlanFile(corridorComplexFixtureJson);
        const corridor = result.surveyRegions[0];
        const customCameraCorridor = result.surveyRegions[1];

        expect(result.mission.items).toHaveLength(2);
        expect(result.surveyRegions).toHaveLength(2);
        expect(corridor).toMatchObject({
            patternType: "corridor",
            position: 1,
            polyline: [
                { latitude_deg: 47.4001, longitude_deg: 8.548 },
                { latitude_deg: 47.4008, longitude_deg: 8.5486 },
                { latitude_deg: 47.4014, longitude_deg: 8.549 },
            ],
            params: {
                altitude_m: 80,
                sideOverlap_pct: 60,
                frontOverlap_pct: 65,
                orientation: "portrait",
                turnaroundDistance_m: 12,
                terrainFollow: true,
                captureMode: "distance",
                leftWidth_m: 35,
                rightWidth_m: 35,
            },
        });
        expect(customCameraCorridor?.camera).toBeNull();
        expect(result.warnings).toEqual(
            expect.arrayContaining([
                expect.stringContaining("Custom Camera"),
            ]),
        );
    });

    it("parses structure ComplexItems into structure survey regions", () => {
        const result = parsePlanFile(structureComplexFixtureJson);
        const structure = result.surveyRegions[0];

        expect(result.mission.items).toHaveLength(2);
        expect(result.surveyRegions).toHaveLength(1);
        expect(structure).toMatchObject({
            patternType: "structure",
            position: 1,
            polygon: [
                { latitude_deg: 47.4027, longitude_deg: 8.551 },
                { latitude_deg: 47.4031, longitude_deg: 8.5516 },
                { latitude_deg: 47.4026, longitude_deg: 8.552 },
                { latitude_deg: 47.4022, longitude_deg: 8.5514 },
            ],
            camera: {
                canonicalName: "Sony ILCE-QX1",
            },
            params: {
                altitude_m: 60,
                sideOverlap_pct: 67,
                frontOverlap_pct: 72,
                structureHeight_m: 24,
                scanDistance_m: 18,
                layerCount: 4,
            },
        });
        expect(structure.embeddedItems).toHaveLength(2);
    });

    it("still flattens unknown ComplexItems with embedded SimpleItems for backward compatibility", () => {
        const input = makePlanJson([
            {
                type: "ComplexItem",
                complexItemType: "MadeUpPattern",
                TransectStyleComplexItem: {
                    Items: [
                        {
                            type: "SimpleItem",
                            autoContinue: true,
                            command: 16,
                            frame: 3,
                            params: [0, 0, 0, 0, 47.4, 8.55, 20],
                        },
                        {
                            type: "SimpleItem",
                            autoContinue: true,
                            command: 20,
                            frame: 2,
                            params: [0, 0, 0, 0, 0, 0, 0],
                        },
                    ],
                },
            },
        ]);

        const result = parsePlanFile(input);

        expect(result.surveyRegions).toEqual([]);
        expect(result.mission.items).toHaveLength(2);
        expect(result.mission.items[0].current).toBe(true);
        expect(result.mission.items[1].command).toEqual({ Nav: "ReturnToLaunch" });
        expect(result.warnings).toEqual(
            expect.arrayContaining([
                expect.stringContaining("loses survey/corridor metadata"),
            ]),
        );
    });

    it("handles missing and malformed optional sections gracefully", () => {
        const result = parsePlanFile({
            fileType: "Plan",
            version: 1,
            groundStation: "QGroundControl",
            mission: {
                items: [
                    {
                        type: "SimpleItem",
                        autoContinue: true,
                        command: 16,
                        frame: 3,
                        params: [0, 0, 0, 0, 47.4, 8.55, 30],
                    },
                ],
            },
        });

        expect(result.home).toBeNull();
        expect(result.fence).toEqual({ return_point: null, regions: [] });
        expect(result.rally).toEqual({ points: [] });
        expect(result.cruiseSpeed).toBe(15);
        expect(result.hoverSpeed).toBe(5);
        expect(result.mission.items).toHaveLength(1);
        expect(result.warnings).toEqual([]);
    });
});

describe("mission-plan-io: exportPlanFile", () => {
    it("roundtrips MSL, RelHome, and Terrain frames and exports sequential doJumpIds", () => {
        const mission: MissionPlan = {
            items: [
                {
                    command: {
                        Nav: {
                            Waypoint: {
                                position: {
                                    Msl: {
                                        latitude_deg: 47.1,
                                        longitude_deg: 8.1,
                                        altitude_msl_m: 500,
                                    },
                                },
                                hold_time_s: 1,
                                acceptance_radius_m: 2,
                                pass_radius_m: 3,
                                yaw_deg: 4,
                            },
                        },
                    },
                    current: true,
                    autocontinue: true,
                },
                {
                    command: {
                        Nav: {
                            Takeoff: {
                                position: {
                                    RelHome: {
                                        latitude_deg: 47.2,
                                        longitude_deg: 8.2,
                                        relative_alt_m: 30,
                                    },
                                },
                                pitch_deg: 12,
                            },
                        },
                    },
                    current: false,
                    autocontinue: true,
                },
                {
                    command: {
                        Nav: {
                            Land: {
                                position: {
                                    Terrain: {
                                        latitude_deg: 47.3,
                                        longitude_deg: 8.3,
                                        altitude_terrain_m: 18,
                                    },
                                },
                                abort_alt_m: 9,
                            },
                        },
                    },
                    current: false,
                    autocontinue: false,
                },
            ],
        };

        const exported = exportPlanFile({
            mission,
            home: { latitude_deg: 47.0, longitude_deg: 8.0, altitude_m: 450 },
            fence: { return_point: null, regions: [] },
            rally: { points: [] },
        });

        expect(exported.warnings).toEqual([]);
        expect(exported.json.fileType).toBe("Plan");
        expect(exported.json.mission?.cruiseSpeed).toBe(15);
        expect(exported.json.mission?.hoverSpeed).toBe(5);
        expect(exported.json.mission?.items?.map((item) => (item as { doJumpId?: number }).doJumpId)).toEqual([1, 2, 3]);
        expect(exported.json.mission?.items?.map((item) => (item as { frame?: number }).frame)).toEqual([0, 3, 10]);

        const reparsed = parsePlanFile(exported.json);
        expect(reparsed.mission).toEqual(mission);
        expect(reparsed.home).toEqual({ latitude_deg: 47.0, longitude_deg: 8.0, altitude_m: 450 });
    });

    it("writes custom planning speeds when provided for export", () => {
        const exported = exportPlanFile({
            mission: { items: [] },
            home: null,
            fence: { return_point: null, regions: [] },
            rally: { points: [] },
            cruiseSpeed: 19,
            hoverSpeed: 6,
        });

        expect(exported.json.mission?.cruiseSpeed).toBe(19);
        expect(exported.json.mission?.hoverSpeed).toBe(6);
    });

    it("falls back to default planning speeds when export overrides are absent", () => {
        const exported = exportPlanFile({
            mission: { items: [] },
            home: null,
            fence: { return_point: null, regions: [] },
            rally: { points: [] },
        });

        expect(exported.json.mission?.cruiseSpeed).toBe(15);
        expect(exported.json.mission?.hoverSpeed).toBe(5);
    });

    it("exports fixture-shaped mission/fence/rally state and surfaces lossy warnings where expected", () => {
        const missionFixture = JSON.parse(JSON.stringify(missionFixtureJson)) as MissionPlan;
        const fenceFixture = JSON.parse(JSON.stringify(fenceFixtureJson)) as FencePlan;
        const rallyFixture = JSON.parse(JSON.stringify(rallyFixtureJson)) as RallyPlan;

        const raw = missionFixture.items[2] as {
            command: { Other: { frame: unknown } };
        };
        raw.command.Other.frame = "Global";

        const exported = exportPlanFile({
            mission: missionFixture,
            home: null,
            fence: fenceFixture,
            rally: rallyFixture,
        });

        expect(exported.json.mission?.items).toHaveLength(3);
        expect(exported.json.geoFence?.polygons).toHaveLength(1);
        expect(exported.json.geoFence?.circles).toHaveLength(1);
        expect(exported.json.rallyPoints?.points).toHaveLength(2);
        expect(exported.warnings).toEqual(
            expect.arrayContaining([
                expect.stringContaining("Fence return_point"),
                expect.stringContaining("non-RelHome altitude frame"),
                expect.stringContaining("float degrees"),
            ]),
        );
    });

    it("roundtrips parse -> export -> parse for supported mission/fence/rally/home state", () => {
        const input = {
            mission: {
                items: [
                    {
                        command: {
                            Nav: {
                                Waypoint: {
                                    position: {
                                        RelHome: {
                                            latitude_deg: 47.41,
                                            longitude_deg: 8.56,
                                            relative_alt_m: 40,
                                        },
                                    },
                                    hold_time_s: 2,
                                    acceptance_radius_m: 1,
                                    pass_radius_m: 0,
                                    yaw_deg: 90,
                                },
                            },
                        },
                        current: true,
                        autocontinue: true,
                    },
                    {
                        command: {
                            Do: {
                                ChangeSpeed: {
                                    speed_type: "Groundspeed",
                                    speed_mps: 18,
                                    throttle_pct: 60,
                                },
                            },
                        },
                        current: false,
                        autocontinue: true,
                    },
                    {
                        command: {
                            Other: {
                                command: 4242,
                                frame: "GlobalRelativeAlt",
                                param1: 1,
                                param2: 2,
                                param3: 3,
                                param4: 4,
                                x: 47.5,
                                y: 8.6,
                                z: 70,
                            },
                        },
                        current: false,
                        autocontinue: false,
                    },
                ],
            } satisfies MissionPlan,
            home: { latitude_deg: 47.397742, longitude_deg: 8.545594, altitude_m: 488 } satisfies HomePosition,
            fence: {
                return_point: null,
                regions: [
                    {
                        inclusion_polygon: {
                            vertices: [
                                { latitude_deg: 47.39, longitude_deg: 8.53 },
                                { latitude_deg: 47.41, longitude_deg: 8.53 },
                                { latitude_deg: 47.41, longitude_deg: 8.56 },
                            ],
                            inclusion_group: 0,
                        },
                    },
                    {
                        exclusion_circle: {
                            center: { latitude_deg: 47.4, longitude_deg: 8.545 },
                            radius_m: 50,
                        },
                    },
                ],
            } satisfies FencePlan,
            rally: {
                points: [
                    { RelHome: { latitude_deg: 47.397, longitude_deg: 8.545, relative_alt_m: 30 } },
                ],
            } satisfies RallyPlan,
        };

        const exported = exportPlanFile(input);
        const reparsed = parsePlanFile(exported.json);

        expect(reparsed.mission).toEqual(input.mission);
        expect(reparsed.home).toEqual(input.home);
        expect(reparsed.fence).toEqual(input.fence);
        expect(reparsed.rally).toEqual(input.rally);
        expect(exported.json.mission?.items?.map((item) => (item as { doJumpId?: number }).doJumpId)).toEqual([1, 2, 3]);
    });

    it("exports survey regions back as interleaved ComplexItems alongside SimpleItems", () => {
        const parsedSurvey = parsePlanFile(surveyComplexFixtureJson);
        const exportableSurvey = toExportableSurveyRegion(parsedSurvey.surveyRegions[0]!);

        const exported = exportPlanFile({
            mission: parsedSurvey.mission,
            surveyRegions: [exportableSurvey],
            home: parsedSurvey.home,
            fence: parsedSurvey.fence,
            rally: parsedSurvey.rally,
        });

        expect(exported.json.mission?.items?.map((item) => (item as { type?: string }).type)).toEqual([
            "SimpleItem",
            "ComplexItem",
            "SimpleItem",
        ]);
        expect(exported.json.mission?.items?.[1]).toMatchObject({
            type: "ComplexItem",
            complexItemType: "survey",
            version: 5,
            angle: 32,
            entryLocation: 2,
        });
    });

    it("roundtrips survey, corridor, and structure ComplexItems with geometry, camera calc, and placement preserved", () => {
        const survey = parsePlanFile(surveyComplexFixtureJson).surveyRegions[0]!;
        const corridor = parsePlanFile(corridorComplexFixtureJson).surveyRegions[0]!;
        const structure = parsePlanFile(structureComplexFixtureJson).surveyRegions[0]!;

        const mission: MissionPlan = {
            items: [
                {
                    command: { Nav: "ReturnToLaunch" },
                    current: true,
                    autocontinue: true,
                },
                {
                    command: {
                        Nav: {
                            Waypoint: {
                                position: {
                                    RelHome: {
                                        latitude_deg: 47.41,
                                        longitude_deg: 8.56,
                                        relative_alt_m: 40,
                                    },
                                },
                                hold_time_s: 0,
                                acceptance_radius_m: 0,
                                pass_radius_m: 0,
                                yaw_deg: 0,
                            },
                        },
                    },
                    current: false,
                    autocontinue: true,
                },
            ],
        };

        const exported = exportPlanFile({
            mission,
            surveyRegions: [
                { ...toExportableSurveyRegion(survey), position: 0 },
                { ...toExportableSurveyRegion(corridor), position: 1 },
                { ...toExportableSurveyRegion(structure), position: 2 },
            ],
            home: null,
            fence: { return_point: null, regions: [] },
            rally: { points: [] },
        });
        const reparsed = parsePlanFile(exported.json);

        expect(reparsed.mission.items).toHaveLength(2);
        expect(reparsed.surveyRegions.map((region) => region.patternType)).toEqual(["grid", "corridor", "structure"]);
        expect(reparsed.surveyRegions.map((region) => region.position)).toEqual([0, 1, 2]);
        expect(reparsed.surveyRegions[0]).toMatchObject({
            polygon: survey.polygon,
            params: { trackAngle_deg: 32, startCorner: "bottom_left" },
            camera: { canonicalName: "Sony ILCE-QX1" },
        });
        expect(reparsed.surveyRegions[1]).toMatchObject({
            polyline: corridor.polyline,
            params: { leftWidth_m: 35, rightWidth_m: 35 },
            camera: { canonicalName: "Sony ILCE-QX1" },
        });
        expect(reparsed.surveyRegions[2]).toMatchObject({
            polygon: structure.polygon,
            params: { structureHeight_m: 24, layerCount: 4, scanDistance_m: 18 },
            camera: { canonicalName: "Sony ILCE-QX1" },
        });
    });

    it("roundtrips imported camera-less surveys without fabricating a resolved camera", () => {
        const manualSurvey = parsePlanFile(surveyComplexFixtureJson).surveyRegions[1]!;

        const exported = exportPlanFile({
            mission: { items: [] },
            surveyRegions: [toExportableSurveyRegion(manualSurvey)],
            home: null,
            fence: { return_point: null, regions: [] },
            rally: { points: [] },
        });
        const reparsed = parsePlanFile(exported.json);

        expect(exported.json.mission?.items?.[0]).toMatchObject({
            type: "ComplexItem",
            complexItemType: "survey",
        });
        expect(reparsed.surveyRegions[0]).toMatchObject({
            patternType: "grid",
            camera: null,
            params: { altitude_m: 55, sideOverlap_pct: 65, frontOverlap_pct: 80 },
        });
    });

    it("preserves same-slot survey block order when exporting multiple ComplexItems", () => {
        const survey = parsePlanFile(surveyComplexFixtureJson).surveyRegions[0]!;
        const corridor = parsePlanFile(corridorComplexFixtureJson).surveyRegions[0]!;

        const exported = exportPlanFile({
            mission: { items: [] },
            surveyRegions: [
                { ...toExportableSurveyRegion(survey), position: 0 },
                { ...toExportableSurveyRegion(corridor), position: 0 },
            ],
            home: null,
            fence: { return_point: null, regions: [] },
            rally: { points: [] },
        });
        const reparsed = parsePlanFile(exported.json);

        expect(reparsed.surveyRegions.map((region) => region.patternType)).toEqual(["grid", "corridor"]);
        expect(reparsed.surveyRegions.map((region) => region.position)).toEqual([0, 0]);
    });

    it("fails closed when an authored survey region does not have a resolved export camera", () => {
        const region = createSurveyRegion([
            { latitude_deg: 47.3981, longitude_deg: 8.5451 },
            { latitude_deg: 47.3984, longitude_deg: 8.5463 },
            { latitude_deg: 47.3977, longitude_deg: 8.5468 },
        ]);

        expect(() => toSurveyRegionExportable(region, 0)).toThrow(/resolved camera/i);
    });

    it("preserves unsupported survey passthrough fields on export and warns explicitly", () => {
        const parsedSurvey = parsePlanFile(surveyComplexFixtureJson);
        const exportableSurvey = toExportableSurveyRegion(parsedSurvey.surveyRegions[0]!);

        const exported = exportPlanFile({
            mission: parsedSurvey.mission,
            surveyRegions: [exportableSurvey],
            home: parsedSurvey.home,
            fence: parsedSurvey.fence,
            rally: parsedSurvey.rally,
        });

        const complex = exported.json.mission?.items?.[1] as {
            flyAlternateTransects?: boolean;
            TransectStyleComplexItem?: { CameraTriggerInTurnAround?: boolean };
        };

        expect(complex.flyAlternateTransects).toBe(true);
        expect(complex.TransectStyleComplexItem?.CameraTriggerInTurnAround).toBe(true);
        expect(exported.warnings).toEqual(
            expect.arrayContaining([
                expect.stringContaining("flyAlternateTransects is preserved"),
                expect.stringContaining("CameraTriggerInTurnAround is preserved"),
            ]),
        );
    });

    it("warns when exporting asymmetric corridor widths to QGC's symmetric CorridorWidth", () => {
        const parsedCorridor = parsePlanFile(corridorComplexFixtureJson);
        const exportableCorridor = toExportableSurveyRegion(parsedCorridor.surveyRegions[0]!);
        exportableCorridor.params.leftWidth_m = 20;
        exportableCorridor.params.rightWidth_m = 60;

        const exported = exportPlanFile({
            mission: { items: [] },
            surveyRegions: [{ ...exportableCorridor, position: 0 }],
            home: null,
            fence: { return_point: null, regions: [] },
            rally: { points: [] },
        });

        expect(exported.json.mission?.items?.[0]).toMatchObject({
            type: "ComplexItem",
            complexItemType: "CorridorScan",
            CorridorWidth: 60,
        });
        expect(exported.warnings).toEqual(
            expect.arrayContaining([
                expect.stringContaining("symmetric QGC CorridorWidth"),
            ]),
        );
    });
});

describe("mission-plan-io: exportPlanFile domain exclusion", () => {
    it("excludes fence from export when domain is disabled", () => {
        const result = exportPlanFile({
            mission: { items: [] },
            home: null,
            fence: {
                return_point: null,
                regions: [
                    {
                        inclusion_polygon: {
                            vertices: [
                                { latitude_deg: 47.39, longitude_deg: 8.53 },
                                { latitude_deg: 47.41, longitude_deg: 8.53 },
                                { latitude_deg: 47.41, longitude_deg: 8.56 },
                            ],
                            inclusion_group: 0,
                        },
                    },
                ],
            },
            rally: {
                points: [
                    { RelHome: { latitude_deg: 47.397, longitude_deg: 8.545, relative_alt_m: 30 } },
                ],
            },
            excludeDomains: ["fence"],
        });

        expect(result.json.geoFence).toBeUndefined();
        expect(result.json.rallyPoints?.points).toHaveLength(1);
    });

    it("excludes rally from export when domain is disabled", () => {
        const result = exportPlanFile({
            mission: { items: [] },
            home: null,
            fence: {
                return_point: null,
                regions: [
                    {
                        inclusion_polygon: {
                            vertices: [
                                { latitude_deg: 47.39, longitude_deg: 8.53 },
                                { latitude_deg: 47.41, longitude_deg: 8.53 },
                                { latitude_deg: 47.41, longitude_deg: 8.56 },
                            ],
                            inclusion_group: 0,
                        },
                    },
                ],
            },
            rally: {
                points: [
                    { RelHome: { latitude_deg: 47.397, longitude_deg: 8.545, relative_alt_m: 30 } },
                ],
            },
            excludeDomains: ["rally"],
        });

        expect(result.json.geoFence?.polygons).toHaveLength(1);
        expect(result.json.rallyPoints).toBeUndefined();
    });
});

describe("mission-plan-io: frame helpers", () => {
    it("maps QGC numeric frames to typed MissionFrame values and back", () => {
        expect(missionFrameFromNumeric(0)).toBe("Global");
        expect(missionFrameFromNumeric(3)).toBe("GlobalRelativeAlt");
        expect(missionFrameFromNumeric(10)).toBe("GlobalTerrainAlt");
        expect(missionFrameFromNumeric(2)).toBe("Mission");
        expect(missionFrameFromNumeric(99)).toEqual({ Other: 99 });

        expect(missionFrameToNumeric("Global")).toBe(0);
        expect(missionFrameToNumeric("GlobalRelativeAlt")).toBe(3);
        expect(missionFrameToNumeric("GlobalTerrainAlt")).toBe(10);
        expect(missionFrameToNumeric("Mission")).toBe(2);
        expect(missionFrameToNumeric({ Other: 77 })).toBe(77);
    });
});
