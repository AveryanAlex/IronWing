import { describe, expect, it } from "vitest";

import type { ParamMetadataMap } from "../../param-metadata";
import type { ParamStore } from "../../params";
import {
  buildOutputMappingModel,
  discoverPhysicalOutputs,
  planOutputFunctionAssignment,
} from "./output-mapping-model";

function createParamStore(entries: Record<string, number>): ParamStore {
  const params: ParamStore["params"] = {};
  let index = 0;
  for (const [name, value] of Object.entries(entries)) {
    params[name] = { name, value, param_type: "real32", index: index++ };
  }
  return { params, expected_count: index };
}

function createMetadata(): ParamMetadataMap {
  const values = [
    { code: -1, label: "GPIO" },
    { code: 0, label: "Disabled" },
    { code: 4, label: "Aileron" },
    { code: 19, label: "Elevator" },
    { code: 21, label: "Rudder" },
    { code: 33, label: "Motor1" },
    { code: 34, label: "Motor2" },
    { code: 41, label: "TiltMotorsFront" },
    { code: 70, label: "Throttle" },
    { code: 184, label: "Actuator1" },
  ];
  return new Map([
    ["SERVO1_FUNCTION", { humanName: "Servo 1 function", description: "", values }],
    ["SERVO3_FUNCTION", { humanName: "Servo 3 function", description: "", values }],
    ["SERVO7_FUNCTION", { humanName: "Servo 7 function", description: "", values }],
  ]);
}

describe("output mapping model", () => {
  it("discovers sparse physical outputs and uses staged values as the proposed map", () => {
    const outputs = discoverPhysicalOutputs({
      paramStore: createParamStore({
        SERVO1_FUNCTION: 4,
        SERVO3_FUNCTION: 0,
        SERVO7_FUNCTION: 33,
      }),
      metadata: createMetadata(),
      stagedEdits: { SERVO7_FUNCTION: { nextValue: 34 } },
    });

    expect(outputs.map((output) => output.index)).toEqual([1, 3, 7]);
    expect(outputs[2]).toMatchObject({
      appliedFunctionValue: 33,
      proposedFunctionValue: 34,
      proposedFunctionLabel: "Motor2",
      hasStagedChange: true,
    });
  });

  it("assigns one function to multiple outputs without clearing retained owners", () => {
    const plan = planOutputFunctionAssignment({
      paramStore: createParamStore({
        SERVO1_FUNCTION: 4,
        SERVO3_FUNCTION: 0,
        SERVO7_FUNCTION: 21,
      }),
      metadata: createMetadata(),
      stagedEdits: {},
    }, 4, [1, 3]);

    expect(plan?.edits).toEqual([{ paramName: "SERVO3_FUNCTION", nextValue: 4 }]);
    expect(plan?.desiredOutputIndexes).toEqual([1, 3]);
    expect(plan?.displacedAssignments).toEqual([]);
  });

  it("removes only deselected owners from a multi-output function", () => {
    const plan = planOutputFunctionAssignment({
      paramStore: createParamStore({
        SERVO1_FUNCTION: 4,
        SERVO3_FUNCTION: 4,
        SERVO7_FUNCTION: 4,
      }),
      metadata: createMetadata(),
      stagedEdits: {},
    }, 4, [1, 7]);

    expect(plan?.edits).toEqual([{ paramName: "SERVO3_FUNCTION", nextValue: 0 }]);
  });

  it("reports occupied outputs and required functions that lose their last owner", () => {
    const plan = planOutputFunctionAssignment({
      paramStore: createParamStore({
        SERVO1_FUNCTION: 4,
        SERVO3_FUNCTION: 33,
        SERVO7_FUNCTION: 0,
      }),
      metadata: createMetadata(),
      stagedEdits: {},
    }, 19, [3, 7], { requiredFunctionValues: [33] });

    expect(plan?.edits).toEqual([
      { paramName: "SERVO3_FUNCTION", nextValue: 19 },
      { paramName: "SERVO7_FUNCTION", nextValue: 19 },
    ]);
    expect(plan?.displacedAssignments).toEqual([{
      outputIndex: 3,
      previousFunctionValue: 33,
      previousFunctionLabel: "Motor1",
    }]);
    expect(plan?.newlyMissingRequiredFunctionValues).toEqual([33]);
  });

  it("allows mirrored motor assignments but marks them for review", () => {
    const plan = planOutputFunctionAssignment({
      paramStore: createParamStore({
        SERVO1_FUNCTION: 33,
        SERVO3_FUNCTION: 0,
      }),
      metadata: createMetadata(),
      stagedEdits: {},
    }, 33, [1, 3], { category: "propulsion" });

    expect(plan?.mirroredMotor).toBe(true);
    expect(plan?.edits).toEqual([{ paramName: "SERVO3_FUNCTION", nextValue: 33 }]);
  });

  it("builds a complete catalog while preserving unknown configured functions", () => {
    const model = buildOutputMappingModel({
      paramStore: createParamStore({
        SERVO1_FUNCTION: 999,
        SERVO3_FUNCTION: 0,
        SERVO7_FUNCTION: 4,
      }),
      metadata: createMetadata(),
      stagedEdits: {},
      vehicleType: "fixed_wing",
    });

    expect(model.catalog).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: -1, label: "GPIO" }),
      expect.objectContaining({ value: 184, label: "Actuator1" }),
      expect.objectContaining({ value: 999, label: "Function 999" }),
    ]));
    expect(model.servoRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 4, recommended: true }),
      expect.objectContaining({ value: 19, recommended: true }),
      expect.objectContaining({ value: 21, recommended: true }),
      expect.objectContaining({ value: 999, source: "configured" }),
    ]));
    expect(model.propulsionRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 70, recommended: true }),
    ]));
  });

  it("derives required copter motors from the proposed frame", () => {
    const model = buildOutputMappingModel({
      paramStore: createParamStore({
        FRAME_CLASS: 1,
        FRAME_TYPE: 1,
        SERVO1_FUNCTION: 33,
        SERVO2_FUNCTION: 34,
        SERVO3_FUNCTION: 0,
        SERVO4_FUNCTION: 0,
      }),
      metadata: createMetadata(),
      stagedEdits: {},
      vehicleType: "quadrotor",
    });

    expect(model.propulsionRows.filter((row) => row.required).map((row) => row.value)).toEqual([33, 34, 35, 36]);
    expect(model.missingRequiredCount).toBe(2);
  });

  it("locks only topology-dependent rows while a copter frame change is pending", () => {
    const model = buildOutputMappingModel({
      paramStore: createParamStore({
        FRAME_CLASS: 1,
        FRAME_TYPE: 1,
        SERVO1_FUNCTION: 33,
        SERVO2_FUNCTION: 4,
      }),
      metadata: createMetadata(),
      stagedEdits: { FRAME_CLASS: { nextValue: 7 } },
      vehicleType: "quadrotor",
    });

    expect(model.topologyMappingLocked).toBe(true);
    expect(model.propulsionRows.filter((row) => row.required).every((row) => row.mappingLocked)).toBe(true);
    expect(model.servoRows.find((row) => row.value === 4)?.mappingLocked).toBe(false);
  });
});
