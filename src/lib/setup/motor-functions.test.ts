import { FrameClass } from "../airframe";
import { permitsDirectServoCommand } from "../ardupilot/servo-functions";
import { describe, expect, it } from "vitest";

import {
  isPropulsionServoFunction,
  isTricopterYawFunction,
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

it("keeps all 32 logical motors separate from non-contiguous servo function codes", () => {
  for (let motor = 1; motor <= 32; motor++) {
    const code = motor <= 8 ? motor + 32 : motor <= 12 ? motor + 73 : motor + 147;
    expect(servoFunctionForMotor(motor)).toBe(code);
    expect(motorNumberForServoFunction(code)).toBe(motor);
  }
  for (const motor of [0, -1, 33, 1.5, NaN]) expect(servoFunctionForMotor(motor)).toBeNull();
});
it("interprets function 39 in the decoded frame context", () => {
  expect(isTricopterYawFunction(39, FrameClass.Tri)).toBe(true);
  expect(isPropulsionServoFunction(39, FrameClass.Tri)).toBe(false);
  expect(isTricopterYawFunction(39, FrameClass.Quad)).toBe(false);
  expect(isPropulsionServoFunction(39, FrameClass.Quad)).toBe(true);
});
it("rejects fractional, unknown and control-law owners for direct servo commands", () => {
  for (const code of [-1, 4, 39, 41, 51.5, 67, 139, 156, 999, NaN]) expect(permitsDirectServoCommand(code)).toBe(false);
  for (const code of [0, 1, 22, 23, 28, 51, 66, 140, 155]) expect(permitsDirectServoCommand(code)).toBe(true);
});
