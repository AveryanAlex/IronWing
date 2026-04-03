// @vitest-environment jsdom

import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, it, expect } from "vitest";
import {
    computeTriState,
    toggleGroup,
    toggleItem,
    selectAll,
    selectNone,
} from "./initial-params-selection";
import {
    hasQuadPlaneParams,
    InitialParamsSection,
    isPlane,
} from "./InitialParamsSection";
import type { ParamInputParams } from "../primitives/param-helpers";
import type { VehicleState } from "../../../telemetry";

function makeParamStore(entries: Record<string, number>): ParamInputParams["store"] {
    return { params: entries, expected_count: 0 } as unknown as ParamInputParams["store"];
}

function makeRenderParams(entries: Record<string, number> = {}): ParamInputParams {
    return {
        store: makeParamStore(entries),
        staged: new Map(),
        metadata: null,
        stage: () => { },
    };
}

function makeVehicleState(vehicle_type: string): VehicleState {
    return {
        armed: false,
        custom_mode: 0,
        mode_name: "Manual",
        system_status: "standby",
        vehicle_type,
        autopilot: "ardu_pilot_mega",
        system_id: 1,
        component_id: 1,
        heartbeat_received: true,
    };
}

function renderSection({
    params = makeRenderParams(),
    vehicleState = makeVehicleState("quadrotor"),
}: {
    params?: ParamInputParams;
    vehicleState?: VehicleState | null;
} = {}) {
    return render(
        createElement(InitialParamsSection, {
            params,
            vehicleState,
        }),
    );
}

afterEach(() => {
    cleanup();
});

describe("computeTriState", () => {
    it("returns 'none' for empty items list", () => {
        expect(computeTriState([], new Set(["a"]))).toBe("none");
    });

    it("returns 'none' when no items are selected", () => {
        expect(computeTriState(["a", "b", "c"], new Set())).toBe("none");
    });

    it("returns 'all' when every item is selected", () => {
        expect(computeTriState(["a", "b"], new Set(["a", "b"]))).toBe("all");
    });

    it("returns 'some' when partially selected", () => {
        expect(computeTriState(["a", "b", "c"], new Set(["b"]))).toBe("some");
    });

    it("ignores extra items in selected that aren't in the items list", () => {
        expect(computeTriState(["a", "b"], new Set(["a", "b", "z"]))).toBe("all");
    });
});

describe("toggleGroup", () => {
    const group = ["a", "b", "c"];

    it("selects all in group when none are selected", () => {
        const result = toggleGroup(group, new Set());
        expect(result).toEqual(new Set(["a", "b", "c"]));
    });

    it("selects all in group when some are selected", () => {
        const result = toggleGroup(group, new Set(["a"]));
        expect(result).toEqual(new Set(["a", "b", "c"]));
    });

    it("deselects all in group when all are selected", () => {
        const result = toggleGroup(group, new Set(["a", "b", "c"]));
        expect(result).toEqual(new Set());
    });

    it("preserves items outside the group", () => {
        const result = toggleGroup(group, new Set(["a", "b", "c", "x", "y"]));
        expect(result).toEqual(new Set(["x", "y"]));
    });

    it("preserves items outside group when selecting all", () => {
        const result = toggleGroup(group, new Set(["x"]));
        expect(result).toEqual(new Set(["a", "b", "c", "x"]));
    });
});

describe("toggleItem", () => {
    it("adds an unselected item", () => {
        const result = toggleItem("b", new Set(["a"]));
        expect(result).toEqual(new Set(["a", "b"]));
    });

    it("removes a selected item", () => {
        const result = toggleItem("a", new Set(["a", "b"]));
        expect(result).toEqual(new Set(["b"]));
    });

    it("returns a new Set (immutable)", () => {
        const original = new Set(["a"]);
        const result = toggleItem("a", original);
        expect(original.has("a")).toBe(true);
        expect(result.has("a")).toBe(false);
    });
});

describe("selectAll", () => {
    it("returns set with all items", () => {
        expect(selectAll(["a", "b", "c"])).toEqual(new Set(["a", "b", "c"]));
    });

    it("returns empty set for empty input", () => {
        expect(selectAll([])).toEqual(new Set());
    });
});

describe("selectNone", () => {
    it("returns genuinely empty set", () => {
        const result = selectNone();
        expect(result.size).toBe(0);
    });
});

describe("empty-set-is-none regression", () => {
    it("computeTriState treats empty selected as 'none', not 'all'", () => {
        const items = ["MOT_THST_EXPO", "INS_GYRO_FILTER", "BATT_ARM_VOLT"];
        expect(computeTriState(items, new Set())).toBe("none");
    });

    it("selectNone followed by computeTriState returns 'none'", () => {
        const items = ["A", "B", "C"];
        const sel = selectNone();
        expect(computeTriState(items, sel)).toBe("none");
    });

    it("toggleGroup on empty selection selects all (not deselects)", () => {
        const group = ["A", "B"];
        const result = toggleGroup(group, new Set());
        expect(result).toEqual(new Set(["A", "B"]));
    });
});

