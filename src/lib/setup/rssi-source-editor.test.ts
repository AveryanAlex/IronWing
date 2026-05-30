import { describe, expect, it } from "vitest";

import type { ParameterItemModel } from "../params/parameter-item-model";
import {
  clampRssiDraftValue,
  requiredRssiSourceParameterNames,
  resolveRssiChannelPwm,
  resolveRssiSourceOptions,
  scaleRssiPwmToPercent,
} from "./rssi-source-editor";

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

describe("requiredRssiSourceParameterNames", () => {
  it("maps every supported RSSI source to only its AP_RSSI settings", () => {
    expect(requiredRssiSourceParameterNames(0)).toEqual([]);
    expect(requiredRssiSourceParameterNames(1)).toEqual(["RSSI_ANA_PIN", "RSSI_PIN_LOW", "RSSI_PIN_HIGH"]);
    expect(requiredRssiSourceParameterNames(2)).toEqual(["RSSI_CHANNEL", "RSSI_CHAN_LOW", "RSSI_CHAN_HIGH"]);
    expect(requiredRssiSourceParameterNames(3)).toEqual([]);
    expect(requiredRssiSourceParameterNames(4)).toEqual(["RSSI_ANA_PIN", "RSSI_CHAN_LOW", "RSSI_CHAN_HIGH"]);
    expect(requiredRssiSourceParameterNames(5)).toEqual([]);
    expect(requiredRssiSourceParameterNames(99)).toEqual([]);
  });
});

describe("resolveRssiSourceOptions", () => {
  it("uses metadata labels and firmware additions while retaining accurate fallback sources", () => {
    expect(resolveRssiSourceOptions([
      { code: 2, label: "  Metadata RC PWM  " },
      { code: 9, label: "Firmware addition" },
    ], 11)).toEqual([
      { code: 0, label: "Disabled" },
      { code: 1, label: "Analog pin" },
      { code: 2, label: "Metadata RC PWM" },
      { code: 3, label: "Receiver protocol" },
      { code: 4, label: "PWM input pin" },
      { code: 5, label: "Telemetry radio RSSI" },
      { code: 9, label: "Firmware addition" },
      { code: 11, label: "Unknown source 11" },
    ]);
  });
});

describe("scaleRssiPwmToPercent", () => {
  it("clips ordinary PWM scaling to zero through one hundred percent", () => {
    expect(scaleRssiPwmToPercent(900, 1000, 2000)).toEqual({ percent: 0, equalRange: false, inverted: false, clipped: true });
    expect(scaleRssiPwmToPercent(1500, 1000, 2000)).toEqual({ percent: 50, equalRange: false, inverted: false, clipped: false });
    expect(scaleRssiPwmToPercent(2100, 1000, 2000)).toEqual({ percent: 100, equalRange: false, inverted: false, clipped: true });
  });

  it("supports intentionally inverted calibration ranges", () => {
    expect(scaleRssiPwmToPercent(2100, 2000, 1000)).toEqual({ percent: 0, equalRange: false, inverted: true, clipped: true });
    expect(scaleRssiPwmToPercent(1500, 2000, 1000)).toEqual({ percent: 50, equalRange: false, inverted: true, clipped: false });
    expect(scaleRssiPwmToPercent(900, 2000, 1000)).toEqual({ percent: 100, equalRange: false, inverted: true, clipped: true });
  });

  it("reports an equal calibration range without producing a preview percent", () => {
    expect(scaleRssiPwmToPercent(1500, 1500, 1500)).toEqual({ percent: null, equalRange: true, inverted: false, clipped: false });
  });
});

describe("resolveRssiChannelPwm", () => {
  it("resolves the live PWM sample from a staged channel selection", () => {
    expect(resolveRssiChannelPwm({
      channelItem: item("RSSI_CHANNEL", 6),
      stagedEdits: { RSSI_CHANNEL: { nextValue: 7 } },
      channels: [
        { channel: 6, pwm: 1200 },
        { channel: 7, pwm: 1800, stale: true },
      ],
    })).toEqual({ channel: 7, pwm: 1800, stale: true });
  });

  it("rejects disabled or out-of-contract channel selections", () => {
    const channels = [
      { channel: 0, pwm: 1000 },
      { channel: 17, pwm: 1700 },
    ];

    expect(resolveRssiChannelPwm({ channelValue: 0, channels })).toBeNull();
    expect(resolveRssiChannelPwm({ channelValue: 17, channels })).toBeNull();
  });
});

describe("clampRssiDraftValue", () => {
  it("applies metadata ranges and increments before staging", () => {
    const channelItem = item("RSSI_CHANNEL", 1, { range: { min: 1, max: 16 }, increment: 1 });
    expect(clampRssiDraftValue(channelItem, 20)).toBe(16);
    expect(clampRssiDraftValue(channelItem, 4.6)).toBe(5);
  });
});
