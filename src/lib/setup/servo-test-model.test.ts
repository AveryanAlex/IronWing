import { describe, expect, it } from "vitest";

import type { ParamMeta, ParamMetadataMap } from "../../param-metadata";
import type { ParamStore } from "../../params";
import { getDirectionGuidance } from "./servo-direction-guidance";
import {
  SERVO_COMMAND_PWM_MAX,
  SERVO_COMMAND_PWM_MIN,
  SERVO_LIVE_TEST_LIMIT,
  clampServoCommandPwm,
  deriveConfiguredServoOutputs,
  deriveServoOutputGroups,
  deriveServoTestTargets,
  groupServoTestTargetsByFunction,
  isMotorServoFunction,
  readServoOutputPwm,
} from "./servo-test-model";

function createParamStore(entries: Record<string, number>): ParamStore {
  const params: ParamStore["params"] = {};
  let index = 0;

  for (const [name, value] of Object.entries(entries)) {
    params[name] = { name, value, param_type: "real32", index: index++ };
  }

  return { params, expected_count: index };
}

function createMetadata(entries: Record<string, ParamMeta>): ParamMetadataMap {
  return new Map(Object.entries(entries));
}

describe("servo-test-model", () => {
  it("derives supported and unsupported non-motor targets with clamped safe windows", () => {
    const targets = deriveServoTestTargets({
      paramStore: createParamStore({
        SERVO1_FUNCTION: 4,
        SERVO1_MIN: 900,
        SERVO1_MAX: 2100,
        SERVO1_TRIM: 1520,
        SERVO1_REVERSED: 0,
        SERVO2_FUNCTION: 33,
        SERVO2_MIN: 1000,
        SERVO2_MAX: 2000,
        SERVO2_TRIM: 1500,
        SERVO17_FUNCTION: 19,
        SERVO17_MIN: 1200,
        SERVO17_MAX: 2300,
        SERVO17_TRIM: 2150,
        SERVO17_REVERSED: 0,
      }),
      metadata: createMetadata({
        SERVO1_FUNCTION: {
          humanName: "Servo 1 function",
          description: "",
          values: [{ code: 4, label: "Aileron" }],
        },
        SERVO17_FUNCTION: {
          humanName: "Servo 17 function",
          description: "",
          values: [{ code: 19, label: "Elevator" }],
        },
      }),
    });

    expect(targets).toHaveLength(2);
    expect(targets[0]).toMatchObject({
      index: 1,
      outputLabel: "SERVO1",
      functionValue: 4,
      functionLabel: "Aileron",
      minPwm: 1000,
      maxPwm: 2000,
      trimPwm: 1520,
      defaultPwm: 1520,
      reverseParamName: "SERVO1_REVERSED",
      supported: true,
      liveTestStatus: "available",
      liveTestReason: null,
    });
    expect(targets[1]).toMatchObject({
      index: 17,
      outputLabel: "SERVO17",
      functionValue: 19,
      functionLabel: "Elevator",
      minPwm: 1200,
      maxPwm: 2000,
      trimPwm: 2000,
      defaultPwm: 2000,
      reverseParamName: "SERVO17_REVERSED",
      supported: false,
      liveTestStatus: "unsupported-bridge",
    });
    expect(targets[1].liveTestReason).toContain("SERVO1–16");
  });

  it("groups supported servo testers by function and preserves target order", () => {
    const groups = groupServoTestTargetsByFunction(
      deriveServoTestTargets({
        paramStore: createParamStore({
          SERVO1_FUNCTION: 4,
          SERVO1_MIN: 1000,
          SERVO1_MAX: 2000,
          SERVO1_TRIM: 1500,
          SERVO2_FUNCTION: 19,
          SERVO2_MIN: 1100,
          SERVO2_MAX: 1900,
          SERVO2_TRIM: 1500,
          SERVO4_FUNCTION: 4,
          SERVO4_MIN: 1000,
          SERVO4_MAX: 2000,
          SERVO4_TRIM: 1500,
        }),
        metadata: createMetadata({
          SERVO1_FUNCTION: {
            humanName: "Servo 1 function",
            description: "",
            values: [{ code: 4, label: "Aileron" }],
          },
          SERVO2_FUNCTION: {
            humanName: "Servo 2 function",
            description: "",
            values: [{ code: 19, label: "Elevator" }],
          },
          SERVO4_FUNCTION: {
            humanName: "Servo 4 function",
            description: "",
            values: [{ code: 4, label: "Aileron" }],
          },
        }),
      }),
    );

    expect(groups.map((group) => group.functionLabel)).toEqual(["Aileron", "Elevator"]);
    expect(groups[0]?.targets.map((target) => target.index)).toEqual([1, 4]);
    expect(groups[1]?.targets.map((target) => target.index)).toEqual([2]);
  });

  it("falls back to a generic configured-output group when VTOL metadata is incomplete", () => {
    const groups = deriveServoOutputGroups(
      deriveConfiguredServoOutputs({
        paramStore: createParamStore({
          SERVO1_FUNCTION: 88,
          SERVO1_MIN: 1000,
          SERVO1_MAX: 2000,
          SERVO1_TRIM: 1500,
          SERVO2_FUNCTION: 4,
          SERVO2_MIN: 1000,
          SERVO2_MAX: 2000,
          SERVO2_TRIM: 1500,
        }),
        metadata: createMetadata({
          SERVO2_FUNCTION: {
            humanName: "Servo 2 function",
            description: "",
            values: [{ code: 4, label: "Aileron" }],
          },
        }),
      }),
      "tailsitter",
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      id: "general",
      title: "Configured outputs",
    });
    expect(groups[0]?.outputs.map((output) => output.index)).toEqual([1, 2]);
  });

  it("keeps motor-assigned outputs visible but out of the servo tester", () => {
    const outputs = deriveConfiguredServoOutputs({
      paramStore: createParamStore({
        SERVO1_FUNCTION: 33,
        SERVO1_MIN: 1000,
        SERVO1_MAX: 2000,
        SERVO1_TRIM: 1500,
        SERVO2_FUNCTION: 4,
        SERVO2_MIN: 1000,
        SERVO2_MAX: 2000,
        SERVO2_TRIM: 1500,
      }),
      metadata: createMetadata({
        SERVO2_FUNCTION: {
          humanName: "Servo 2 function",
          description: "",
          values: [{ code: 4, label: "Aileron" }],
        },
      }),
    });

    expect(outputs[0]).toMatchObject({
      index: 1,
      isMotorFunction: true,
      liveTestStatus: "motor-function",
    });
    expect(deriveServoTestTargets({
      paramStore: createParamStore({
        SERVO1_FUNCTION: 33,
        SERVO1_MIN: 1000,
        SERVO1_MAX: 2000,
        SERVO1_TRIM: 1500,
        SERVO2_FUNCTION: 4,
        SERVO2_MIN: 1000,
        SERVO2_MAX: 2000,
        SERVO2_TRIM: 1500,
      }),
      metadata: createMetadata({
        SERVO2_FUNCTION: {
          humanName: "Servo 2 function",
          description: "",
          values: [{ code: 4, label: "Aileron" }],
        },
      }),
    }).map((target) => target.index)).toEqual([2]);
  });

  it("clamps command PWM and ignores unsupported or malformed live readback slots", () => {
    expect(clampServoCommandPwm(900)).toBe(SERVO_COMMAND_PWM_MIN);
    expect(clampServoCommandPwm(2500)).toBe(SERVO_COMMAND_PWM_MAX);
    expect(clampServoCommandPwm(1499.6)).toBe(1500);

    expect(readServoOutputPwm(1, { servo_outputs: [1501] })).toBe(1501);
    expect(readServoOutputPwm(SERVO_LIVE_TEST_LIMIT + 1, { servo_outputs: [1501] })).toBeNull();
    expect(readServoOutputPwm(2, { servo_outputs: [1501, Number.NaN] })).toBeNull();
  });

  it("maps control-surface and VTOL direction guidance labels", () => {
    expect(getDirectionGuidance(4)).toEqual({
      minLabel: "Roll left (trailing edge up)",
      maxLabel: "Roll right (trailing edge down)",
    });
    expect(getDirectionGuidance(41)).toEqual({
      minLabel: "Forward flight",
      maxLabel: "Vertical hover",
    });
    expect(getDirectionGuidance(999)).toEqual({
      minLabel: "Min PWM position",
      maxLabel: "Max PWM position",
    });
  });

  it("treats only Motor 1-8 function values as motor-assigned outputs", () => {
    expect(isMotorServoFunction(33)).toBe(true);
    expect(isMotorServoFunction(40)).toBe(true);
    expect(isMotorServoFunction(32)).toBe(false);
    expect(isMotorServoFunction(70)).toBe(false);
    expect(isMotorServoFunction(null)).toBe(false);
  });
});
