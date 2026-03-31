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
        expect(mappedCommandIds()).toHaveLength(65);
    });

    it("uses unique positive MAV_CMD IDs across the catalog", () => {
        const ids = COMMAND_CATALOG.map((entry) => entry.id);
        expect(new Set(ids).size).toBe(ids.length);

        for (const entry of COMMAND_CATALOG) {
            expect(entry.variant.length).toBeGreaterThan(0);
            expect(entry.id).toBeGreaterThan(0);
            expect(entry.label.length).toBeGreaterThan(0);
            expect(["Nav", "Do", "Condition"]).toContain(entry.category);
        }
    });

    it("maps representative variants to ids and back", () => {
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
    it("provides dedicated metadata for every catalog entry", () => {
        const catalogIds = new Set(COMMAND_CATALOG.map((entry) => entry.id));
        expect(new Set(mappedCommandIds())).toEqual(catalogIds);

        for (const entry of COMMAND_CATALOG) {
            const metadata = getCommandMetadata(entry.id);
            expect(metadata, `${entry.category}:${entry.variant}`).toBeDefined();
            expect(resolveCommandMetadata(entry.id).summary).not.toContain("no detailed metadata available");
        }
    });

    it("keeps every metadata record id aligned with its key", () => {
        for (const id of mappedCommandIds()) {
            expect(getCommandMetadata(id)?.id).toBe(id);
        }
    });

    it("assigns non-empty typed labels for every typed field descriptor", () => {
        for (const id of mappedCommandIds()) {
            const metadata = getCommandMetadata(id)!;
            for (const [fieldKey, descriptor] of Object.entries(metadata.typedFields ?? {})) {
                expect(descriptor.label.trim(), `${id}:${fieldKey}`).not.toBe("");
            }
        }
    });

    it("defines a frame for every navigation metadata entry with x/y position params", () => {
        for (const entry of COMMAND_CATALOG) {
            const metadata = getCommandMetadata(entry.id)!;
            if (metadata.category === "navigation" && metadata.params.x && metadata.params.y) {
                expect(metadata.frame, `${entry.variant} is navigation + position-bearing`).toBeDefined();
            }
        }
    });

    it("keeps MAV_CMD table rows present for every catalog entry", () => {
        for (const entry of COMMAND_CATALOG) {
            expect(MAV_CMD[entry.id], `missing MAV_CMD row for ${entry.category}:${entry.variant}`).toBeDefined();
        }
    });
});

describe("inspector-relevant metadata spot checks", () => {
    it("keeps waypoint support markers and takeoff coordinate visibility rules", () => {
        const waypoint = getCommandMetadata(16)!;
        expect(waypoint.typedFields?.hold_time_s?.label).toBe("Hold");
        expect(waypoint.typedFields?.acceptance_radius_m?.supported).toBeUndefined();
        expect(waypoint.typedFields?.pass_radius_m?.supported).toBeUndefined();
        expect(waypoint.typedFields?.yaw_deg?.supported).toBeUndefined();

        const takeoff = getCommandMetadata(22)!;
        expect(takeoff.params.x?.hidden).toBe(true);
        expect(takeoff.params.y?.hidden).toBe(true);
        expect(takeoff.params.z?.required).toBe(true);
        expect(takeoff.typedFields?.pitch_deg?.hidden).toBe(true);
    });

    it("covers the R042 VTOL takeoff, VTOL land, and DO_LAND_START entries", () => {
        const vtolTakeoff = getCommandMetadata(84)!;
        expect(vtolTakeoff.summary).toContain("VTOL takeoff");
        expect(vtolTakeoff.frame).toBeDefined();
        expect(vtolTakeoff.params.x?.label).toBe("Latitude");
        expect(vtolTakeoff.params.z?.label).toBe("Altitude");

        const vtolLand = getCommandMetadata(85)!;
        expect(vtolLand.summary).toContain("VTOL landing");
        expect(vtolLand.frame).toBeDefined();
        expect(vtolLand.typedFields?.options?.label).toBe("Options");
        expect(vtolLand.params.x?.label).toBe("Latitude");
        expect(vtolLand.params.y?.label).toBe("Longitude");

        const landStart = getCommandMetadata(189)!;
        expect(landStart.summary).toContain("landing sequence");
        expect(landStart.frame).toBeDefined();
        expect(landStart.params.x?.label).toBe("Latitude");
        expect(landStart.params.y?.label).toBe("Longitude");
        expect(landStart.docsUrl).toContain("do-land-start");
    });

    it("keeps command-specific enum values isolated per metadata entry", () => {
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

        expect(getCommandMetadata(207)?.typedFields?.action?.enumValues).toEqual([
            { value: "Disable", label: "Disable" },
            { value: "Enable", label: "Enable" },
            { value: "DisableFloor", label: "Disable Floor" },
        ]);
    });

    it("retains representative typed field coverage for script and winch commands", () => {
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
    it("returns undefined from getCommandMetadata for unknown ids", () => {
        expect(getCommandMetadata(99999)).toBeUndefined();
    });

    it("still generates generic raw fallback metadata for unknown ids", () => {
        const fallback = rawFallbackParams(99999);
        expect(fallback.summary).toContain("MAV_CMD_99999");
        expect(fallback.params.param1?.label).toBe("Param 1");
        expect(fallback.params.x?.label).toBe("Latitude");
        expect(fallback.params.z?.units).toBe("m");
    });

    it("resolveCommandMetadata never returns undefined", () => {
        expect(resolveCommandMetadata(16).id).toBe(16);
        expect(resolveCommandMetadata(99999).id).toBe(99999);
    });
});
