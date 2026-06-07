// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ParameterItemModel } from "../../../lib/params/parameter-item-model";
import SetupParamEditCard from "./SetupParamEditCard.svelte";
import SetupRcCaptureParamEditCard from "./SetupRcCaptureParamEditCard.svelte";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function item(name: string, overrides: Partial<ParameterItemModel> = {}): ParameterItemModel {
  return {
    name,
    rawName: name,
    label: name,
    description: null,
    value: 0,
    valueText: "0",
    valueLabel: null,
    units: null,
    rebootRequired: false,
    order: 0,
    increment: 1,
    range: null,
    readOnly: false,
    ...overrides,
  };
}

describe("SetupParamEditCard", () => {
  afterEach(() => cleanup());

  it("shows compact numeric metadata and reveals the description as a tooltip", async () => {
    const onValueChange = vi.fn();
    render(SetupParamEditCard, {
      props: {
        item: item("RC1_MIN", { range: { min: 800, max: 2200 }, value: 1000 }),
        label: "Minimum endpoint",
        description: "Lowest PWM observed at full travel.",
        value: 1000,
        unit: "µs",
        onValueChange,
      },
    });

    expect(screen.getByText("RC1_MIN · 800–2200 · step 1")).toBeTruthy();
    expect(screen.getByRole("slider")).toBeTruthy();
    expect(screen.queryByText("Lowest PWM observed at full travel.")).toBeNull();

    await fireEvent.click(screen.getByText("Minimum endpoint"));
    await waitFor(() => expect(screen.getByText("Lowest PWM observed at full travel.")).toBeTruthy());

    await fireEvent.input(screen.getByRole("spinbutton"), { target: { value: "1200" } });
    expect(onValueChange).toHaveBeenCalledWith(1200);
  });

  it("omits numeric step metadata for enum parameters", () => {
    render(SetupParamEditCard, {
      props: {
        item: item("Q_ENABLE", { range: { min: 0, max: 1 }, value: 0 }),
        label: "VTOL / QuadPlane",
        type: "enum",
        value: "0",
        options: [
          { code: 0, label: "Disabled" },
          { code: 1, label: "Enabled" },
        ],
      },
    });

    expect(screen.getByText("Q_ENABLE")).toBeTruthy();
    expect(screen.queryByText(/step 1/)).toBeNull();
    expect(screen.getByRole("switch")).toBeTruthy();
  });

  it("keeps numeric parameters without a finite range as number inputs only", () => {
    render(SetupParamEditCard, {
      props: {
        item: item("UNKNOWN_RANGE", { range: null, increment: null, value: 2 }),
      },
    });

    expect(screen.getByRole("spinbutton")).toBeTruthy();
    expect(screen.queryByRole("slider")).toBeNull();
  });

  it("shows short metadata units with the full unit name in a tooltip", async () => {
    render(SetupParamEditCard, {
      props: {
        item: item("BATT_LOW_MAH", {
          units: "mAh",
          unitText: "milliampere hour",
          value: 1000,
        }),
      },
    });

    expect(screen.getByText("mAh")).toBeTruthy();
    expect(screen.queryByText("milliampere hour")).toBeNull();

    await fireEvent.click(screen.getByText("mAh"));
    await waitFor(() => expect(screen.getByText("milliampere hour")).toBeTruthy());
  });
});

describe("SetupRcCaptureParamEditCard", () => {
  afterEach(() => cleanup());

  it("adds the RC capture-live action to the shared card", async () => {
    const onCaptureLive = vi.fn();
    render(SetupRcCaptureParamEditCard, {
      props: {
        item: item("RC1_TRIM", { value: 1500 }),
        label: "Center trim",
        value: 1500,
        onValueChange: () => {},
        onCaptureLive,
      },
    });

    await fireEvent.click(screen.getByRole("button", { name: "Capture live" }));
    expect(onCaptureLive).toHaveBeenCalledOnce();
  });
});
