import { describe, expect, it } from "vitest";

import fenceFixtureJson from "../../tests/contracts/fence.plan.json";
import missionFixtureJson from "../../tests/contracts/mission.plan.json";
import rallyFixtureJson from "../../tests/contracts/rally.plan.json";
import type { FencePlan, HomePosition, MissionPlan, RallyPlan } from "./mavkit-types";
import { exportPlanFile, missionFrameFromNumeric, missionFrameToNumeric, parsePlanFile } from "./mission-plan-io";

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

    it("flattens ComplexItems with embedded SimpleItems and warns about lost survey metadata", () => {
        const input = makePlanJson([
            {
                type: "ComplexItem",
                complexItemType: "survey",
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
