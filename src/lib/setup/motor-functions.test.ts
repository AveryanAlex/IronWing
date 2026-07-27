import { describe, expect, it } from "vitest";

import {
  isPropulsionServoFunction,
  motorNumberForServoFunction,
  servoFunctionForMotor,
} from "./motor-functions";

describe("motor output functions", () => {
  it("maps the non-contiguous Motor 9-12 functions", () => {
    expect(servoFunctionForMotor(8)).toBe(40);
    expect(servoFunctionForMotor(9)).toBe(82);
    expect(servoFunctionForMotor(12)).toBe(85);
    expect(motorNumberForServoFunction(82)).toBe(9);
    expect(motorNumberForServoFunction(85)).toBe(12);
  });

  it("does not confuse tilt functions with propulsion", () => {
    expect(isPropulsionServoFunction(41)).toBe(false);
    expect(isPropulsionServoFunction(75)).toBe(false);
    expect(isPropulsionServoFunction(70)).toBe(true);
    expect(isPropulsionServoFunction(73)).toBe(true);
    expect(isPropulsionServoFunction(74)).toBe(true);
  });
});
