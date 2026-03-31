import { describe, it, expect } from "vitest";
import {
    COMMAND_CATALOG,
    commandIdToVariant,
    getCommandCatalog,
    getCommandMetadata,
    mappedCommandIds,
    rawFallbackParams,
    resolveCommandMetadata,
    type ParamSlot,
    variantToCommandId,
} from "./mission-command-metadata";
import { MAV_CMD } from "./mav-commands";

const ALL_PARAM_SLOTS: ParamSlot[] = ["param1", "param2", "param3", "param4", "x", "y", "z"];

describe("command catalog", () => {
    it("covers all 65 typed picker variants", () => {
        expect(COMMAND_CATALOG).toHaveLength(65);
    });

    it("returns command IDs for known category/variant pairs", () => {
        expect(variantToCommandId("Nav", "Waypoint")).toBe(16);
        expect(variantToCommandId("Do", "CamTriggerDistance")).toBe(206);
        expect(variantToCommandId("Condition", "Yaw")).toBe(115);
    });

    it("maps command IDs back to variant entries", () => {
        expect(commandIdToVariant(16)).toMatchObject({ category: "Nav", variant: "Waypoint", id: 16 });
        expect(commandIdToVariant(206)).toMatchObject({ category: "Do", variant: "CamTriggerDistance", id: 206 });
        expect(commandIdToVariant(99999)).toBeUndefined();
    });

    it("returns a copy from getCommandCatalog", () => {
        const catalog = getCommandCatalog();
        expect(catalog).toHaveLength(65);
        expect(catalog).not.toBe(COMMAND_CATALOG);
        expect(catalog[0]).toEqual(COMMAND_CATALOG[0]);
    });

    it("contains string variants and positive numeric IDs", () => {
        for (const entry of COMMAND_CATALOG) {
            expect(typeof entry.variant).toBe("string");
            expect(entry.variant.length).toBeGreaterThan(0);
            expect(typeof entry.id).toBe("number");
            expect(entry.id).toBeGreaterThan(0);
            expect(["Nav", "Do", "Condition"]).toContain(entry.category);
            expect(entry.label.length).toBeGreaterThan(0);
        }
    });
});

describe("getCommandMetadata", () => {
    it("returns metadata for NAV_WAYPOINT (16)", () => {
        const meta = getCommandMetadata(16);
        expect(meta).toBeDefined();
        expect(meta!.id).toBe(16);
        expect(meta!.category).toBe("navigation");
    });

    it("returns undefined for unmapped command", () => {
        expect(getCommandMetadata(99999)).toBeUndefined();
    });
});

describe("NAV_WAYPOINT (16) semantics", () => {
    const meta = getCommandMetadata(16)!;

    it("has Hold / Accept Radius / Pass Radius / Yaw / Lat / Lon / Alt params", () => {
        expect(meta.params.param1?.label).toBe("Hold");
        expect(meta.params.param2?.label).toBe("Accept Radius");
        expect(meta.params.param3?.label).toBe("Pass Radius");
        expect(meta.params.param4?.label).toBe("Yaw");
        expect(meta.params.x?.label).toBe("Latitude");
        expect(meta.params.y?.label).toBe("Longitude");
        expect(meta.params.z?.label).toBe("Altitude");
    });

    it("marks Accept Radius, Pass Radius, and Yaw as unsupported", () => {
        expect(meta.params.param2?.supported).toBe(false);
        expect(meta.params.param3?.supported).toBe(false);
        expect(meta.params.param4?.supported).toBe(false);
    });

    it("back-fills typed field metadata", () => {
        expect(meta.typedFields?.hold_time_s?.label).toBe("Hold");
        expect(meta.typedFields?.acceptance_radius_m?.supported).toBe(false);
        expect(meta.typedFields?.pass_radius_m?.supported).toBe(false);
        expect(meta.typedFields?.yaw_deg?.supported).toBe(false);
    });
});

