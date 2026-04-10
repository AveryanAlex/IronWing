import { describe, expect, it } from "vitest";

import type { ParamStore } from "../../params";
import {
  buildInitialParamsModel,
  createResolvedInitialParamsInputs,
} from "./initial-params-model";

function createParamStore(entries: Record<string, number>): ParamStore {
  const params: ParamStore["params"] = {};
  let index = 0;

  for (const [name, value] of Object.entries(entries)) {
    params[name] = {
      name,
      value,
      param_type: Number.isInteger(value) ? "uint32" : "real32",
      index: index++,
    };
  }

  return {
    expected_count: index,
    params,
  };
}

function createCopterInitialParamsStore(): ParamStore {
  return createParamStore({
    FRAME_CLASS: 1,
    FRAME_TYPE: 1,
    MOT_THST_EXPO: 0.42,
    MOT_THST_HOVER: 0.25,
    MOT_BAT_VOLT_MAX: 16.2,
    MOT_BAT_VOLT_MIN: 13.2,
    INS_GYRO_FILTER: 20,
    INS_ACCEL_FILTER: 20,
    ATC_RAT_PIT_FLTD: 15,
    ATC_RAT_PIT_FLTE: 5,
    ATC_RAT_PIT_FLTT: 15,
    ATC_RAT_RLL_FLTD: 15,
    ATC_RAT_RLL_FLTE: 5,
    ATC_RAT_RLL_FLTT: 15,
    ATC_RAT_YAW_FLTD: 0,
    ATC_RAT_YAW_FLTE: 2,
    ATC_RAT_YAW_FLTT: 10,
    ATC_ACCEL_P_MAX: 8000,
    ATC_ACCEL_R_MAX: 8000,
    ATC_ACCEL_Y_MAX: 8000,
    ATC_THR_MIX_MAN: 0.2,
    ACRO_YAW_P: 0.8,
    BATT_ARM_VOLT: 13.3,
    BATT_LOW_VOLT: 14.4,
    BATT_CRT_VOLT: 14.0,
    BATT_FS_LOW_ACT: 1,
    BATT_FS_CRT_ACT: 0,
    FENCE_ENABLE: 0,
    FENCE_TYPE: 0,
    FENCE_ACTION: 0,
    FENCE_ALT_MAX: 120,
  });
}

function createQuadPlaneInitialParamsStore(entries: Record<string, number> = {}): ParamStore {
  return createParamStore({
    Q_ENABLE: 1,
    Q_FRAME_CLASS: 1,
    Q_FRAME_TYPE: 1,
    Q_M_THST_EXPO: 0.42,
    Q_M_THST_HOVER: 0.25,
    Q_M_BAT_VOLT_MAX: 16.2,
    Q_M_BAT_VOLT_MIN: 13.2,
    Q_A_RAT_PIT_FLTD: 15,
    Q_A_RAT_PIT_FLTE: 5,
    Q_A_RAT_PIT_FLTT: 15,
    Q_A_RAT_RLL_FLTD: 15,
    Q_A_RAT_RLL_FLTE: 5,
    Q_A_RAT_RLL_FLTT: 15,
    Q_A_RAT_YAW_FLTD: 0,
    Q_A_RAT_YAW_FLTE: 2,
    Q_A_RAT_YAW_FLTT: 10,
    Q_A_ACCEL_P_MAX: 8000,
    Q_A_ACCEL_R_MAX: 8000,
    Q_A_ACCEL_Y_MAX: 8000,
    Q_A_THR_MIX_MAN: 0.2,
    INS_GYRO_FILTER: 20,
    INS_ACCEL_FILTER: 20,
    ACRO_YAW_P: 0.8,
    BATT_ARM_VOLT: 13.3,
    BATT_LOW_VOLT: 14.4,
    BATT_CRT_VOLT: 14.0,
    BATT_FS_LOW_ACT: 1,
    BATT_FS_CRT_ACT: 0,
    FENCE_ENABLE: 0,
    FENCE_TYPE: 0,
    FENCE_ACTION: 0,
    FENCE_ALT_MAX: 120,
    ...entries,
  });
}

