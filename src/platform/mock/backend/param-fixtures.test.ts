import { describe, expect, it } from "vitest";

import { paramStoreForDemoPreset } from "./param-fixtures";

describe("param-fixtures", () => {
  it("loads demo SITL copter RTL and failsafe rows from fixtures", () => {
    const store = paramStoreForDemoPreset("quadcopter");

    expect(store.expected_count).toBeGreaterThan(0);
    expect(store.expected_count).toBe(Object.keys(store.params).length);
    expect(Object.keys(store.params)).toEqual(
      expect.arrayContaining([
        "RTL_ALT",
        "RTL_ALT_FINAL",
        "RTL_CLIMB_MIN",
        "RTL_SPEED",
        "RTL_LOIT_TIME",
        "FS_THR_ENABLE",
        "FS_GCS_ENABLE",
        "FS_EKF_ACTION",
        "FS_CRASH_CHECK",
        "BATT_FS_LOW_ACT",
        "BATT_FS_CRT_ACT",
      ]),
    );
  });

  it("loads demo SITL fixture plane RTL rows", () => {
    const store = paramStoreForDemoPreset("airplane");

    expect(store.expected_count).toBeGreaterThan(0);
    expect(store.expected_count).toBe(Object.keys(store.params).length);
    expect(store.params.ALT_HOLD_RTL).toMatchObject({ name: "ALT_HOLD_RTL", value: expect.any(Number) });
    expect(store.params.ALT_HOLD_RTL?.value).toBe(store.params.RTL_ALTITUDE?.value);
    expect(store.params.RTL_AUTOLAND).toMatchObject({ name: "RTL_AUTOLAND", value: expect.any(Number) });
  });

  it("loads demo SITL fixture quadplane compatibility rows", () => {
    const store = paramStoreForDemoPreset("quadplane");

    expect(store.expected_count).toBeGreaterThan(0);
    expect(store.expected_count).toBe(Object.keys(store.params).length);
    expect(store.params.Q_ENABLE).toMatchObject({ name: "Q_ENABLE", value: expect.any(Number) });
    expect(store.params.ALT_HOLD_RTL).toMatchObject({ name: "ALT_HOLD_RTL", value: expect.any(Number) });
    expect(store.params.ALT_HOLD_RTL?.value).toBe(store.params.RTL_ALTITUDE?.value);
  });
});
