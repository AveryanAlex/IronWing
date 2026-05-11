import { describe, expect, it } from "vitest";

import type { ParamMetadataMap } from "../../param-metadata";
import type { ParamStore } from "../../params";
import {
  COPTER_BATTERY_FS_OPTIONS,
  COPTER_GCS_FS_OPTIONS,
  COPTER_RADIO_FS_OPTIONS,
  FAILSAFE_DEFAULTS_COPTER,
  FAILSAFE_DEFAULTS_PLANE,
  FAILSAFE_DEFAULTS_ROVER,
  ROVER_FS_ACTION_OPTIONS,
  buildFailsafeDefaultsPreview,
  buildFailsafeSectionModel,
  buildGeofenceModel,
  buildRtlReturnModel,
  resolveSafetyVehicleFamily,
} from "./failsafe-model";
import { paramStoreForDemoPreset } from "../../platform/mock/backend/param-fixtures";

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

function toMetadataValues(options: readonly { value: number; label: string }[]) {
  return options.map((option) => ({ code: option.value, label: option.label }));
}

function createMetadata(): ParamMetadataMap {
  return new Map([
    ["FS_THR_ENABLE", { humanName: "Radio failsafe", description: "", values: toMetadataValues(COPTER_RADIO_FS_OPTIONS) }],
    ["FS_GCS_ENABLE", { humanName: "GCS failsafe", description: "", values: toMetadataValues(COPTER_GCS_FS_OPTIONS) }],
    ["BATT_FS_LOW_ACT", { humanName: "Low battery", description: "", values: toMetadataValues(COPTER_BATTERY_FS_OPTIONS) }],
    ["BATT_FS_CRT_ACT", { humanName: "Critical battery", description: "", values: toMetadataValues(COPTER_BATTERY_FS_OPTIONS) }],
    ["FS_EKF_ACTION", { humanName: "EKF failsafe", description: "", values: [{ code: 0, label: "Disabled" }, { code: 1, label: "Land" }] }],
    ["FS_CRASH_CHECK", { humanName: "Crash check", description: "", values: [{ code: 0, label: "Disabled" }, { code: 1, label: "Enabled" }] }],
    ["THR_FAILSAFE", { humanName: "Throttle failsafe", description: "", values: [{ code: 0, label: "Disabled" }, { code: 1, label: "Enabled" }] }],
    ["FS_LONG_ACTN", { humanName: "Long failsafe", description: "", values: [{ code: 0, label: "Disabled" }, { code: 1, label: "RTL" }] }],
    ["FS_SHORT_ACTN", { humanName: "Short failsafe", description: "", values: [{ code: 0, label: "Disabled" }, { code: 1, label: "Circle" }] }],
    ["FS_ACTION", { humanName: "Rover failsafe", description: "", values: toMetadataValues(ROVER_FS_ACTION_OPTIONS) }],
    ["RTL_AUTOLAND", { humanName: "Auto land", description: "", values: [{ code: 0, label: "Loiter at home" }, { code: 2, label: "Always land at home" }] }],
    ["FENCE_ENABLE", { humanName: "Fence enable", description: "", values: [{ code: 0, label: "Disabled" }, { code: 1, label: "Enabled" }] }],
    ["FENCE_ACTION", { humanName: "Fence action", description: "", values: [{ code: 0, label: "Report only" }, { code: 1, label: "RTL / Hold" }] }],
    [
      "FENCE_TYPE",
      {
        humanName: "Fence type",
        description: "",
        bitmask: [
          { bit: 0, label: "Alt max" },
          { bit: 1, label: "Circle" },
          { bit: 2, label: "Polygon" },
          { bit: 3, label: "Alt min" },
        ],
      },
    ],
  ]);
}

