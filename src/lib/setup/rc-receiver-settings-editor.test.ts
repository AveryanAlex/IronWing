import { describe, expect, it } from "vitest";

import type { ParameterItemModel } from "../params/parameter-item-model";
import {
  clampRcReceiverSettingDraftValue,
  discoverRcReceiverSettings,
  isRcReceiverBitEnabled,
  normalizeRcReceiverBitmaskOptions,
  resolveRcReceiverBitmaskOptions,
  resolveRcReceiverSettingDraftValue,
  resolveRcReceiverSettingEditState,
  toggleRcReceiverBit,
} from "./rc-receiver-settings-editor";

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

describe("discoverRcReceiverSettings", () => {
  it("returns only receiver settings exposed by the active firmware", () => {
    const options = item("RC_OPTIONS", 32);
    const failsafeTimeout = item("RC_FS_TIMEOUT", 1);
    const index = new Map([
      ["OTHER_SETTING", item("OTHER_SETTING", 7)],
      [options.name, options],
      [failsafeTimeout.name, failsafeTimeout],
    ]);

    expect(discoverRcReceiverSettings(index).map((setting) => setting.name)).toEqual([
      "RC_FS_TIMEOUT",
      "RC_OPTIONS",
    ]);
  });
});

describe("receiver bitmask options", () => {
  it("normalizes metadata labels, removes invalid entries, and uses metadata ahead of fallbacks", () => {
    const metadata = [
      { bit: 9, label: "  Metadata CRSF  " },
      { bit: 9, label: "Preferred CRSF" },
      { bit: -1, label: "Invalid" },
      { bit: 4, label: "" },
    ];

    expect(normalizeRcReceiverBitmaskOptions(metadata)).toEqual([{ bit: 9, label: "Preferred CRSF" }]);
    expect(resolveRcReceiverBitmaskOptions("RC_PROTOCOLS", metadata)).toEqual([{ bit: 9, label: "Preferred CRSF" }]);
    expect(resolveRcReceiverBitmaskOptions("RC_PROTOCOLS", null)[0]).toEqual({ bit: 0, label: "All" });
  });

  it("keeps fallback protocol bits aligned to the local RC_Channels source contract", () => {
    const fallbackProtocols = resolveRcReceiverBitmaskOptions("RC_PROTOCOLS", null);

    expect(fallbackProtocols.map((option) => option.bit)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    expect(fallbackProtocols[fallbackProtocols.length - 1]).toEqual({ bit: 16, label: "MAVRadio" });
  });

  it("toggles integer mask bits without discarding unrelated selections", () => {
    expect(toggleRcReceiverBit(1, 9, true)).toBe(513);
    expect(toggleRcReceiverBit(513, 0, false)).toBe(512);
    expect(toggleRcReceiverBit(512, 9, false)).toBe(0);
    expect(isRcReceiverBitEnabled(513, 0)).toBe(true);
    expect(isRcReceiverBitEnabled(513, 9)).toBe(true);
  });
});

describe("receiver numeric draft values", () => {
  it("preserves the documented never-timeout override sentinel even outside metadata range", () => {
    const timeout = item("RC_OVERRIDE_TIME", -1, { range: { min: 0, max: 120 }, increment: 0.1 });

    expect(resolveRcReceiverSettingDraftValue(timeout, {}, {})).toBe(-1);
    expect(resolveRcReceiverSettingDraftValue(timeout, { RC_OVERRIDE_TIME: { nextValue: -1 } }, {})).toBe(-1);
    expect(clampRcReceiverSettingDraftValue(timeout, -1)).toBe(-1);
  });

  it("clamps edited values with metadata range and increment", () => {
    const timeout = item("RC_FS_TIMEOUT", 1, { range: { min: 0.1, max: 10 }, increment: 0.1 });

    expect(clampRcReceiverSettingDraftValue(timeout, 14)).toBe(10);
    expect(clampRcReceiverSettingDraftValue(timeout, 0.36)).toBe(0.4);
    expect(clampRcReceiverSettingDraftValue(timeout, 0)).toBe(0.1);
  });
});

describe("resolveRcReceiverSettingEditState", () => {
  it("distinguishes staged values from local draft changes", () => {
    const timeout = item("RC_FS_TIMEOUT", 1, { increment: 0.1 });

    expect(resolveRcReceiverSettingEditState(timeout, {}, {})).toEqual({
      draftValue: 1,
      staged: false,
      changed: false,
      locallyEdited: false,
      pendingStage: false,
    });
    expect(resolveRcReceiverSettingEditState(timeout, { RC_FS_TIMEOUT: { nextValue: 2 } }, {})).toEqual({
      draftValue: 2,
      staged: true,
      changed: true,
      locallyEdited: false,
      pendingStage: false,
    });
    expect(resolveRcReceiverSettingEditState(timeout, { RC_FS_TIMEOUT: { nextValue: 2 } }, { RC_FS_TIMEOUT: 3 })).toEqual({
      draftValue: 3,
      staged: true,
      changed: true,
      locallyEdited: true,
      pendingStage: true,
    });
  });
});