describe("isPlane", () => {
    it("returns true for Fixed_Wing", () => {
        expect(isPlane({ vehicle_type: "Fixed_Wing" } as VehicleState)).toBe(true);
    });

    it("returns false for Quadrotor", () => {
        expect(isPlane({ vehicle_type: "Quadrotor" } as VehicleState)).toBe(false);
    });

    it("returns false for null", () => {
        expect(isPlane(null)).toBe(false);
    });
});

describe("hasQuadPlaneParams", () => {
    function makeStore(p: Record<string, number>): ParamInputParams["store"] {
        return { params: p, expected_count: 0 } as unknown as ParamInputParams["store"];
    }

    function makeParams(storeParams: Record<string, number> | null): ParamInputParams {
        return {
            store: storeParams ? makeStore(storeParams) : null,
            staged: new Map(),
            metadata: null,
            stage: () => { },
        };
    }

    it("returns true when Q_FRAME_CLASS exists", () => {
        expect(hasQuadPlaneParams(makeParams({ Q_FRAME_CLASS: 1 }))).toBe(true);
    });

    it("returns false when Q_FRAME_CLASS absent", () => {
        expect(hasQuadPlaneParams(makeParams({ SOME_PARAM: 1 }))).toBe(false);
    });

    it("returns false when store is null", () => {
        expect(hasQuadPlaneParams(makeParams(null))).toBe(false);
    });
});

describe("InitialParamsSection rover gating", () => {
    it("shows the rover-specific guidance instead of the multirotor calculator and keeps the tuning docs link", () => {
        renderSection({
            params: makeRenderParams({ SERVO1_FUNCTION: 26 }),
            vehicleState: makeVehicleState("rover"),
        });

        expect(
            screen.getByText(/Rover parameters are configured through their respective setup sections/i),
        ).toBeTruthy();
        expect(screen.getByRole("link", { name: /ardupilot docs/i }).getAttribute("href")).toBe(
            "https://ardupilot.org/copter/docs/common-tuning.html",
        );
        expect(screen.queryByText("Vehicle Inputs")).toBeNull();
        expect(screen.queryByText(/Stage All Recommended/i)).toBeNull();
    });

    it("keeps rover out of the copter calculator formulas and computed preview", () => {
        renderSection({
            params: makeRenderParams({ SERVO1_FUNCTION: 26 }),
            vehicleState: makeVehicleState("rover"),
        });

        expect(screen.queryByText(/Reference: 9" prop \+ 4S LiPo/i)).toBeNull();
        expect(screen.queryByText("Computed Parameters")).toBeNull();
        expect(screen.queryByText(/MOT_THST_EXPO/i)).toBeNull();
        expect(screen.queryByText(/INS_GYRO_FILTER/i)).toBeNull();
    });
});

describe("InitialParamsSection multirotor docs", () => {
    it("renders the tuning docs link for the calculator flow", () => {
        renderSection({
            params: makeRenderParams({ SERVO1_FUNCTION: 33 }),
            vehicleState: makeVehicleState("quadrotor"),
        });

        expect(screen.getByText("Vehicle Inputs")).toBeTruthy();
        expect(screen.getByRole("link", { name: /ardupilot docs/i }).getAttribute("href")).toBe(
            "https://ardupilot.org/copter/docs/common-tuning.html",
        );
    });
});

describe("plain fixed-wing gating", () => {
    function makeStore(p: Record<string, number>): ParamInputParams["store"] {
        return { params: p, expected_count: 0 } as unknown as ParamInputParams["store"];
    }

    it("shows fixed-wing guidance with the shared tuning docs link", () => {
        renderSection({
            params: makeRenderParams({ SERVO1_FUNCTION: 4 }),
            vehicleState: makeVehicleState("Fixed_Wing"),
        });

        expect(screen.getByText(/Fixed-wing tuning parameters differ significantly/i)).toBeTruthy();
        expect(screen.getByRole("link", { name: /ardupilot docs/i }).getAttribute("href")).toBe(
            "https://ardupilot.org/copter/docs/common-tuning.html",
        );
        expect(screen.queryByText("Vehicle Inputs")).toBeNull();
    });

    it("plain fixed-wing is detected when isPlane=true and no Q_FRAME_CLASS", () => {
        const vs = { vehicle_type: "Fixed_Wing" } as VehicleState;
        const params: ParamInputParams = {
            store: makeStore({ SERVO1_FUNCTION: 4 }),
            staged: new Map(),
            metadata: null,
            stage: () => { },
        };
        expect(isPlane(vs)).toBe(true);
        expect(hasQuadPlaneParams(params)).toBe(false);
    });

    it("quadplane is not plain fixed-wing", () => {
        const vs = { vehicle_type: "Fixed_Wing" } as VehicleState;
        const params: ParamInputParams = {
            store: makeStore({ Q_FRAME_CLASS: 1 }),
            staged: new Map(),
            metadata: null,
            stage: () => { },
        };
        expect(isPlane(vs)).toBe(true);
        expect(hasQuadPlaneParams(params)).toBe(true);
    });
});