describe("NAV_TAKEOFF (22) semantics", () => {
    const meta = getCommandMetadata(22)!;

    it("hides coordinates for Copter editing", () => {
        expect(meta.params.x?.hidden).toBe(true);
        expect(meta.params.y?.hidden).toBe(true);
    });

    it("requires altitude", () => {
        expect(meta.params.z).toBeDefined();
        expect(meta.params.z?.label).toBe("Altitude");
        expect(meta.params.z?.hidden).toBeFalsy();
        expect(meta.params.z?.required).toBe(true);
    });

    it("hides pitch (Plane-only)", () => {
        expect(meta.params.param1?.hidden).toBe(true);
        expect(meta.typedFields?.pitch_deg?.hidden).toBe(true);
    });
});

describe("NAV_LAND (21)", () => {
    const meta = getCommandMetadata(21)!;

    it("has lat/lon with land-in-place note", () => {
        expect(meta.params.x?.description).toContain("land in place");
        expect(meta.params.y?.description).toContain("land in place");
    });

    it("back-fills abort-alt typed metadata", () => {
        expect(meta.typedFields?.abort_alt_m?.label).toBe("Abort Altitude");
        expect(meta.typedFields?.abort_alt_m?.hidden).toBe(true);
    });
});

describe("Loiter commands", () => {
    it("LOITER_UNLIM (17) has no time/turn params but has typed radius/direction metadata", () => {
        const meta = getCommandMetadata(17)!;
        expect(meta.params.param1).toBeUndefined();
        expect(meta.params.x).toBeDefined();
        expect(meta.typedFields?.radius_m?.units).toBe("m");
        expect(meta.typedFields?.direction?.enumValues).toEqual([
            { value: "Clockwise", label: "CW" },
            { value: "CounterClockwise", label: "CCW" },
        ]);
        expect(meta.notes).toContain("The mission does NOT advance past this command.");
    });

    it("LOITER_TURNS (18) has turns/radius params and typed direction metadata", () => {
        const meta = getCommandMetadata(18)!;
        expect(meta.params.param1?.label).toBe("Turns");
        expect(meta.params.param3?.label).toBe("Radius");
        expect(meta.typedFields?.turns?.required).toBe(true);
        expect(meta.typedFields?.direction?.enumValues).toHaveLength(2);
    });

    it("LOITER_TIME (19) has time param and typed direction metadata", () => {
        const meta = getCommandMetadata(19)!;
        expect(meta.params.param1?.label).toBe("Time");
        expect(meta.params.param1?.units).toBe("s");
        expect(meta.typedFields?.time_s?.units).toBe("s");
        expect(meta.typedFields?.direction?.enumValues).toHaveLength(2);
    });
});

describe("RTL (20)", () => {
    it("has no editable params", () => {
        const meta = getCommandMetadata(20)!;
        expect(Object.keys(meta.params)).toHaveLength(0);
    });

    it("has rally point note and empty typedFields", () => {
        const meta = getCommandMetadata(20)!;
        expect(meta.notes?.some((n) => n.includes("Rally Point"))).toBe(true);
        expect(meta.typedFields).toEqual({});
    });
});

describe("SPLINE_WAYPOINT (82)", () => {
    it("has hold and coordinates", () => {
        const meta = getCommandMetadata(82)!;
        expect(meta.params.param1?.label).toBe("Hold");
        expect(meta.params.x).toBeDefined();
        expect(meta.params.z).toBeDefined();
        expect(meta.typedFields?.hold_time_s?.label).toBe("Hold");
    });
});

describe("NAV_DELAY (93)", () => {
    it("has delay and clock time fields", () => {
        const meta = getCommandMetadata(93)!;
        expect(meta.params.param1?.label).toBe("Delay");
        expect(meta.params.param2?.label).toBe("Hour");
        expect(meta.params.param3?.label).toBe("Minute");
        expect(meta.params.param4?.label).toBe("Second");
        expect(meta.typedFields?.seconds?.label).toBe("Delay");
        expect(meta.typedFields?.hour_utc?.label).toBe("Hour");
    });
});

