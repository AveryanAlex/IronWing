import { describe, expect, it } from "vitest";

import type { ParameterItemModel } from "../params/parameter-item-model";
import {
  clampRcOptionDraftValue,
  detectDuplicateEnabledRcOptionAssignments,
  discoverRcOptionAssignments,
  filterRcFunctionOptions,
  normalizeRcFunctionOptions,
  preserveSelectedRcFunctionOption,
  resolveRcOptionLiveSample,
} from "./rc-option-assignment";

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

describe("discoverRcOptionAssignments", () => {
  it("discovers only existing RC1..RC16 option parameters and sorts by channel", () => {
    const itemIndex = new Map([
      ["RC16_OPTION", item("RC16_OPTION", 160)],
      ["RC3_OPTION", item("RC3_OPTION", 3)],
      ["RC17_OPTION", item("RC17_OPTION", 17)],
      ["RC2_MIN", item("RC2_MIN", 1000)],
      ["RC1_OPTION", item("RC1_OPTION", 1)],
    ]);

    expect(discoverRcOptionAssignments(itemIndex).map(({ channel, name }) => ({ channel, name }))).toEqual([
      { channel: 1, name: "RC1_OPTION" },
      { channel: 3, name: "RC3_OPTION" },
      { channel: 16, name: "RC16_OPTION" },
    ]);
  });

  it("uses staged assignment values in summaries and duplicate review", () => {
    const itemIndex = new Map([
      ["RC5_OPTION", item("RC5_OPTION", 0)],
      ["RC6_OPTION", item("RC6_OPTION", 219)],
    ]);

    expect(discoverRcOptionAssignments(itemIndex, { RC5_OPTION: { nextValue: 219 } })).toMatchObject([
      { channel: 5, value: 219, staged: true, duplicateChannels: [5, 6] },
      { channel: 6, value: 219, staged: false, duplicateChannels: [5, 6] },
    ]);
  });
});

describe("metadata-derived RC function options", () => {
  it("normalizes metadata options and filters labels or codes without losing firmware additions", () => {
    const options = normalizeRcFunctionOptions([
      { code: 300, label: "  Scripting 1  " },
      { code: 219, label: "Transmitter Tuning" },
      { code: 219, label: "Duplicate ignored" },
      { code: Number.NaN, label: "Invalid" },
      { code: 42, label: " " },
    ]);

    expect(options).toEqual([
      { code: 219, label: "Transmitter Tuning" },
      { code: 300, label: "Scripting 1" },
    ]);
    expect(filterRcFunctionOptions(options, "tuning")).toEqual([{ code: 219, label: "Transmitter Tuning" }]);
    expect(filterRcFunctionOptions(options, "300")).toEqual([{ code: 300, label: "Scripting 1" }]);
  });

  it("keeps a selected staged option visible while search filtering changes", () => {
    const options = normalizeRcFunctionOptions([
      { code: 0, label: "Do Nothing" },
      { code: 219, label: "Transmitter Tuning" },
    ]);

    expect(preserveSelectedRcFunctionOption(filterRcFunctionOptions(options, "nothing"), options, 219)).toEqual([
      { code: 219, label: "Transmitter Tuning", preserved: true },
      { code: 0, label: "Do Nothing" },
    ]);
  });
});

describe("detectDuplicateEnabledRcOptionAssignments", () => {
  it("flags duplicate enabled assignments but ignores disabled zero values", () => {
    expect(detectDuplicateEnabledRcOptionAssignments([
      { channel: 5, value: 0 },
      { channel: 6, value: 0 },
      { channel: 7, value: 300 },
      { channel: 8, value: 300 },
      { channel: 9, value: 219 },
    ])).toEqual([{ value: 300, channels: [7, 8] }]);
  });
});

describe("resolveRcOptionLiveSample", () => {
  it("returns the finite live PWM and stale state for a channel", () => {
    expect(resolveRcOptionLiveSample(7, [
      { channel: 6, pwm: 1400 },
      { channel: 7, pwm: 1800, stale: true },
    ])).toEqual({ pwm: 1800, stale: true });
    expect(resolveRcOptionLiveSample(8, [{ channel: 8, pwm: Number.NaN }])).toBeNull();
  });

  it("clamps raw numeric edits to metadata range and increment", () => {
    expect(clampRcOptionDraftValue(item("RC7_OPTION", 0, { range: { min: 0, max: 400 }, increment: 5 }), 403)).toBe(400);
    expect(clampRcOptionDraftValue(item("RC7_OPTION", 0, { range: { min: 0, max: 400 }, increment: 5 }), 218)).toBe(220);
  });
});
