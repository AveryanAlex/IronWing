// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParamMeta, ParamMetadataMap } from "../../../param-metadata";
import type { ParamStore } from "../../../params";
import type { Telemetry, VehicleState } from "../../../telemetry";
import type { ParamInputParams } from "../primitives/param-helpers";
import { ServoOutputsSection } from "./ServoOutputsSection";

const { setServo } = vi.hoisted(() => ({
    setServo: vi.fn(),
}));

vi.mock("../../../calibration", () => ({
    setServo,
}));

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

function makeMetadata(entries: Record<string, ParamMeta>): ParamMetadataMap {
    return new Map(Object.entries(entries));
}

function makeParams(overrides: Partial<ParamInputParams> = {}): ParamInputParams {
    return {
        store: makeStore({
            SERVO1_FUNCTION: 4,
            SERVO1_MIN: 900,
            SERVO1_MAX: 2300,
            SERVO1_TRIM: 1500,
            SERVO1_REVERSED: 0,
            SERVO2_FUNCTION: 19,
            SERVO2_MIN: 1200,
            SERVO2_MAX: 1800,
            SERVO2_TRIM: 1600,
            SERVO2_REVERSED: 0,
            SERVO3_FUNCTION: 33,
            SERVO3_MIN: 1000,
            SERVO3_MAX: 2000,
            SERVO3_TRIM: 1500,
            SERVO3_REVERSED: 0,
            SERVO17_FUNCTION: 21,
            SERVO17_MIN: 1000,
            SERVO17_MAX: 2000,
            SERVO17_TRIM: 1500,
            SERVO17_REVERSED: 0,
        }),
        staged: new Map(),
        metadata: makeMetadata({
            SERVO1_FUNCTION: {
                humanName: "Servo 1 Function",
                description: "",
                values: [{ code: 4, label: "Aileron" }],
            },
            SERVO2_FUNCTION: {
                humanName: "Servo 2 Function",
                description: "",
                values: [{ code: 19, label: "Elevator" }],
            },
            SERVO17_FUNCTION: {
                humanName: "Servo 17 Function",
                description: "",
                values: [{ code: 21, label: "Rudder" }],
            },
        }),
        stage: () => { },
        ...overrides,
    };
}

function renderSection({
    params = makeParams(),
    telemetry = null,
    vehicleState = null,
}: {
    params?: ParamInputParams;
    telemetry?: Telemetry | null;
    vehicleState?: VehicleState | null;
} = {}) {
    return render(
        <ServoOutputsSection
            params={params}
            vehicleState={vehicleState}
            telemetry={telemetry}
        />,
    );
}

beforeEach(() => {
    setServo.mockReset();
});

afterEach(() => {
    cleanup();
});

