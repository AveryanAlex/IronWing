// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParamMeta, ParamMetadataMap } from "../../../param-metadata";
import type { ParamStore } from "../../../params";
import type { Telemetry } from "../../../telemetry";
import type { ParamInputParams } from "../primitives/param-helpers";
import { ServoOutputsSection } from "./ServoOutputsSection";

const { setServo } = vi.hoisted(() => ({
  setServo: vi.fn(),
}));

vi.mock("../../../calibration", () => ({
  setServo,
}));

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
}: {
  params?: ParamInputParams;
  telemetry?: Telemetry | null;
} = {}) {
  return render(
    <ServoOutputsSection
      params={params}
      vehicleState={null}
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
  it("renders a shared tester card with supported targets, live readback, and unsupported outputs", async () => {
    setServo.mockResolvedValue(undefined);

    renderSection({
      telemetry: {
        servo_outputs: [1502, 1608],
      },
    });

    expect(screen.getByText("Servo Tester")).toBeTruthy();
    expect(screen.getByRole("button", { name: /aileron/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /elevator/i })).toBeTruthy();
    expect(screen.getByText(/SERVO17 · Rudder/i)).toBeTruthy();
    expect(
      screen.getAllByText((_, element) =>
        element?.textContent?.includes("Live readback 1502 µs") ?? false,
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /rudder/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /elevator/i }));
    expect(
      screen.getAllByText((_, element) =>
        element?.textContent?.includes("Live readback 1608 µs") ?? false,
      ).length,
    ).toBeGreaterThan(0);

    const pwmInput = screen.getByLabelText(/raw pwm input for SERVO2/i) as HTMLInputElement;
    fireEvent.change(pwmInput, { target: { value: "2500" } });
    expect(setServo).not.toHaveBeenCalled();
    expect(pwmInput.value).toBe("1800");

    fireEvent.click(screen.getByRole("button", { name: /send pwm/i }));

    await waitFor(() => {
      expect(setServo).toHaveBeenCalledWith(2, 1800);
    });
  });

  it("shows waiting copy when a command succeeds before live readback telemetry arrives", async () => {
    setServo.mockResolvedValue(undefined);

    renderSection();

    fireEvent.click(screen.getByRole("button", { name: /send trim/i }));

    await waitFor(() => {
      expect(setServo).toHaveBeenCalledWith(1, 1500);
    });

    expect(screen.getAllByText(/waiting for live servo output telemetry/i).length).toBeGreaterThan(0);
  });

  it("surfaces rejected setServo calls in the card and leaves controls usable", async () => {
    setServo.mockRejectedValueOnce(new Error("link dropped"));

    renderSection({
      telemetry: {
        servo_outputs: [1498],
      },
    });

    const sendButton = screen.getByRole("button", { name: /send pwm/i }) as HTMLButtonElement;
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(screen.getByText(/servo test failed: link dropped/i)).toBeTruthy();
    });

    expect(sendButton.disabled).toBe(false);
  });
});
