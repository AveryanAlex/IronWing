import { describe, expect, it } from "vitest";

import type { ParamStore } from "../../params";
import type { FlightModeEntry } from "../../telemetry";
import {
  FLIGHT_MODE_CHANNEL_PARAM,
  FLIGHT_MODE_PARAM_NAMES,
  buildFlightModeModel,
  buildFlightModePresetPreviewRows,
  getActiveFlightModeSlotIndex,
  modeNameForValue,
  normalizeAvailableModes,
  toggleFlightModeBitmaskValue,
  vehicleTypeToFlightModePreset,
} from "./flight-mode-model";

function createParamStore(entries: Record<string, number>): ParamStore {
  const params: ParamStore["params"] = {};
  let index = 0;

  for (const [name, value] of Object.entries(entries)) {
    params[name] = {
      name,
      value,
      param_type: Number.isInteger(value) ? "uint8" : "real32",
      index: index++,
    };
  }

  return {
    expected_count: index,
    params,
  };
}

const COPTER_MODES: FlightModeEntry[] = [
  { custom_mode: 0, name: "Stabilize" },
  { custom_mode: 2, name: "AltHold" },
  { custom_mode: 3, name: "Auto" },
  { custom_mode: 5, name: "Loiter" },
  { custom_mode: 6, name: "RTL" },
  { custom_mode: 9, name: "Land" },
];

