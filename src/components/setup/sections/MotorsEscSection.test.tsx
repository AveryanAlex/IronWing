// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { motorTest } from "../../../calibration";
import type { ParamStore } from "../../../params";
import type { VehicleState } from "../../../telemetry";
import type { ParamInputParams } from "../primitives/param-helpers";
import { MotorsEscSection } from "./MotorsEscSection";

vi.mock("../../../calibration", () => ({
  motorTest: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

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
    <MotorsEscSection
      params={makeParams(store)}
      vehicleState={vehicleState}
      connected={true}
    />,
  );
}

describe("MotorsEscSection", () => {
  it("uses the Q_M_* lift-motor surface for AP_Motors-backed QuadPlane layouts", () => {
    const { container } = renderSection({
      store: {
        Q_ENABLE: 1,
        Q_FRAME_CLASS: 1,
        Q_FRAME_TYPE: 1,
        Q_M_PWM_TYPE: 1,
        Q_M_PWM_MIN: 1000,
        Q_M_PWM_MAX: 2000,
        Q_M_SPIN_ARM: 0.1,
        Q_M_SPIN_MIN: 0.15,
        Q_M_SPIN_MAX: 0.95,
      },
    });

    expect(screen.getByText("ESC Protocol")).toBeTruthy();
    expect(container.querySelector('[data-setup-param="Q_M_PWM_TYPE"]')).toBeTruthy();
    expect(screen.getByText("Motor Test")).toBeTruthy();
    expect(screen.getByText("VTOL Motor Layout")).toBeTruthy();
    expect(screen.queryByText("Throttle Configuration")).toBeNull();
    expect(container.querySelector('[data-setup-param="THR_MAX"]')).toBeNull();
  });

  it("keeps VTOL param cards hidden while still exposing motor test rows when Q_M_* params are missing", () => {
    renderSection({
      store: {
        Q_ENABLE: 1,
        Q_FRAME_CLASS: 1,
        Q_FRAME_TYPE: 1,
      },
    });

    expect(
      screen.getByText(/QuadPlane lift-motor parameters are not fully loaded yet/i),
    ).toBeTruthy();
    expect(screen.queryByText("ESC Protocol")).toBeNull();
    expect(screen.getByText("Motor Test")).toBeTruthy();
    expect(screen.queryByText("Throttle Configuration")).toBeNull();
  });

  it("shows expected direction badges for a copter Quad X motor test card", () => {
    renderSection({
      vehicleState: makeVehicleState("Quadrotor"),
      store: {
        FRAME_CLASS: 1,
        FRAME_TYPE: 1,
        MOT_PWM_TYPE: 1,
        MOT_PWM_MIN: 1000,
        MOT_PWM_MAX: 2000,
        MOT_SPIN_ARM: 0.1,
        MOT_SPIN_MIN: 0.15,
        MOT_SPIN_MAX: 0.95,
      },
    });

    expect(screen.getAllByText("CW ↻")).toHaveLength(2);
    expect(screen.getAllByText("CCW ↺")).toHaveLength(2);
  });

  it("renders motor test buttons in ArduPilot test order instead of motor number order", () => {
    renderSection({
      vehicleState: makeVehicleState("Quadrotor"),
      store: {
        FRAME_CLASS: 1,
        FRAME_TYPE: 1,
        MOT_PWM_TYPE: 1,
        MOT_PWM_MIN: 1000,
        MOT_PWM_MAX: 2000,
        MOT_SPIN_ARM: 0.1,
        MOT_SPIN_MIN: 0.15,
        MOT_SPIN_MAX: 0.95,
      },
    });

    expect(
      screen.getAllByRole("button", { name: /test motor/i }).map((button) => button.textContent),
    ).toEqual(["Test motor 1", "Test motor 4", "Test motor 2", "Test motor 3"]);
  });

  it("shows Correct/Reversed confirmation controls after a successful motor test", async () => {
    const mockedMotorTest = vi.mocked(motorTest);

    renderSection({
      vehicleState: makeVehicleState("Quadrotor"),
      store: {
        FRAME_CLASS: 1,
        FRAME_TYPE: 1,
        MOT_PWM_TYPE: 1,
        MOT_PWM_MIN: 1000,
        MOT_PWM_MAX: 2000,
        MOT_SPIN_ARM: 0.1,
        MOT_SPIN_MIN: 0.15,
        MOT_SPIN_MAX: 0.95,
      },
    });

    fireEvent.click(screen.getByRole("switch", { name: "" }));
    fireEvent.click(screen.getByRole("button", { name: /props removed/i }));
    fireEvent.click(screen.getByRole("button", { name: /test motor 1/i }));

    await waitFor(() => {
      expect(mockedMotorTest).toHaveBeenCalledWith(1, 3, 2);
    });

    const correctButton = await screen.findByRole("button", { name: "Correct" });
    const reversedButton = screen.getByRole("button", { name: "Reversed" });

    expect(correctButton).toBeTruthy();
    expect(reversedButton).toBeTruthy();

    fireEvent.click(correctButton);

    expect(screen.getByText("1/4 verified")).toBeTruthy();
  });

  it("uses the custom tilt-rotor model for QuadPlane lift motors outside AP_Motors", () => {
    const { container } = renderSection({
      store: {
        Q_ENABLE: 1,
        Q_FRAME_CLASS: 10,
        Q_FRAME_TYPE: 0,
        Q_TILT_ENABLE: 1,
        Q_M_PWM_TYPE: 1,
        Q_M_PWM_MIN: 1000,
        Q_M_PWM_MAX: 2000,
        Q_M_SPIN_ARM: 0.1,
        Q_M_SPIN_MIN: 0.15,
        Q_M_SPIN_MAX: 0.95,
      },
    });

    expect(screen.getByText("Motor Test")).toBeTruthy();
    expect(screen.getByText("VTOL Motor Layout")).toBeTruthy();
    expect(screen.queryByText("Throttle Configuration")).toBeNull();
    expect(container.querySelector('[data-setup-param="Q_M_SPIN_ARM"]')).toBeTruthy();
  });

  it("keeps custom tailsitter layouts on VTOL guidance copy plus plane throttle controls while exposing motor test", () => {
    renderSection({
      store: {
        Q_ENABLE: 1,
        Q_FRAME_CLASS: 10,
        Q_FRAME_TYPE: 0,
        Q_TAILSIT_ENABLE: 1,
        THR_MAX: 100,
        THR_MIN: 0,
        THR_SLEWRATE: 20,
      },
    });

    expect(
      screen.getByText(/Motor Test is available below for propulsion-direction checks/i),
    ).toBeTruthy();
    expect(screen.getByText("Throttle Configuration")).toBeTruthy();
    expect(screen.getByText("Motor Test")).toBeTruthy();
    expect(screen.queryByText("ESC Protocol")).toBeNull();
  });
});
