import { describe, expect, it } from "vitest";
import {
    COMMAND_CATALOG,
    commandIdToVariant,
    getCommandCatalog,
    getCommandMetadata,
    mappedCommandIds,
    rawFallbackParams,
    resolveCommandMetadata,
    variantToCommandId,
} from "./mission-command-metadata";
import { MAV_CMD } from "./mav-commands";

describe("command catalog", () => {
    it("covers all 65 typed picker variants", () => {
        expect(COMMAND_CATALOG).toHaveLength(65);
        expect(getCommandCatalog()).toHaveLength(65);
    });

    it("contains unique positive numeric MAV_CMD IDs", () => {
        const ids = COMMAND_CATALOG.map((entry) => entry.id);
        expect(new Set(ids).size).toBe(ids.length);

        for (const entry of COMMAND_CATALOG) {
            expect(typeof entry.variant).toBe("string");
            expect(entry.variant.length).toBeGreaterThan(0);
            expect(entry.id).toBeGreaterThan(0);
            expect(entry.label.length).toBeGreaterThan(0);
            expect(["Nav", "Do", "Condition"]).toContain(entry.category);
        }
    });

    it("maps representative variants to command IDs and back", () => {
        expect(variantToCommandId("Nav", "Waypoint")).toBe(16);
        expect(variantToCommandId("Nav", "VtolTakeoff")).toBe(84);
        expect(variantToCommandId("Do", "LandStart")).toBe(189);
        expect(variantToCommandId("Do", "Parachute")).toBe(208);
        expect(variantToCommandId("Condition", "Yaw")).toBe(115);

        expect(commandIdToVariant(84)).toMatchObject({ category: "Nav", variant: "VtolTakeoff", id: 84 });
        expect(commandIdToVariant(189)).toMatchObject({ category: "Do", variant: "LandStart", id: 189 });
        expect(commandIdToVariant(208)).toMatchObject({ category: "Do", variant: "Parachute", id: 208 });
        expect(commandIdToVariant(99999)).toBeUndefined();
    });
});

describe("metadata coverage contract", () => {
    it("maps all 65 catalog commands", () => {
        const mapped = mappedCommandIds();
        expect(mapped).toHaveLength(65);
        expect(new Set(mapped)).toEqual(new Set(COMMAND_CATALOG.map((entry) => entry.id)));
    });

    it("provides metadata for every catalog entry with no known-command fallback", () => {
        for (const entry of COMMAND_CATALOG) {
            const meta = getCommandMetadata(entry.id);
            expect(meta, `${entry.category}:${entry.variant}`).toBeDefined();
            expect(resolveCommandMetadata(entry.id).summary).not.toContain("no detailed metadata available");
        }
    });

    it("keeps metadata IDs, summaries, categories, frames, and MAV_CMD rows consistent", () => {
        for (const entry of COMMAND_CATALOG) {
            const meta = getCommandMetadata(entry.id)!;
            expect(meta.id).toBe(entry.id);
            expect(meta.summary.length).toBeGreaterThan(0);
            expect(meta.frame, `frame missing for ${entry.variant}`).toBeDefined();
            expect(["navigation", "do", "condition"]).toContain(meta.category);
            expect(MAV_CMD[entry.id], `MAV_CMD row missing for ${entry.variant}`).toBeDefined();
        }
    });

    it("gives every typed field descriptor a non-empty label", () => {
        for (const entry of COMMAND_CATALOG) {
            const meta = getCommandMetadata(entry.id)!;
            for (const [fieldKey, descriptor] of Object.entries(meta.typedFields ?? {})) {
                expect(descriptor.label, `${entry.variant}.${fieldKey}`).toBeTruthy();
            }
        }
    });

    it("defines a frame for every metadata entry that exposes position slots", () => {
        for (const entry of COMMAND_CATALOG) {
            const meta = getCommandMetadata(entry.id)!;
            if (meta.params.x || meta.params.y || meta.params.z) {
                expect(meta.frame, `${entry.variant} position-bearing metadata requires frame`).toBeDefined();
            }
        }
    });
});

describe("existing rich metadata still behaves as expected", () => {
    it("keeps NAV_WAYPOINT typed field support markers", () => {
        const meta = getCommandMetadata(16)!;
        expect(meta.params.param1?.label).toBe("Hold");
        expect(meta.params.param2?.supported).toBe(false);
        expect(meta.typedFields?.hold_time_s?.label).toBe("Hold");
        expect(meta.typedFields?.acceptance_radius_m?.supported).toBe(false);
    });

    it("keeps NAV_TAKEOFF coordinate visibility rules", () => {
        const meta = getCommandMetadata(22)!;
        expect(meta.params.x?.hidden).toBe(true);
        expect(meta.params.y?.hidden).toBe(true);
        expect(meta.params.z?.required).toBe(true);
    });

    it("keeps COND_YAW and CHANGE_SPEED enum metadata", () => {
        expect(getCommandMetadata(115)?.typedFields?.direction?.enumValues).toEqual([
            { value: "Clockwise", label: "CW" },
            { value: "CounterClockwise", label: "CCW" },
        ]);
        expect(getCommandMetadata(178)?.typedFields?.speed_type?.enumValues).toEqual([
            { value: "Airspeed", label: "Airspeed" },
            { value: "Groundspeed", label: "Ground Speed" },
        ]);
    });
});

