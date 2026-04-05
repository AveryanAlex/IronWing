import { describe, expect, it } from "vitest";

import {
  isValidMessageRateHz,
  isValidTelemetryRateHz,
  loadSettings,
  settingsDefaults,
} from "./settings";

describe("loadSettings", () => {
  it("returns defaults when storage is empty", () => {
    const storage = { getItem: () => null };

    expect(loadSettings(storage)).toEqual(settingsDefaults);
  });

  it("normalizes parsed persisted values explicitly", () => {
    const storage = {
      getItem: () =>
        JSON.stringify({
          telemetryRateHz: 8,
          svsEnabled: false,
          messageRates: {
            1: 2,
            2: "bad",
            3: 0,
            4: 99,
            foo: 9,
          },
          terrainSafetyMarginM: "invalid",
          cruiseSpeedMps: 17,
          hoverSpeedMps: null,
        }),
    };

    expect(loadSettings(storage)).toEqual({
      telemetryRateHz: 8,
      svsEnabled: false,
      messageRates: { 1: 2 },
      terrainSafetyMarginM: settingsDefaults.terrainSafetyMarginM,
      cruiseSpeedMps: 17,
      hoverSpeedMps: settingsDefaults.hoverSpeedMps,
    });
  });

  it("falls back to defaults for malformed live-setting values before returning state", () => {
    const storage = {
      getItem: () =>
        JSON.stringify({
          telemetryRateHz: 100,
          messageRates: {
            1: -1,
            2: 0.01,
            3: 75,
          },
        }),
    };

    expect(loadSettings(storage)).toEqual({
      ...settingsDefaults,
      messageRates: {},
    });
  });

  it("returns fresh defaults for each load so messageRates is not shared", () => {
    const storage = { getItem: () => null };
    const first = loadSettings(storage);
    first.messageRates[77] = 3;

    const second = loadSettings(storage);
    expect(second.messageRates[77]).toBeUndefined();
  });
});

describe("live settings validators", () => {
  it("accepts only integer telemetry rates in the supported range", () => {
    expect(isValidTelemetryRateHz(1)).toBe(true);
    expect(isValidTelemetryRateHz(20)).toBe(true);
    expect(isValidTelemetryRateHz(0)).toBe(false);
    expect(isValidTelemetryRateHz(20.5)).toBe(false);
    expect(isValidTelemetryRateHz(21)).toBe(false);
  });

  it("accepts only finite message rates in the supported range", () => {
    expect(isValidMessageRateHz(0.1)).toBe(true);
    expect(isValidMessageRateHz(50)).toBe(true);
    expect(isValidMessageRateHz(0.09)).toBe(false);
    expect(isValidMessageRateHz(51)).toBe(false);
    expect(isValidMessageRateHz(Number.NaN)).toBe(false);
  });
});
