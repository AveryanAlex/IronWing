import { describe, expect, it } from "vitest";
import type { ParamMeta, ParamMetadataMap } from "../../../param-metadata";
import type { ParamStore } from "../../../params";
import type { ParamInputParams } from "../primitives/param-helpers";
import {
  ACTUATED_SERVO_OUTPUT_COUNT,
  SERVO_COMMAND_PWM_MAX,
  SERVO_COMMAND_PWM_MIN,
  clampServoCommandPwm,
  deriveServoTestTargets,
  isMotorServoFunction,
  readServoOutputPwm,
} from "./servo-test-helpers";

function makeStore(entries: Record<string, number>): ParamStore {
  const params: ParamStore["params"] = {};
  let index = 0;

  for (const [name, value] of Object.entries(entries)) {
    params[name] = { name, value, param_type: "real32", index: index++ };
  }

  return { params, expected_count: index };
}

function makeMetadata(entries: Record<string, ParamMeta>): ParamMetadataMap {
  return new Map(Object.entries(entries));
}

function makeParams({
  store = makeStore({}),
  staged = new Map<string, number>(),
  metadata = null,
}: {
  store?: ParamStore | null;
  staged?: Map<string, number>;
  metadata?: ParamMetadataMap | null;
} = {}): ParamInputParams {
  return {
    store,
    staged,
    metadata,
    stage: () => { },
  };
}

describe("servo-test-helpers", () => {
  it("derives supported and unsupported non-motor outputs with clamped safe windows", () => {
    const params = makeParams({
      store: makeStore({
        SERVO1_FUNCTION: 4,
        SERVO1_MIN: 900,
        SERVO1_MAX: 2100,
        SERVO1_TRIM: 1520,
        SERVO2_FUNCTION: 33,
        SERVO17_FUNCTION: 19,
        SERVO17_MIN: 1200,
        SERVO17_MAX: 2300,
        SERVO17_TRIM: 2150,
      }),
      metadata: makeMetadata({
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

    const targets = deriveServoTestTargets(params);

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
      supported: true,
      unavailableReason: null,
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
      supported: false,
    });
    expect(targets[1].unavailableReason).toMatch(/SERVO1–16/i);
  });

  it("falls back to numeric function labels and safe contract defaults when metadata or ranges are malformed", () => {
    const params = makeParams({
      store: makeStore({
        SERVO3_FUNCTION: 77,
        SERVO3_MIN: 2200,
        SERVO3_MAX: 900,
        SERVO3_TRIM: 2500,
      }),
    });

    const [target] = deriveServoTestTargets(params);

    expect(target).toMatchObject({
      index: 3,
      functionLabel: "Function 77",
      minPwm: 1000,
      maxPwm: 2000,
      trimPwm: 2000,
      defaultPwm: 2000,
    });
  });

  it("uses trim-only defaults when min and max params are absent", () => {
    const params = makeParams({
      store: makeStore({
        SERVO4_FUNCTION: 21,
        SERVO4_TRIM: 1750,
      }),
      staged: new Map([["SERVO4_TRIM", 1765]]),
    });

    const [target] = deriveServoTestTargets(params);

    expect(target).toMatchObject({
      index: 4,
      minPwm: 1000,
      maxPwm: 2000,
      trimPwm: 1765,
      defaultPwm: 1765,
    });
  });

  it("clamps raw pwm values and ignores unsupported or malformed live readback slots", () => {
    expect(clampServoCommandPwm(900)).toBe(SERVO_COMMAND_PWM_MIN);
    expect(clampServoCommandPwm(2500)).toBe(SERVO_COMMAND_PWM_MAX);
    expect(clampServoCommandPwm(1499.6)).toBe(1500);

    expect(readServoOutputPwm(1, { servo_outputs: [1501] })).toBe(1501);
    expect(readServoOutputPwm(ACTUATED_SERVO_OUTPUT_COUNT + 1, { servo_outputs: [1501] })).toBeNull();
    expect(readServoOutputPwm(2, { servo_outputs: [1501, Number.NaN] })).toBeNull();
  });

  it("treats only Motor 1-8 function values as motor-assigned outputs", () => {
    expect(isMotorServoFunction(33)).toBe(true);
    expect(isMotorServoFunction(40)).toBe(true);
    expect(isMotorServoFunction(32)).toBe(false);
    expect(isMotorServoFunction(70)).toBe(false);
    expect(isMotorServoFunction(null)).toBe(false);
  });
});
