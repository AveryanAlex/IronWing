import { describe, expect, it } from "vitest";
import type { ParamStore } from "../../params";
import {
  canSendServoPwm,
  clampServoCommandPwm,
  deriveConfiguredServoOutputs,
  deriveServoTestTargets,
  groupServoTestTargetsByFunction,
  readServoOutputPwm,
} from "./servo-test-model";

function input(entries: Record<string, number>) {
  const params: ParamStore["params"] = {};
  for (const [index, [name, value]] of Object.entries(entries).entries()) {
    params[name] = { name, value, param_type: "real32", index };
  }
  return { paramStore: { params, expected_count: Object.keys(params).length }, metadata: null };
}

describe("direct PWM output testing", () => {
  // AP_ServoRelayEvents::do_set_servo: permissive functions only.
  it.each([0, 1, 22, 23, 28, 51, 66, 140, 155])("permits function %i", (value) => {
    expect(deriveServoTestTargets(input({ SERVO1_FUNCTION: value }))).toHaveLength(1);
  });

  it.each([
    2, 4, 19, 21, 24, 25, 29, 33, 39, 41, 45, 46, 47, 70, 73, 74, 75, 76, 77, 80, 88, 999,
  ])("keeps function %i visible for inspection without test controls", (value) => {
    const data = input({ SERVO1_FUNCTION: value });
    expect(deriveConfiguredServoOutputs(data)).toHaveLength(1);
    expect(deriveServoTestTargets(data)).toEqual([]);
    expect(deriveConfiguredServoOutputs(data)[0].supported).toBe(false);
  });

  it("separates configured PWM points from the command window", () => {
    const output = deriveConfiguredServoOutputs(
      input({
        SERVO1_FUNCTION: 0,
        SERVO1_MIN: 900,
        SERVO1_TRIM: 1520,
        SERVO1_MAX: 2100,
      }),
    )[0];
    expect(output).toMatchObject({
      minPwm: 900,
      trimPwm: 1520,
      maxPwm: 2100,
      commandMinPwm: 1000,
      commandMaxPwm: 2000,
    });
    expect(canSendServoPwm(output, output.minPwm)).toBe(false);
    expect(canSendServoPwm(output, output.maxPwm)).toBe(false);
    expect(canSendServoPwm(output, output.trimPwm)).toBe(true);
    expect(canSendServoPwm(output, Number.NaN)).toBe(false);
    expect(canSendServoPwm(output, 1500.5)).toBe(false);
  });

  it("does not substitute a different endpoint for an unusable range", () => {
    for (const points of [
      [2100, 2200],
      [1800, 1200],
    ]) {
      const data = input({ SERVO1_FUNCTION: 0, SERVO1_MIN: points[0], SERVO1_MAX: points[1] });
      expect(deriveConfiguredServoOutputs(data)[0].liveTestStatus).toBe("invalid-window");
      expect(deriveServoTestTargets(data)).toEqual([]);
    }
  });

  it("classifies the tricopter yaw output as a servo across runtimes", () => {
    for (const frame of [{ FRAME_CLASS: 7 }, { Q_ENABLE: 1, Q_FRAME_CLASS: 7 }]) {
      const output = deriveConfiguredServoOutputs(input({ ...frame, SERVO7_FUNCTION: 39 }))[0];
      expect(output).toMatchObject({
        functionLabel: "Tricopter yaw servo",
        isMotorFunction: false,
        liveTestStatus: "assigned-function",
      });
    }
    expect(deriveConfiguredServoOutputs(input({ FRAME_CLASS: 3, SERVO7_FUNCTION: 39 }))[0].isMotorFunction).toBe(true);
  });

  it("honors the physical output bridge limit", () => {
    const outputs = deriveConfiguredServoOutputs(input({ SERVO16_FUNCTION: 0, SERVO17_FUNCTION: 0 }));
    expect(outputs.map((output) => output.liveTestStatus)).toEqual(["available", "unsupported-bridge"]);
  });

  it("groups available tests by function in physical output order", () => {
    const targets = deriveServoTestTargets(
      input({ SERVO1_FUNCTION: 1, SERVO2_FUNCTION: 0, SERVO4_FUNCTION: 1, SERVO5_FUNCTION: 19 }),
    );
    expect(
      groupServoTestTargetsByFunction(targets).map((group) => group.targets.map((output) => output.index)),
    ).toEqual([[1, 4], [2]]);
  });

  it("clamps arbitrary command drafts and ignores malformed telemetry", () => {
    expect(clampServoCommandPwm(900)).toBe(1000);
    expect(clampServoCommandPwm(2200)).toBe(2000);
    expect(clampServoCommandPwm(1499.6)).toBe(1500);
    expect(readServoOutputPwm(1, { servo_outputs: [1501] })).toBe(1501);
    expect(readServoOutputPwm(2, { servo_outputs: [1501, Number.NaN] })).toBeNull();
    expect(readServoOutputPwm(17, { servo_outputs: [1501] })).toBeNull();
  });
});
