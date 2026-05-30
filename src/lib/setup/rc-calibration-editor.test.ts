import { describe, expect, it } from "vitest";

import type { ParameterItemModel } from "../params/parameter-item-model";
import {
  calculateRcCalibrationRange,
  clampRcCalibrationDraftValue,
  discoverRcCalibrationChannels,
  resolveRcCalibrationValues,
  validateRcCalibrationDraft,
} from "./rc-calibration-editor";

function item(name: string, value: number, overrides: Partial<ParameterItemModel> = {}): ParameterItemModel {
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
    ...overrides,
  };
}

function index(values: Record<string, number>): Map<string, ParameterItemModel> {
  return new Map(Object.entries(values).map(([name, value]) => [name, item(name, value)]));
}

describe("discoverRcCalibrationChannels", () => {
  it("discovers only available RC1..RC16 parameter families and annotates mapped roles", () => {
    const itemIndex = index({
      RC1_MIN: 1000,
      RC1_TRIM: 1500,
      RC1_MAX: 2000,
      RC3_DZ: 30,
      RC17_MIN: 1000,
      RCMAP_ROLL: 3,
      RCMAP_YAW: 1,
    });

    expect(discoverRcCalibrationChannels(itemIndex)).toEqual([
      { channel: 1, roles: ["yaw"], roleLabel: "Yaw", optionLabel: "CH1 · Yaw" },
      { channel: 3, roles: ["roll"], roleLabel: "Roll", optionLabel: "CH3 · Roll" },
    ]);
  });

  it("uses staged mapping values supplied by the resolver", () => {
    const itemIndex = index({ RC2_MIN: 1000, RC4_MAX: 2000, RCMAP_PITCH: 2 });
    expect(discoverRcCalibrationChannels(itemIndex, (name) => (name === "RCMAP_PITCH" ? 4 : itemIndex.get(name)?.value ?? null))).toMatchObject([
      { channel: 2, roleLabel: null },
      { channel: 4, roleLabel: "Pitch" },
    ]);
  });
});

describe("validateRcCalibrationDraft", () => {
  it("reports invalid endpoint ordering", () => {
    expect(validateRcCalibrationDraft({ min: 1500, trim: 1500, max: 2000, deadZone: 30, reversed: false })).toEqual({
      valid: false,
      messages: ["Keep calibration points ordered as MIN < TRIM < MAX."],
    });
  });

  it("reports a deadzone that extends beyond an endpoint", () => {
    expect(validateRcCalibrationDraft({ min: 1000, trim: 1100, max: 2000, deadZone: 101, reversed: false })).toEqual({
      valid: false,
      messages: ["Deadzone cannot extend beyond either endpoint."],
    });
  });

  it("uses normalization-compatible fallbacks when optional params are missing", () => {
    expect(resolveRcCalibrationValues(3, index({ RC3_MIN: 1020 }))).toEqual({
      min: 1020,
      trim: 1500,
      max: 1900,
      deadZone: 0,
      reversed: false,
    });
  });
});

describe("calculateRcCalibrationRange", () => {
  it("positions trim, deadzone, and a live marker relative to endpoints", () => {
    expect(calculateRcCalibrationRange({ min: 1000, trim: 1500, max: 2000, deadZone: 50, reversed: false }, 1750)).toEqual({
      trimPct: 50,
      deadZoneStartPct: 45,
      deadZoneEndPct: 55,
      livePct: 75,
    });
  });

  it("clamps metadata-aware drafts to range and increment", () => {
    expect(clampRcCalibrationDraftValue(item("RC1_MIN", 1000, { increment: 5, range: { min: 900, max: 2100 } }), 1234)).toBe(1235);
    expect(clampRcCalibrationDraftValue(item("RC1_MIN", 1000, { increment: 5, range: { min: 900, max: 2100 } }), 5000)).toBe(2100);
  });
});