describe("buildInitialParamsModel", () => {
  it("builds copter starter batches with standard parameter families", () => {
    const model = buildInitialParamsModel({
      vehicleType: "quadrotor",
      paramStore: createCopterInitialParamsStore(),
      metadata: null,
      stagedEdits: {},
      inputs: {
        propInches: 9,
        cellCount: 4,
        chemistryIndex: 0,
      },
    });

    expect(model.family.state).toBe("copter");
    expect(model.batches.map((batch) => batch.id)).toEqual([
      "control_baseline",
      "battery_compensation",
      "safety_defaults",
    ]);
    expect(model.batches[0]?.rows.some((row) => row.paramName === "MOT_THST_EXPO")).toBe(true);
    expect(model.batches[0]?.rows.some((row) => row.paramName === "ATC_RAT_PIT_FLTD")).toBe(true);
    expect(model.totalChangeCount).toBeGreaterThan(0);
    expect(model.recoveryReasons).toEqual([]);
  });

  it("remaps starter rows to Q_A_* and Q_M_* for VTOL-ready QuadPlane scopes", () => {
    const model = buildInitialParamsModel({
      vehicleType: "fixed_wing",
      paramStore: createQuadPlaneInitialParamsStore(),
      metadata: null,
      stagedEdits: {},
      inputs: {
        propInches: 10,
        cellCount: 6,
        chemistryIndex: 0,
      },
    });

    expect(model.family.state).toBe("quadplane");
    expect(model.batches[0]?.rows.some((row) => row.paramName === "Q_M_THST_EXPO")).toBe(true);
    expect(model.batches[0]?.rows.some((row) => row.paramName === "Q_A_RAT_PIT_FLTD")).toBe(true);
    expect(model.batches[0]?.rows.some((row) => row.paramName === "ATC_RAT_PIT_FLTD")).toBe(false);
    expect(model.recoveryReasons).toEqual([]);
  });

  it("locks QuadPlane staging when the Q_A_* or Q_M_* starter families are incomplete", () => {
    const paramStore = createQuadPlaneInitialParamsStore();
    delete paramStore.params.Q_A_RAT_PIT_FLTD;
    paramStore.expected_count -= 1;

    const model = buildInitialParamsModel({
      vehicleType: "fixed_wing",
      paramStore,
      metadata: null,
      stagedEdits: {},
      inputs: {
        propInches: 10,
        cellCount: 6,
        chemistryIndex: 0,
      },
    });

    expect(model.recoveryReasons.join(" ")).toContain("Q_A_RAT_PIT_FLTD");
    expect(model.batches.every((batch) => batch.stageAllowed === false)).toBe(true);
    expect(model.canConfirm).toBe(false);
  });

  it("retains the last valid preview but disables staging while current inputs are malformed", () => {
    const model = buildInitialParamsModel({
      vehicleType: "quadrotor",
      paramStore: createCopterInitialParamsStore(),
      metadata: null,
      stagedEdits: {},
      inputs: {
        propInches: null,
        cellCount: 4,
        chemistryIndex: 99,
      },
      fallbackInputs: createResolvedInitialParamsInputs({
        propInches: 9,
        cellCount: 4,
        chemistryIndex: 0,
      }),
    });

    expect(model.usingFallbackInputs).toBe(true);
    expect(model.previewStateText).toBe("Stale preview retained");
    expect(model.validationMessage).toContain("prop size");
    expect(model.batches.length).toBeGreaterThan(0);
    expect(model.batches.every((batch) => batch.stageAllowed === false)).toBe(true);
  });

  it("surfaces purposeful unsupported copy for plain fixed-wing scopes", () => {
    const model = buildInitialParamsModel({
      vehicleType: "fixed_wing",
      paramStore: createParamStore({ Q_ENABLE: 0 }),
      metadata: null,
      stagedEdits: {},
      inputs: {
        propInches: 9,
        cellCount: 4,
        chemistryIndex: 0,
      },
    });

    expect(model.family.state).toBe("plain-plane");
    expect(model.batches).toEqual([]);
    expect(model.recoveryReasons[0]).toContain("Fixed-wing");
  });
});
