import { describe, expect, it } from "vitest";

import { loadSettings, settingsDefaults } from "./settings";

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

  it("returns fresh defaults for each load so messageRates is not shared", () => {
    const storage = { getItem: () => null };
    const first = loadSettings(storage);
    first.messageRates[77] = 3;

    const second = loadSettings(storage);
    expect(second.messageRates[77]).toBeUndefined();
  });
});
