import { describe, expect, it } from "vitest";

import type { ParameterItemModel } from "../params/parameter-item-model";
import { normalizeRcPwm, resolveRcStickMarker } from "./rc-input-normalization";

function item(name: string, value: number): ParameterItemModel {
  return {
    name,
    rawName: name,
    label: name,
    description: null,
    value,
    valueText: String(value),
    valueLabel: null,
    units: null,
    rebootRequired: false,
    order: 0,
    increment: null,
    range: null,
    readOnly: false,
  };
}

function index(values: Record<string, number>): Map<string, ParameterItemModel> {
  return new Map(Object.entries(values).map(([name, value]) => [name, item(name, value)]));
}

describe("normalizeRcPwm", () => {
  it("matches ArduPilot-style trim-centered normalization", () => {
    expect(normalizeRcPwm(1500, "norm_input", { min: 1000, trim: 1500, max: 2000 })).toBeCloseTo(0);
    expect(normalizeRcPwm(2000, "norm_input", { min: 1000, trim: 1500, max: 2000 })).toBeCloseTo(1);
    expect(normalizeRcPwm(1000, "norm_input", { min: 1000, trim: 1500, max: 2000 })).toBeCloseTo(-1);
  });

  it("applies deadzone and reverse", () => {
    expect(normalizeRcPwm(1520, "norm_input_dz", { min: 1000, trim: 1500, max: 2000, deadZone: 30 })).toBeCloseTo(0);
    expect(normalizeRcPwm(2000, "norm_input_dz", { min: 1000, trim: 1500, max: 2000, deadZone: 30, reversed: true })).toBeCloseTo(-1);
  });
});

describe("resolveRcStickMarker", () => {
  it("uses staged/current RCMAP and RC calibration params", () => {
    const itemIndex = index({
      RCMAP_ROLL: 2,
      RC2_MIN: 1000,
      RC2_TRIM: 1500,
      RC2_MAX: 2000,
      RC2_DZ: 0,
      RC2_REVERSED: 0,
    });

    const marker = resolveRcStickMarker({
      role: "roll",
      mode: "norm_input_dz",
      channels: [{ channel: 2, pwm: 1750 }],
      itemIndex,
    });

    expect(marker).toMatchObject({ channel: 2, pwm: 1750, stale: false });
    expect(marker?.stick).toBeCloseTo(0.5);
  });

  it("returns null when the mapped live channel is missing", () => {
    const marker = resolveRcStickMarker({
      role: "yaw",
      mode: "norm_input_dz",
      channels: [{ channel: 1, pwm: 1500 }],
      itemIndex: index({ RCMAP_YAW: 4 }),
    });

    expect(marker).toBeNull();
  });
});