describe("flight-mode-model", () => {
  it("maps vehicle families to the correct recommended preset", () => {
    expect(vehicleTypeToFlightModePreset("quadrotor")).toBe("copter");
    expect(vehicleTypeToFlightModePreset("fixed_wing")).toBe("plane");
    expect(vehicleTypeToFlightModePreset("ground_rover")).toBe("rover");
    expect(vehicleTypeToFlightModePreset("submarine")).toBeNull();
  });

  it("normalizes availableModes rows and drops malformed entries", () => {
    const normalized = normalizeAvailableModes([
      { custom_mode: 5, name: "Loiter" },
      { custom_mode: "oops", name: "Bad" },
      { custom_mode: 5, name: "Duplicate" },
      { custom_mode: 6, name: "RTL" },
      { custom_mode: 7, name: "" },
    ]);

    expect(normalized.options).toEqual([
      { customMode: 5, name: "Loiter" },
      { customMode: 6, name: "RTL" },
    ]);
    expect(normalized.malformedCount).toBe(3);
  });

  it("detects the active slot from RC PWM ranges", () => {
    expect(getActiveFlightModeSlotIndex([0, 0, 0, 0, 1100], 5)).toBe(0);
    expect(getActiveFlightModeSlotIndex([0, 0, 0, 0, 1495], 5)).toBe(3);
    expect(getActiveFlightModeSlotIndex([0, 0, 0, 0, 1800], 5)).toBe(5);
    expect(getActiveFlightModeSlotIndex([0, 0, 0, 0, 0], 5)).toBeNull();
  });

  it("builds a live copter model with preset support and simple-mode slots", () => {
    const model = buildFlightModeModel({
      vehicleType: "quadrotor",
      paramStore: createParamStore({
        [FLIGHT_MODE_CHANNEL_PARAM]: 5,
        [FLIGHT_MODE_PARAM_NAMES[0]]: 0,
        [FLIGHT_MODE_PARAM_NAMES[1]]: 2,
        [FLIGHT_MODE_PARAM_NAMES[2]]: 5,
        [FLIGHT_MODE_PARAM_NAMES[3]]: 6,
        [FLIGHT_MODE_PARAM_NAMES[4]]: 9,
        [FLIGHT_MODE_PARAM_NAMES[5]]: 3,
        SIMPLE: 0b000001,
        SUPER_SIMPLE: 0b001000,
      }),
      stagedEdits: {},
      availableModes: COPTER_MODES,
      currentModeName: "Loiter",
      rcChannels: [0, 0, 0, 0, 1450],
      liveConnected: true,
      sameScope: false,
      telemetrySettled: true,
    });

    expect(model.preset).toBe("copter");
    expect(model.availabilityState).toBe("live");
    expect(model.activeSlotIndex).toBe(2);
    expect(model.currentModeName).toBe("Loiter");
    expect(model.simpleModeSupported).toBe(true);
    expect(model.simpleModeSlots[0]).toMatchObject({ slot: 1, checked: true });
    expect(model.superSimpleSlots[3]).toMatchObject({ slot: 4, checked: true });
    expect(model.canStagePreset).toBe(true);
    expect(model.canConfirm).toBe(true);
  });

  it("fails closed to stale mode visibility when the live mode list disappears on the same scope", () => {
    const model = buildFlightModeModel({
      vehicleType: "quadrotor",
      paramStore: createParamStore({
        [FLIGHT_MODE_CHANNEL_PARAM]: 5,
        [FLIGHT_MODE_PARAM_NAMES[0]]: 0,
        [FLIGHT_MODE_PARAM_NAMES[1]]: 2,
        [FLIGHT_MODE_PARAM_NAMES[2]]: 5,
        [FLIGHT_MODE_PARAM_NAMES[3]]: 6,
        [FLIGHT_MODE_PARAM_NAMES[4]]: 9,
        [FLIGHT_MODE_PARAM_NAMES[5]]: 3,
      }),
      stagedEdits: {},
      availableModes: [],
      previousAvailableModes: COPTER_MODES,
      currentModeName: "Loiter",
      rcChannels: [0, 0, 0, 0, 1450],
      liveConnected: false,
      sameScope: true,
      telemetrySettled: false,
    });

    expect(model.availabilityState).toBe("stale");
    expect(model.availabilityText).toContain("Stale");
    expect(model.options).toHaveLength(COPTER_MODES.length);
    expect(model.canStagePreset).toBe(false);
    expect(model.canConfirm).toBe(false);
  });

  it("falls back to raw mode numbers when current slot values are not in the available-mode list", () => {
    const model = buildFlightModeModel({
      vehicleType: "quadrotor",
      paramStore: createParamStore({
        [FLIGHT_MODE_CHANNEL_PARAM]: 5,
        [FLIGHT_MODE_PARAM_NAMES[0]]: 99,
        [FLIGHT_MODE_PARAM_NAMES[1]]: 2,
        [FLIGHT_MODE_PARAM_NAMES[2]]: 5,
        [FLIGHT_MODE_PARAM_NAMES[3]]: 6,
        [FLIGHT_MODE_PARAM_NAMES[4]]: 9,
        [FLIGHT_MODE_PARAM_NAMES[5]]: 3,
      }),
      stagedEdits: {},
      availableModes: [{ custom_mode: 2, name: "AltHold" }, { custom_mode: 5, name: "Loiter" }],
      currentModeName: "Loiter",
      rcChannels: [0, 0, 0, 0, 1450],
      liveConnected: true,
      sameScope: false,
      telemetrySettled: true,
    });

    expect(model.slots[0]?.effectiveName).toBe("Mode 99");
    expect(model.slots[0]?.unresolved).toBe(true);
    expect(model.recoveryReasons.join(" ")).toContain("current available-mode list");
    expect(model.canConfirm).toBe(false);
  });

  it("builds preset preview rows against staged-or-current values", () => {
    const rows = buildFlightModePresetPreviewRows(
      "copter",
      createParamStore({
        [FLIGHT_MODE_PARAM_NAMES[0]]: 5,
        [FLIGHT_MODE_PARAM_NAMES[1]]: 2,
        [FLIGHT_MODE_PARAM_NAMES[2]]: 5,
      }),
      {},
      COPTER_MODES.map((entry) => ({ customMode: entry.custom_mode, name: entry.name })),
    );

    expect(rows[0]).toMatchObject({
      key: FLIGHT_MODE_PARAM_NAMES[0],
      label: "Slot 1",
      detail: "Loiter → Stabilize",
      willChange: true,
    });
    expect(rows[1]).toMatchObject({
      key: FLIGHT_MODE_PARAM_NAMES[1],
      detail: "AltHold",
      willChange: false,
    });
  });

  it("toggles simple/super-simple bitmasks by slot", () => {
    expect(toggleFlightModeBitmaskValue(0, 2)).toBe(0b000100);
    expect(toggleFlightModeBitmaskValue(0b001000, 3)).toBe(0);
  });

  it("resolves mode names with fallback labels and raw mode numbers", () => {
    const options = COPTER_MODES.map((entry) => ({ customMode: entry.custom_mode, name: entry.name }));
    expect(modeNameForValue(5, options)).toBe("Loiter");
    expect(modeNameForValue(42, options, "FBW-A")).toBe("FBW-A");
    expect(modeNameForValue(42, options)).toBe("Mode 42");
  });
});