describe("new T02 command coverage", () => {
    it("adds R042 navigation/do metadata entries", () => {
        const vtolTakeoff = getCommandMetadata(84)!;
        expect(vtolTakeoff.summary).toContain("VTOL takeoff");
        expect(vtolTakeoff.frame).toBeDefined();
        expect(vtolTakeoff.params.x?.label).toBe("Latitude");
        expect(vtolTakeoff.params.z?.label).toBe("Altitude");

        const vtolLand = getCommandMetadata(85)!;
        expect(vtolLand.summary).toContain("VTOL landing");
        expect(vtolLand.frame).toBeDefined();
        expect(vtolLand.typedFields?.options?.label).toBe("Options");

        const landStart = getCommandMetadata(189)!;
        expect(landStart.summary).toContain("landing sequence");
        expect(landStart.frame).toBeDefined();
        expect(landStart.params.x?.label).toBe("Latitude");
        expect(landStart.params.y?.label).toBe("Longitude");
        expect(landStart.docsUrl).toBeTruthy();
    });

    it("adds loiter and altitude-change typed enum coverage", () => {
        expect(getCommandMetadata(36)?.typedFields?.direction?.enumValues).toEqual([
            { value: "Clockwise", label: "CW" },
            { value: "CounterClockwise", label: "CCW" },
        ]);
        expect(getCommandMetadata(31)?.typedFields?.direction?.enumValues).toEqual([
            { value: "Clockwise", label: "CW" },
            { value: "CounterClockwise", label: "CCW" },
        ]);
        expect(getCommandMetadata(30)?.typedFields?.action?.enumValues).toEqual([
            { value: "Neutral", label: "Neutral" },
            { value: "Climb", label: "Climb" },
            { value: "Descend", label: "Descend" },
        ]);
    });

    it("adds parachute, gripper, fence, and winch per-command enum values", () => {
        expect(getCommandMetadata(207)?.typedFields?.action?.enumValues).toEqual([
            { value: "Disable", label: "Disable" },
            { value: "Enable", label: "Enable" },
            { value: "DisableFloor", label: "Disable Floor" },
        ]);

        expect(getCommandMetadata(208)?.typedFields?.action?.enumValues).toEqual([
            { value: "Disable", label: "Disable" },
            { value: "Enable", label: "Enable" },
            { value: "Release", label: "Release" },
        ]);

        expect(getCommandMetadata(211)?.typedFields?.action?.enumValues).toEqual([
            { value: "Release", label: "Release" },
            { value: "Grab", label: "Grab" },
        ]);

        expect(getCommandMetadata(42600)?.typedFields?.action?.enumValues).toEqual([
            { value: "Relax", label: "Relax" },
            { value: "LengthControl", label: "Length Control" },
            { value: "RateControl", label: "Rate Control" },
        ]);
    });

    it("adds representative typed fields for camera, script, and utility commands", () => {
        expect(Object.keys(getCommandMetadata(1000)?.typedFields ?? {})).toEqual([
            "pitch_deg",
            "yaw_deg",
            "pitch_rate_dps",
            "yaw_rate_dps",
            "flags",
            "gimbal_id",
        ]);
        expect(Object.keys(getCommandMetadata(42702)?.typedFields ?? {})).toEqual([
            "command",
            "timeout_s",
            "arg1",
            "arg2",
            "arg3",
            "arg4",
        ]);
        expect(Object.keys(getCommandMetadata(42600)?.typedFields ?? {})).toEqual([
            "number",
            "action",
            "release_length_m",
            "release_rate_mps",
        ]);
    });
});

describe("fallback behavior for unknown commands", () => {
    it("returns undefined from getCommandMetadata for unknown commands", () => {
        expect(getCommandMetadata(99999)).toBeUndefined();
    });

    it("still provides generic raw fallback metadata for unknown commands", () => {
        const fallback = rawFallbackParams(99999);
        expect(fallback.summary).toContain("MAV_CMD_99999");
        expect(fallback.params.param1?.label).toBe("Param 1");
        expect(fallback.params.x?.label).toBe("Latitude");
    });

    it("resolveCommandMetadata never returns undefined", () => {
        expect(resolveCommandMetadata(16).id).toBe(16);
        expect(resolveCommandMetadata(99999).id).toBe(99999);
    });
});