describe("CONDITION commands", () => {
    it("CONDITION_DELAY (112) has time and does-not-stop note", () => {
        const meta = getCommandMetadata(112)!;
        expect(meta.category).toBe("condition");
        expect(meta.params.param1?.label).toBe("Time");
        expect(meta.typedFields?.delay_s?.label).toBe("Time");
        expect(meta.notes?.some((n) => n.includes("NOT stop"))).toBe(true);
    });

    it("CONDITION_DISTANCE (114) has distance", () => {
        const meta = getCommandMetadata(114)!;
        expect(meta.params.param1?.label).toBe("Distance");
        expect(meta.params.param1?.units).toBe("m");
        expect(meta.typedFields?.distance_m?.units).toBe("m");
    });

    it("CONDITION_YAW (115) has heading, speed, direction, reference and typed direction", () => {
        const meta = getCommandMetadata(115)!;
        expect(meta.params.param1?.label).toBe("Heading");
        expect(meta.params.param3?.enumValues).toHaveLength(3);
        expect(meta.params.param4?.enumValues).toHaveLength(2);
        expect(meta.typedFields?.direction?.enumValues).toEqual([
            { value: "Clockwise", label: "CW" },
            { value: "CounterClockwise", label: "CCW" },
        ]);
    });
});

describe("DO commands", () => {
    it("DO_JUMP (177) has waypoint # and repeat", () => {
        const meta = getCommandMetadata(177)!;
        expect(meta.category).toBe("do");
        expect(meta.params.param1?.label).toBe("Waypoint #");
        expect(meta.params.param2?.label).toBe("Repeat");
        expect(meta.typedFields?.target_index?.label).toBe("Waypoint #");
        expect(meta.typedFields?.repeat_count?.label).toBe("Repeat");
        expect(meta.notes?.some((n) => n.includes("NAV command"))).toBe(true);
    });

    it("DO_CHANGE_SPEED (178) has speed type enum", () => {
        const meta = getCommandMetadata(178)!;
        expect(meta.params.param1?.enumValues).toHaveLength(2);
        expect(meta.params.param2?.label).toBe("Speed");
        expect(meta.typedFields?.speed_type?.enumValues).toEqual([
            { value: "Airspeed", label: "Airspeed" },
            { value: "Groundspeed", label: "Ground Speed" },
        ]);
    });

    it("DO_SET_HOME (179) has deprecation warning", () => {
        const meta = getCommandMetadata(179)!;
        expect(meta.notes?.some((n) => n.includes("Rally Points"))).toBe(true);
        expect(meta.typedFields?.use_current?.label).toBe("Use Current");
    });

    it("DO_SET_ROI_LOCATION (195) has coordinates and persistence note", () => {
        const meta = getCommandMetadata(195)!;
        expect(meta.params.x).toBeDefined();
        expect(meta.typedFields).toEqual({});
        expect(meta.notes?.some((n) => n.includes("persists"))).toBe(true);
    });

    it("DO_SET_ROI_NONE (197) has no params", () => {
        const meta = getCommandMetadata(197)!;
        expect(Object.keys(meta.params)).toHaveLength(0);
        expect(meta.typedFields).toEqual({});
    });

    it("DO_SET_CAM_TRIGG_DIST (206) has distance and trigger-once", () => {
        const meta = getCommandMetadata(206)!;
        expect(meta.params.param1?.label).toBe("Distance");
        expect(meta.params.param3?.enumValues).toHaveLength(2);
        expect(meta.typedFields?.meters?.units).toBe("m");
        expect(meta.typedFields?.trigger_now?.label).toBe("Trigger Once");
    });
});

