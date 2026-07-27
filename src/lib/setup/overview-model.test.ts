import { describe, expect, it } from "vitest";

import type { ParamMetadataMap } from "../../param-metadata";
import type { ParamStore } from "../../params";
import { buildSetupOverviewModel } from "./overview-model";

function createParamStore(entries: Record<string, number>): ParamStore {
  const params: ParamStore["params"] = {};
  let index = 0;

  for (const [name, value] of Object.entries(entries)) {
    params[name] = {
      name,
      value,
      param_type: Number.isInteger(value) ? "int32" : "real32",
      index: index++,
    };
  }

  return {
    expected_count: index,
    params,
  };
}

function safeCopterParams(overrides: Record<string, number> = {}): ParamStore {
  return createParamStore({
    ARMING_CHECK: 1,
    ARMING_REQUIRE: 1,
    FS_THR_ENABLE: 1,
    FS_GCS_ENABLE: 1,
    BATT_LOW_VOLT: 14,
    BATT_CRT_VOLT: 13,
    RTL_ALT: 1500,
    FENCE_ENABLE: 1,
    FENCE_TYPE: 1,
    FENCE_ALT_MAX: 100,
    FENCE_ALT_MIN: 10,
    FRAME_CLASS: 1,
    FRAME_TYPE: 1,
    AHRS_ORIENTATION: 0,
    ...overrides,
  });
}

const metadata: ParamMetadataMap = new Map([
  ["FRAME_CLASS", { humanName: "Frame class", description: "", values: [{ code: 1, label: "Quad" }] }],
  ["FRAME_TYPE", { humanName: "Frame type", description: "", values: [{ code: 1, label: "X" }] }],
  ["AHRS_ORIENTATION", { humanName: "Board orientation", description: "", values: [{ code: 0, label: "None" }] }],
  ["FENCE_TYPE", { humanName: "Fence type", description: "", bitmask: [{ bit: 0, label: "Altitude" }] }],
]);

describe("setup overview model", () => {
  it("builds applied configuration identity without using staged frame values", () => {
    const model = buildSetupOverviewModel({
      vehicleType: "quadrotor",
      firmwareVersion: "ArduCopter 4.6.1",
      paramStore: safeCopterParams(),
      metadata,
      stagedEdits: {
        FRAME_TYPE: { nextValue: 2 },
      },
    });

    expect(model.identity).toEqual({
      vehicle: "Quadrotor",
      firmware: "ArduCopter 4.6.1",
      frame: "Quad · X",
      orientation: "None",
    });
  });

  it("distinguishes active findings, staged fixes, and staged regressions", () => {
    const model = buildSetupOverviewModel({
      vehicleType: "quadrotor",
      firmwareVersion: null,
      paramStore: safeCopterParams({
        FS_GCS_ENABLE: 0,
        FENCE_ENABLE: 0,
      }),
      metadata,
      stagedEdits: {
        FS_GCS_ENABLE: { nextValue: 1 },
        ARMING_CHECK: { nextValue: 0 },
      },
    });

    expect(model.safetyFindings.find((finding) => finding.detail === "GCS failsafe is disabled.")?.state).toBe(
      "pending_resolution",
    );
    expect(model.safetyFindings.find((finding) => finding.id === "arming-checks-disabled")).toMatchObject({
      state: "pending_introduction",
      tone: "danger",
    });
    expect(model.safetyFindings.find((finding) => finding.detail.startsWith("Fence is disabled"))?.state).toBe(
      "active",
    );
  });

  it("reports no safety findings for the checked safe baseline", () => {
    const model = buildSetupOverviewModel({
      vehicleType: "quadrotor",
      firmwareVersion: null,
      paramStore: safeCopterParams(),
      metadata,
      stagedEdits: {},
    });

    expect(model.safetyFindings).toEqual([]);
  });

  it("does not invent a fence-type finding when option metadata is unavailable", () => {
    const model = buildSetupOverviewModel({
      vehicleType: "quadrotor",
      firmwareVersion: null,
      paramStore: safeCopterParams(),
      metadata: null,
      stagedEdits: {},
    });

    expect(model.safetyFindings).toEqual([]);
  });

  it("uses explicit unavailable labels when configuration identity is missing", () => {
    const model = buildSetupOverviewModel({
      vehicleType: null,
      firmwareVersion: null,
      paramStore: null,
      metadata: null,
      stagedEdits: {},
    });

    expect(model.identity).toEqual({
      vehicle: "Unavailable",
      firmware: "Unavailable",
      frame: "Unavailable",
      orientation: "Unavailable",
    });
  });
});