describe("failsafe-model", () => {
  it("maps vehicle families conservatively", () => {
    expect(resolveSafetyVehicleFamily("quadrotor")).toBe("copter");
    expect(resolveSafetyVehicleFamily("fixed_wing")).toBe("plane");
    expect(resolveSafetyVehicleFamily("ground_rover")).toBe("rover");
    expect(resolveSafetyVehicleFamily("submarine")).toBe("unknown");
  });

  it("keeps the audited defaults tables intact", () => {
    expect(FAILSAFE_DEFAULTS_COPTER.map((entry) => entry.paramName)).toEqual([
      "FS_THR_ENABLE",
      "FS_EKF_ACTION",
      "BATT_FS_LOW_ACT",
      "BATT_FS_CRT_ACT",
      "FS_CRASH_CHECK",
    ]);
    expect(FAILSAFE_DEFAULTS_PLANE.map((entry) => entry.paramName)).toEqual([
      "THR_FAILSAFE",
      "BATT_FS_LOW_ACT",
      "BATT_FS_CRT_ACT",
    ]);
    expect(FAILSAFE_DEFAULTS_ROVER).toEqual([
      { paramName: "FS_ACTION", value: 1, label: "Radio / GCS → RTL" },
      { paramName: "FS_TIMEOUT", value: 5, label: "GCS Timeout → 5 s" },
      { paramName: "BATT_FS_LOW_ACT", value: 2, label: "Low Battery → RTL" },
      { paramName: "BATT_FS_CRT_ACT", value: 1, label: "Critical Battery → Land" },
    ]);
  });

  it("builds defaults previews from staged-or-current values", () => {
    const preview = buildFailsafeDefaultsPreview({
      vehicleType: "ground_rover",
      paramStore: createParamStore({
        FS_ACTION: 0,
        FS_TIMEOUT: 5,
        BATT_FS_LOW_ACT: 0,
        BATT_FS_CRT_ACT: 1,
      }),
      metadata: createMetadata(),
      stagedEdits: {
        BATT_FS_LOW_ACT: { nextValue: 2 },
      },
    });

    expect(preview).toEqual([
      expect.objectContaining({ paramName: "FS_ACTION", currentValue: 0, willChange: true }),
      expect.objectContaining({ paramName: "FS_TIMEOUT", currentValue: 5, willChange: false }),
      expect.objectContaining({ paramName: "BATT_FS_LOW_ACT", currentValue: 2, willChange: false }),
      expect.objectContaining({ paramName: "BATT_FS_CRT_ACT", currentValue: 1, willChange: false }),
    ]);
  });

  it("surfaces vehicle-aware failsafe recovery and warning states", () => {
    const model = buildFailsafeSectionModel({
      vehicleType: "quadrotor",
      paramStore: createParamStore({
        FS_THR_ENABLE: 0,
        FS_THR_VALUE: 975,
        FS_GCS_ENABLE: 0,
        BATT_FS_LOW_ACT: 2,
        BATT_LOW_VOLT: 13.6,
        BATT_LOW_MAH: 1200,
        BATT_FS_CRT_ACT: 1,
        BATT_CRT_VOLT: 13.8,
        BATT_CRT_MAH: 500,
        FS_EKF_ACTION: 1,
        FS_EKF_THRESH: 0.8,
        FS_CRASH_CHECK: 1,
      }),
      metadata: createMetadata(),
      stagedEdits: {},
    });

    expect(model.family).toBe("copter");
    expect(model.warningTexts.join(" ")).toContain("Radio failsafe is disabled");
    expect(model.warningTexts.join(" ")).toContain("GCS failsafe is disabled");
    expect(model.warningTexts.join(" ")).toContain("Low-voltage threshold");
    expect(model.recoveryReasons).toHaveLength(0);
    expect(model.canConfirm).toBe(true);
  });

  it("fails closed when required failsafe enum metadata is partial", () => {
    const metadata = createMetadata();
    metadata.delete("FS_ACTION");

    const model = buildFailsafeSectionModel({
      vehicleType: "ground_rover",
      paramStore: createParamStore({
        FS_ACTION: 1,
        FS_TIMEOUT: 5,
        BATT_FS_LOW_ACT: 2,
        BATT_LOW_VOLT: 13.8,
        BATT_LOW_MAH: 1000,
        BATT_FS_CRT_ACT: 1,
        BATT_CRT_VOLT: 13.2,
        BATT_CRT_MAH: 500,
      }),
      metadata,
      stagedEdits: {},
    });

    expect(model.recoveryReasons.join(" ")).toContain("FS_ACTION metadata is missing or malformed");
    expect(model.canConfirm).toBe(false);
  });

  it("summarizes vehicle-aware RTL surfaces and warns about unsafe copter return altitude", () => {
    const copterModel = buildRtlReturnModel({
      vehicleType: "quadrotor",
      paramStore: createParamStore({
        RTL_ALT: 0,
        RTL_ALT_FINAL: 0,
        RTL_CLIMB_MIN: 0,
        RTL_SPEED: 500,
        RTL_LOIT_TIME: 5000,
      }),
      metadata: createMetadata(),
      stagedEdits: {},
    });
    const roverModel = buildRtlReturnModel({
      vehicleType: "ground_rover",
      paramStore: createParamStore({ RTL_SPEED: 250, WP_RADIUS: 2 }),
      metadata: createMetadata(),
      stagedEdits: {},
    });

    expect(copterModel.summaryText).toContain("Return altitude 0.0 m");
    expect(copterModel.warningTexts.join(" ")).toContain("RTL_ALT is 0");
    expect(roverModel.summaryText).toContain("Approach radius 2.0 m");
    expect(roverModel.detailText).toContain("Rover return");
  });

  it("keeps the copter demo SITL fixture RTL model open instead of failing closed", () => {
    const model = buildRtlReturnModel({
      vehicleType: "quadrotor",
      paramStore: paramStoreForDemoPreset("quadcopter"),
      metadata: createMetadata(),
      stagedEdits: {},
    });

    expect(model.recoveryReasons).toEqual([]);
    expect(model.canConfirm).toBe(true);
  });

  it("keeps the plane demo SITL fixture RTL model open instead of failing closed", () => {
    const model = buildRtlReturnModel({
      vehicleType: "fixed_wing",
      paramStore: paramStoreForDemoPreset("airplane"),
      metadata: createMetadata(),
      stagedEdits: {},
    });

    expect(model.recoveryReasons).toEqual([]);
    expect(model.canConfirm).toBe(true);
  });

  it("keeps the copter demo SITL fixture failsafe model open instead of failing closed", () => {
    const model = buildFailsafeSectionModel({
      vehicleType: "quadrotor",
      paramStore: paramStoreForDemoPreset("quadcopter"),
      metadata: createMetadata(),
      stagedEdits: {},
    });

    expect(model.recoveryReasons).toEqual([]);
    expect(model.canConfirm).toBe(true);
  });

  it("keeps geofence fail-closed when the fence-type bitmask metadata is malformed", () => {
    const metadata = createMetadata();
    metadata.delete("FENCE_TYPE");

    const model = buildGeofenceModel({
      vehicleType: "fixed_wing",
      paramStore: createParamStore({
        FENCE_ENABLE: 1,
        FENCE_TYPE: 0b0011,
        FENCE_ACTION: 1,
        FENCE_ALT_MAX: 120,
        FENCE_MARGIN: 5,
      }),
      metadata,
      stagedEdits: {},
    });

    expect(model.recoveryReasons.join(" ")).toContain("FENCE_TYPE bitmask metadata is missing or malformed");
    expect(model.canConfirm).toBe(false);
  });

  it("keeps zero configured fence types explicit instead of claiming setup is complete", () => {
    const model = buildGeofenceModel({
      vehicleType: "quadrotor",
      paramStore: createParamStore({
        FENCE_ENABLE: 1,
        FENCE_TYPE: 0,
        FENCE_ACTION: 1,
        FENCE_ALT_MAX: 120,
        FENCE_ALT_MIN: 20,
        FENCE_RADIUS: 300,
        FENCE_MARGIN: 5,
      }),
      metadata: createMetadata(),
      stagedEdits: {},
    });

    expect(model.selectedTypeCount).toBe(0);
    expect(model.warningTexts.join(" ")).toContain("no fence types are selected");
    expect(model.canConfirm).toBe(false);
  });
});