describe("ServoOutputsSection", () => {
    it("renders the shared docs link for servo output mapping", () => {
        renderSection();

        expect(screen.getByRole("link", { name: /ardupilot docs/i }).getAttribute("href")).toBe(
            "https://ardupilot.org/copter/docs/common-rcoutput-mapping.html",
        );
    });

    it("renders direction tester grouped by function with guidance labels", () => {
        renderSection();

        expect(screen.getByText("Servo Direction Tester")).toBeTruthy();
        expect(screen.getAllByText("Aileron").length).toBeGreaterThan(0);
        expect(screen.getAllByText("Elevator").length).toBeGreaterThan(0);
        expect(screen.getByText(/SERVO17 · Rudder/i)).toBeTruthy();
        expect(screen.getAllByText(/Roll left/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/Pitch down/).length).toBeGreaterThan(0);
    });

    it("sends min PWM and shows direction confirmation after success", async () => {
        setServo.mockResolvedValue(undefined);

        renderSection();

        const sendMinButtons = screen.getAllByRole("button", { name: /send min/i });
        fireEvent.click(sendMinButtons[0]);

        await waitFor(() => {
            expect(setServo).toHaveBeenCalledWith(1, 1000);
        });

        expect(screen.getByRole("button", { name: "Correct" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Reversed" })).toBeTruthy();
    });

    it("shows error message on failed servo command and keeps buttons usable", async () => {
        setServo.mockRejectedValueOnce(new Error("link dropped"));

        renderSection();

        const sendMinButtons = screen.getAllByRole("button", { name: /send min/i });
        fireEvent.click(sendMinButtons[0]);

        await waitFor(() => {
            expect(screen.getByText(/link dropped/i)).toBeTruthy();
        });

        expect((sendMinButtons[0] as HTMLButtonElement).disabled).toBe(false);
    });

    it("stages servo reversal when user marks direction as reversed in direction tester", async () => {
        const stageFn = vi.fn();

        setServo.mockResolvedValue(undefined);

        renderSection({
            params: makeParams({ stage: stageFn }),
        });

        const sendMinButtons = screen.getAllByRole("button", { name: /send min/i });
        fireEvent.click(sendMinButtons[0]);

        await waitFor(() => {
            expect(setServo).toHaveBeenCalledWith(1, 1000);
        });

        fireEvent.click(screen.getByRole("button", { name: "Reversed" }));

        const reverseButton = screen.getByRole("button", { name: /reverse servo1/i });
        fireEvent.click(reverseButton);

        expect(stageFn).toHaveBeenCalledWith("SERVO1_REVERSED", 1);
    });

    it("shows disabled 'Reversal staged' button when servo reversal is already staged", async () => {
        const params = makeParams();
        params.staged.set("SERVO1_REVERSED", 1);

        setServo.mockResolvedValue(undefined);

        renderSection({ params });

        const sendMinButtons = screen.getAllByRole("button", { name: /send min/i });
        fireEvent.click(sendMinButtons[0]);

        await waitFor(() => {
            expect(setServo).toHaveBeenCalled();
        });

        fireEvent.click(screen.getByRole("button", { name: "Reversed" }));

        const stagedButton = screen.getByRole("button", { name: /reversal staged/i });
        expect(stagedButton).toBeTruthy();
        expect((stagedButton as HTMLButtonElement).disabled).toBe(true);
    });

    it("sends custom PWM via the raw slider input", async () => {
        setServo.mockResolvedValue(undefined);

        renderSection();

        const pwmInput = screen.getByLabelText(/pwm input for SERVO1/i) as HTMLInputElement;
        fireEvent.change(pwmInput, { target: { value: "1200" } });

        fireEvent.click(screen.getAllByRole("button", { name: /send pwm/i })[0]);

        await waitFor(() => {
            expect(setServo).toHaveBeenCalledWith(1, 1200);
        });
    });

    it("clamps raw PWM input to the servo safe range", () => {
        renderSection();

        const pwmInput = screen.getByLabelText(/pwm input for SERVO1/i) as HTMLInputElement;
        fireEvent.change(pwmInput, { target: { value: "5000" } });
        expect(pwmInput.value).toBe("2000");
    });

    it("shows live readback when telemetry is available", () => {
        renderSection({
            telemetry: {
                servo_outputs: [1502, 1608],
            },
        });

        expect(screen.getByText("1502")).toBeTruthy();
        expect(screen.getByText("1608")).toBeTruthy();
    });

    it("shows tilt-rotor guidance and groups VTOL outputs away from lift motors", () => {
        const params = makeParams({
            store: makeStore({
                Q_ENABLE: 1,
                Q_FRAME_CLASS: 10,
                Q_FRAME_TYPE: 0,
                Q_TILT_ENABLE: 1,
                SERVO1_FUNCTION: 75,
                SERVO1_MIN: 1000,
                SERVO1_MAX: 2000,
                SERVO1_TRIM: 1500,
                SERVO1_REVERSED: 0,
                SERVO2_FUNCTION: 33,
                SERVO2_MIN: 1000,
                SERVO2_MAX: 2000,
                SERVO2_TRIM: 1500,
                SERVO2_REVERSED: 0,
                SERVO3_FUNCTION: 4,
                SERVO3_MIN: 1000,
                SERVO3_MAX: 2000,
                SERVO3_TRIM: 1500,
                SERVO3_REVERSED: 0,
            }),
            metadata: makeMetadata({
                SERVO1_FUNCTION: {
                    humanName: "Servo 1 Function",
                    description: "",
                    values: [{ code: 75, label: "Tilt Front Left" }],
                },
                SERVO3_FUNCTION: {
                    humanName: "Servo 3 Function",
                    description: "",
                    values: [{ code: 4, label: "Aileron" }],
                },
            }),
        });

        renderSection({
            params,
            vehicleState: makeVehicleState("Fixed_Wing"),
        });

        expect(screen.getByText(/Tilt-rotor servo guidance/i)).toBeTruthy();
        expect(screen.getByText(/^VTOL Transition & Tilt Outputs$/i)).toBeTruthy();
        expect(screen.getByText(/^Auto-assigned lift motors$/i)).toBeTruthy();
        expect(screen.getByText(/^Other configured outputs$/i)).toBeTruthy();
        expect(screen.queryByText(/Fixed-wing servo setup/i)).toBeNull();
    });

    it("keeps incomplete tailsitter metadata on the generic group instead of hiding outputs", () => {
        const params = makeParams({
            store: makeStore({
                Q_ENABLE: 1,
                Q_FRAME_CLASS: 10,
                Q_FRAME_TYPE: 0,
                Q_TAILSIT_ENABLE: 1,
                SERVO1_FUNCTION: 88,
                SERVO1_MIN: 1000,
                SERVO1_MAX: 2000,
                SERVO1_TRIM: 1500,
                SERVO1_REVERSED: 0,
                SERVO2_FUNCTION: 4,
                SERVO2_MIN: 1000,
                SERVO2_MAX: 2000,
                SERVO2_TRIM: 1500,
                SERVO2_REVERSED: 0,
            }),
            metadata: makeMetadata({
                SERVO2_FUNCTION: {
                    humanName: "Servo 2 Function",
                    description: "",
                    values: [{ code: 4, label: "Aileron" }],
                },
            }),
        });

        renderSection({
            params,
            vehicleState: makeVehicleState("Fixed_Wing"),
        });

        expect(screen.getByText(/Tailsitter servo guidance/i)).toBeTruthy();
        expect(screen.queryByText(/^Tailsitter Control Outputs$/i)).toBeNull();
        expect(screen.getByText(/^Configured outputs$/i)).toBeTruthy();
        expect(screen.getByText(/All configured outputs stay editable here/i)).toBeTruthy();
    });
});