describe("rawFallbackParams", () => {
    it("returns all 7 param slots for any command", () => {
        const fallback = rawFallbackParams(99999);
        for (const slot of ALL_PARAM_SLOTS) {
            expect(fallback.params[slot]).toBeDefined();
        }
    });

    it("uses generic Param N labels", () => {
        const fallback = rawFallbackParams(99999);
        expect(fallback.params.param1?.label).toBe("Param 1");
        expect(fallback.params.param2?.label).toBe("Param 2");
        expect(fallback.params.param3?.label).toBe("Param 3");
        expect(fallback.params.param4?.label).toBe("Param 4");
    });

    it("includes full command name in summary", () => {
        const fallback = rawFallbackParams(16);
        expect(fallback.summary).toContain("NAV_WAYPOINT");
    });

    it("uses MAV_CMD_N format for truly unknown commands", () => {
        const fallback = rawFallbackParams(99999);
        expect(fallback.summary).toContain("MAV_CMD_99999");
    });

    it("preserves coordinate labels", () => {
        const fallback = rawFallbackParams(99999);
        expect(fallback.params.x?.label).toBe("Latitude");
        expect(fallback.params.y?.label).toBe("Longitude");
        expect(fallback.params.z?.label).toBe("Altitude");
    });
});

describe("resolveCommandMetadata", () => {
    it("returns rich metadata for mapped commands", () => {
        const meta = resolveCommandMetadata(16);
        expect(meta.params.param1?.label).toBe("Hold");
    });

    it("returns fallback for unmapped commands", () => {
        const meta = resolveCommandMetadata(99999);
        expect(meta.params.param1?.label).toBe("Param 1");
        expect(meta.id).toBe(99999);
    });

    it("never returns undefined", () => {
        expect(resolveCommandMetadata(0)).toBeDefined();
        expect(resolveCommandMetadata(-1)).toBeDefined();
        expect(resolveCommandMetadata(999999)).toBeDefined();
    });
});

describe("mappedCommandIds", () => {
    it("returns all registered command IDs", () => {
        const ids = mappedCommandIds();
        expect(ids).toContain(16);
        expect(ids).toContain(22);
        expect(ids).toContain(21);
        expect(ids).toContain(17);
        expect(ids).toContain(18);
        expect(ids).toContain(19);
        expect(ids).toContain(20);
        expect(ids).toContain(82);
        expect(ids).toContain(93);
        expect(ids).toContain(112);
        expect(ids).toContain(114);
        expect(ids).toContain(115);
        expect(ids).toContain(177);
        expect(ids).toContain(178);
        expect(ids).toContain(179);
        expect(ids).toContain(195);
        expect(ids).toContain(197);
        expect(ids).toContain(206);
    });

    it("has exactly 18 mapped commands", () => {
        expect(mappedCommandIds()).toHaveLength(18);
    });
});

describe("required field", () => {
    it("NAV_WAYPOINT marks altitude as required", () => {
        const meta = getCommandMetadata(16)!;
        expect(meta.params.z?.required).toBe(true);
    });

    it("NAV_TAKEOFF marks altitude as required", () => {
        const meta = getCommandMetadata(22)!;
        expect(meta.params.z?.required).toBe(true);
    });

    it("NAV_WAYPOINT Hold is not required (optional delay)", () => {
        const meta = getCommandMetadata(16)!;
        expect(meta.params.param1?.required).toBeFalsy();
    });

    it("LOITER_TURNS marks turns as required", () => {
        const meta = getCommandMetadata(18)!;
        expect(meta.params.param1?.required).toBe(true);
        expect(meta.typedFields?.turns?.required).toBe(true);
    });

    it("LOITER_TIME marks time as required", () => {
        const meta = getCommandMetadata(19)!;
        expect(meta.params.param1?.required).toBe(true);
        expect(meta.typedFields?.time_s?.required).toBe(true);
    });

    it("CONDITION_DELAY marks time as required", () => {
        const meta = getCommandMetadata(112)!;
        expect(meta.params.param1?.required).toBe(true);
        expect(meta.typedFields?.delay_s?.required).toBe(true);
    });

    it("DO_JUMP marks both waypoint # and repeat as required", () => {
        const meta = getCommandMetadata(177)!;
        expect(meta.params.param1?.required).toBe(true);
        expect(meta.params.param2?.required).toBe(true);
        expect(meta.typedFields?.target_index?.required).toBe(true);
        expect(meta.typedFields?.repeat_count?.required).toBe(true);
    });

    it("fallback params are not required", () => {
        const fallback = rawFallbackParams(99999);
        for (const slot of ALL_PARAM_SLOTS) {
            expect(fallback.params[slot]?.required).toBeFalsy();
        }
    });
});

