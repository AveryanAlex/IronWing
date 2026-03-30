// @vitest-environment jsdom

import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ParamInputParams } from "../primitives/param-helpers";
import type { ParamStore } from "../../../params";
import type { VehicleState } from "../../../telemetry";
import { GeofenceSection } from "./GeofenceSection";

function makeStore(entries: Record<string, number>): ParamStore {
    const params: ParamStore["params"] = {};
    let index = 0;
    for (const [name, value] of Object.entries(entries)) {
        params[name] = { name, value, param_type: "real32", index: index++ };
    }
    return { params, expected_count: index };
}

function makeParams(entries: Record<string, number>): ParamInputParams {
    return {
        store: makeStore(entries),
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

function renderSection(vehicle_type: string) {
    return render(
        createElement(GeofenceSection, {
            params: makeParams({
                FENCE_ENABLE: 1,
                FENCE_TYPE: 7,
                FENCE_ACTION: 1,
                FENCE_ALT_MAX: 100,
                FENCE_ALT_MIN: 10,
                FENCE_RADIUS: 300,
                FENCE_MARGIN: 2,
            }),
            vehicleState: makeVehicleState(vehicle_type),
        }),
    );
}

describe("GeofenceSection vehicle-family branching", () => {
    it("keeps copter altitude min and circle radius controls", () => {
        const { container } = renderSection("quadrotor");

        expect(container.querySelector('[data-setup-param="FENCE_ALT_MIN"]')).toBeTruthy();
        expect(container.querySelector('[data-setup-param="FENCE_RADIUS"]')).toBeTruthy();
        expect(container.querySelector('[data-setup-param="FENCE_ALT_MAX"]')).toBeTruthy();
    });

    it("shows rover circle radius without altitude controls", () => {
        const { container } = renderSection("rover");

        expect(container.querySelector('[data-setup-param="FENCE_RADIUS"]')).toBeTruthy();
        expect(container.querySelector('[data-setup-param="FENCE_MARGIN"]')).toBeTruthy();
        expect(container.querySelector('[data-setup-param="FENCE_ALT_MIN"]')).toBeNull();
        expect(container.querySelector('[data-setup-param="FENCE_ALT_MAX"]')).toBeNull();
        expect(
            screen.getByText(/Rover supports circle radius and margin fences without altitude limits/i),
        ).toBeTruthy();
    });

    it("shows plane altitude max without copter-only altitude min or circle radius", () => {
        const { container } = renderSection("fixed_wing");

        expect(container.querySelector('[data-setup-param="FENCE_ALT_MAX"]')).toBeTruthy();
        expect(container.querySelector('[data-setup-param="FENCE_MARGIN"]')).toBeTruthy();
        expect(container.querySelector('[data-setup-param="FENCE_ALT_MIN"]')).toBeNull();
        expect(container.querySelector('[data-setup-param="FENCE_RADIUS"]')).toBeNull();
    });
});
