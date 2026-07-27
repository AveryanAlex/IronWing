// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ParameterItemModel } from "../../../lib/params/parameter-item-model";
import VtolAssistSpeedEditor from "./VtolAssistSpeedEditor.svelte";

const item: ParameterItemModel = {
  name: "Q_ASSIST_SPEED",
  rawName: "Q_ASSIST_SPEED",
  label: "Quadplane assistance speed",
  description: null,
  value: 0,
  valueText: "0",
  valueLabel: null,
  units: "m/s",
  rebootRequired: false,
  order: 0,
  increment: 0.1,
  range: { min: 0, max: 100 },
  readOnly: false,
};

describe("VtolAssistSpeedEditor", () => {
  afterEach(() => cleanup());

  it("surfaces zero as unfinished and stages deliberate disable", async () => {
    const onValueChange = vi.fn();
    render(VtolAssistSpeedEditor, {
      props: {
        item,
        value: 0,
        suggestedSpeedMps: 9,
        minimumAirspeedMps: 12,
        airspeedSensorConfigured: true,
        onValueChange,
      },
    });

    expect(screen.getByText(/unfinished configuration/i)).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "Disabled deliberately" }));
    expect(onValueChange).toHaveBeenCalledWith(-1);
  });

  it("uses the contextual suggestion when automatic assistance is selected", async () => {
    const onValueChange = vi.fn();
    render(VtolAssistSpeedEditor, {
      props: {
        item,
        value: -1,
        suggestedSpeedMps: 9,
        minimumAirspeedMps: 12,
        airspeedSensorConfigured: true,
        onValueChange,
      },
    });

    await fireEvent.click(screen.getByRole("button", { name: "Automatic assistance" }));
    expect(onValueChange).toHaveBeenCalledWith(9);
  });

  it("accepts a positive manual threshold and warns for synthetic airspeed", async () => {
    const onValueChange = vi.fn();
    render(VtolAssistSpeedEditor, {
      props: {
        item,
        value: 8,
        suggestedSpeedMps: 9,
        minimumAirspeedMps: 12,
        airspeedSensorConfigured: false,
        onValueChange,
      },
    });

    expect(screen.getByText(/synthetic airspeed/i)).toBeTruthy();
    await fireEvent.input(screen.getByRole("spinbutton"), { target: { value: "8.5" } });
    expect(onValueChange).toHaveBeenCalledWith(8.5);
  });
});
