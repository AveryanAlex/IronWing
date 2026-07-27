import { describe, expect, it } from "vitest";

import type { ParamStore } from "../../params";
import { listVtolPhysicalOutputs, planVtolOutputAssignment } from "./vtol-output-mapping";

function createParamStore(entries: Record<string, number>): ParamStore {
  const params: ParamStore["params"] = {};
  let index = 0;
  for (const [name, value] of Object.entries(entries)) {
    params[name] = { name, value, param_type: "real32", index: index++ };
  }
  return { params, expected_count: index };
}

describe("VTOL output mapping", () => {
  it("lists applied and proposed ownership without suggesting an output", () => {
    const outputs = listVtolPhysicalOutputs({
      paramStore: createParamStore({ SERVO1_FUNCTION: 4, SERVO5_FUNCTION: 33 }),
      stagedEdits: { SERVO5_FUNCTION: { nextValue: 34 } },
    });
    expect(outputs).toEqual([
      expect.objectContaining({ index: 1, appliedFunctionValue: 4, proposedFunctionValue: 4 }),
      expect.objectContaining({ index: 5, appliedFunctionValue: 33, proposedFunctionValue: 34, hasStagedChange: true }),
    ]);
  });

  it("moves a function and reports the explicitly displaced owner", () => {
    const input = {
      paramStore: createParamStore({
        SERVO5_FUNCTION: 33,
        SERVO6_FUNCTION: 34,
        SERVO7_FUNCTION: 4,
      }),
      stagedEdits: {},
    };
    expect(planVtolOutputAssignment(input, 33, 7)).toEqual({
      functionValue: 33,
      targetOutputIndex: 7,
      previousOutputIndexes: [5],
      displacedFunctionValue: 4,
      edits: [
        { paramName: "SERVO5_FUNCTION", nextValue: 0 },
        { paramName: "SERVO7_FUNCTION", nextValue: 33 },
      ],
    });
  });

  it("can explicitly unassign a logical function", () => {
    const plan = planVtolOutputAssignment({
      paramStore: createParamStore({ SERVO5_FUNCTION: 33 }),
      stagedEdits: {},
    }, 33, null);
    expect(plan?.edits).toEqual([{ paramName: "SERVO5_FUNCTION", nextValue: 0 }]);
  });
});