describe("frame descriptor", () => {
    it("NAV_WAYPOINT has hidden relative-alt frame", () => {
        const meta = getCommandMetadata(16)!;
        expect(meta.frame).toBeDefined();
        expect(meta.frame!.hidden).toBe(true);
        expect(meta.frame!.label).toBe("Altitude Frame");
    });

    it("NAV_TAKEOFF has hidden relative-alt frame", () => {
        const meta = getCommandMetadata(22)!;
        expect(meta.frame).toBeDefined();
        expect(meta.frame!.hidden).toBe(true);
    });

    it("RTL has hidden frame (no position component)", () => {
        const meta = getCommandMetadata(20)!;
        expect(meta.frame).toBeDefined();
        expect(meta.frame!.hidden).toBe(true);
        expect(meta.frame!.description).toContain("irrelevant");
    });

    it("CONDITION_DELAY has hidden frame (no position)", () => {
        const meta = getCommandMetadata(112)!;
        expect(meta.frame).toBeDefined();
        expect(meta.frame!.hidden).toBe(true);
    });

    it("DO_JUMP has hidden frame (no position)", () => {
        const meta = getCommandMetadata(177)!;
        expect(meta.frame).toBeDefined();
        expect(meta.frame!.hidden).toBe(true);
    });

    it("all mapped commands have a frame descriptor", () => {
        for (const id of mappedCommandIds()) {
            const meta = getCommandMetadata(id)!;
            expect(meta.frame).toBeDefined();
        }
    });

    it("fallback does not include a frame descriptor", () => {
        const fallback = rawFallbackParams(99999);
        expect(fallback.frame).toBeUndefined();
    });
});

describe("registry consistency", () => {
    it("all mapped command IDs exist in MAV_CMD table", () => {
        for (const id of mappedCommandIds()) {
            expect(MAV_CMD[id]).toBeDefined();
        }
    });

    it("all metadata entries have matching id field", () => {
        for (const id of mappedCommandIds()) {
            const meta = getCommandMetadata(id)!;
            expect(meta.id).toBe(id);
        }
    });

    it("all metadata entries have a valid category", () => {
        for (const id of mappedCommandIds()) {
            const meta = getCommandMetadata(id)!;
            expect(["navigation", "condition", "do"]).toContain(meta.category);
        }
    });

    it("all param descriptors have a non-empty label", () => {
        for (const id of mappedCommandIds()) {
            const meta = getCommandMetadata(id)!;
            for (const [, desc] of Object.entries(meta.params)) {
                expect(desc?.label).toBeTruthy();
            }
        }
    });

    it("all mapped metadata entries define typedFields", () => {
        for (const id of mappedCommandIds()) {
            const meta = getCommandMetadata(id)!;
            expect(meta.typedFields).toBeDefined();
        }
    });

    it("no metadata entry has params for slots outside the valid set", () => {
        for (const id of mappedCommandIds()) {
            const meta = getCommandMetadata(id)!;
            for (const key of Object.keys(meta.params)) {
                expect(ALL_PARAM_SLOTS).toContain(key as ParamSlot);
            }
        }
    });
});
