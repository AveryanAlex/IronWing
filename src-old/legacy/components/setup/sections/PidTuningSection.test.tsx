// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ParamStore } from "../../../params";
import type { VehicleState } from "../../../telemetry";
import type { ParamInputParams } from "../primitives/param-helpers";
import { PidTuningSection } from "./PidTuningSection";

function makeVehicleState(vehicle_type: string): VehicleState {
    return {
        armed: false,
        custom_mode: 0,
        mode_name: "",
        system_status: "",
        vehicle_type,
        autopilot: "",
        system_id: 1,
        component_id: 1,
        heartbeat_received: true,
    };
}

function makeStore(entries: Record<string, number>): ParamStore {
    const params: ParamStore["params"] = {};
    let index = 0;

    for (const [name, value] of Object.entries(entries)) {
        params[name] = { name, value, param_type: "real32", index: index++ };
    }

    return { params, expected_count: index };
}

function makeParams(store: Record<string, number>): ParamInputParams {
    return {
        store: makeStore(store),
        staged: new Map(),
        metadata: null,
        stage: vi.fn(),
    };
}

function renderSection({
    store,
    vehicleState = makeVehicleState("Fixed_Wing"),
}: {
    store: Record<string, number>;
    vehicleState?: VehicleState | null;
}) {
    return render(
        <PidTuningSection
            params={makeParams(store)}
            vehicleState={vehicleState}
        />,
    );
}

afterEach(() => {
    cleanup();
});

describe("PidTuningSection", () => {
    it("switches QuadPlane tuning to the Q_A_* and Q_M_* surfaces", () => {
        const { container } = renderSection({
            store: {
                Q_ENABLE: 1,
                Q_FRAME_CLASS: 1,
                Q_FRAME_TYPE: 1,
                Q_A_RAT_RLL_P: 0.12,
                Q_A_RAT_RLL_I: 0.22,
                Q_A_RAT_PIT_P: 0.13,
                Q_A_RAT_YAW_P: 0.14,
                Q_M_THST_EXPO: 0.58,
                Q_M_THST_HOVER: 0.22,
                Q_M_BAT_VOLT_MAX: 25.2,
                Q_M_BAT_VOLT_MIN: 19.2,
                RLL2SRV_P: 0.4,
                TRIM_THROTTLE: 45,
                INS_GYRO_FILTER: 40,
                INS_ACCEL_FILTER: 20,
                INS_HNTCH_ENABLE: 0,
                INS_HNTCH_MODE: 0,
                INS_HNTCH_FREQ: 80,
                INS_HNTCH_BW: 20,
                INS_HNTCH_REF: 1,
            },
        });

        expect(screen.getByText(/VTOL Rate PIDs/i)).toBeTruthy();
        expect(screen.getByText(/Lift Motor Response/i)).toBeTruthy();
        expect(container.querySelector('[data-setup-param="Q_A_RAT_RLL_P"]')).toBeTruthy();
        expect(container.querySelector('[data-setup-param="Q_M_THST_EXPO"]')).toBeTruthy();
        expect(screen.queryByText(/^Servo Tuning — Roll, pitch, and yaw control surface tuning$/i)).toBeNull();
        expect(screen.queryByText(/^Speed Configuration$/i)).toBeNull();
        expect(container.querySelector('[data-setup-param="TRIM_THROTTLE"]')).toBeNull();
    });

    it("keeps missing VTOL tuning families explicit without falling back to plane-only cards", () => {
        const { container } = renderSection({
            store: {
                Q_ENABLE: 1,
                Q_FRAME_CLASS: 1,
                Q_FRAME_TYPE: 1,
                Q_M_THST_EXPO: 0.61,
                Q_M_THST_HOVER: 0.24,
                RLL2SRV_P: 0.4,
                TRIM_THROTTLE: 45,
                INS_GYRO_FILTER: 40,
                INS_ACCEL_FILTER: 20,
                INS_HNTCH_ENABLE: 0,
                INS_HNTCH_MODE: 0,
                INS_HNTCH_FREQ: 80,
                INS_HNTCH_BW: 20,
                INS_HNTCH_REF: 1,
            },
        });

        expect(screen.getByText(/Q_A_\* rate tuning/i)).toBeTruthy();
        expect(screen.queryByText(/^Servo Tuning — Roll, pitch, and yaw control surface tuning$/i)).toBeNull();
        expect(container.querySelector('[data-setup-param="Q_M_THST_EXPO"]')).toBeTruthy();
        expect(container.querySelector('[data-setup-param="Q_A_RAT_RLL_P"]')).toBeNull();
    });

    it("keeps plain plane tuning on the fixed-wing servo and speed cards", () => {
        const { container } = renderSection({
            store: {
                Q_ENABLE: 0,
                RLL2SRV_P: 0.4,
                PTCH2SRV_P: 0.5,
                YAW2SRV_DAMP: 0.2,
                ARSPD_FBW_MIN: 12,
                ARSPD_FBW_MAX: 22,
                TRIM_THROTTLE: 45,
                TRIM_ARSPD_CM: 1500,
                INS_GYRO_FILTER: 40,
                INS_ACCEL_FILTER: 20,
                INS_HNTCH_ENABLE: 0,
                INS_HNTCH_MODE: 0,
                INS_HNTCH_FREQ: 80,
                INS_HNTCH_BW: 20,
                INS_HNTCH_REF: 1,
            },
        });

        expect(screen.getByText(/Servo Tuning/i)).toBeTruthy();
        expect(screen.getByText(/Speed Configuration/i)).toBeTruthy();
        expect(container.querySelector('[data-setup-param="TRIM_THROTTLE"]')).toBeTruthy();
        expect(screen.queryByText(/VTOL Rate PIDs/i)).toBeNull();
        expect(container.querySelector('[data-setup-param="Q_M_THST_EXPO"]')).toBeNull();
    });
});
