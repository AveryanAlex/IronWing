import { FrameClass, isMotorNumber, type MotorNumber } from "../airframe";
import { decodeArduPilotFrameClass } from "../ardupilot/airframe";
import { ArduPilotServoFunction } from "../ardupilot/servo-functions";
import type { ParamStore } from "../../params";

export const MOTOR_FUNCTION_BY_NUMBER = {
  1: ArduPilotServoFunction.Motor1,
  2: ArduPilotServoFunction.Motor2,
  3: ArduPilotServoFunction.Motor3,
  4: ArduPilotServoFunction.Motor4,
  5: ArduPilotServoFunction.Motor5,
  6: ArduPilotServoFunction.Motor6,
  7: ArduPilotServoFunction.Motor7,
  8: ArduPilotServoFunction.Motor8,
  9: ArduPilotServoFunction.Motor9,
  10: ArduPilotServoFunction.Motor10,
  11: ArduPilotServoFunction.Motor11,
  12: ArduPilotServoFunction.Motor12,
  13: ArduPilotServoFunction.Motor13,
  14: ArduPilotServoFunction.Motor14,
  15: ArduPilotServoFunction.Motor15,
  16: ArduPilotServoFunction.Motor16,
  17: ArduPilotServoFunction.Motor17,
  18: ArduPilotServoFunction.Motor18,
  19: ArduPilotServoFunction.Motor19,
  20: ArduPilotServoFunction.Motor20,
  21: ArduPilotServoFunction.Motor21,
  22: ArduPilotServoFunction.Motor22,
  23: ArduPilotServoFunction.Motor23,
  24: ArduPilotServoFunction.Motor24,
  25: ArduPilotServoFunction.Motor25,
  26: ArduPilotServoFunction.Motor26,
  27: ArduPilotServoFunction.Motor27,
  28: ArduPilotServoFunction.Motor28,
  29: ArduPilotServoFunction.Motor29,
  30: ArduPilotServoFunction.Motor30,
  31: ArduPilotServoFunction.Motor31,
  32: ArduPilotServoFunction.Motor32,
} as const satisfies Record<MotorNumber, ArduPilotServoFunction>;

export const THROTTLE_OUTPUT_FUNCTIONS = {
  throttle: ArduPilotServoFunction.Throttle,
  left: ArduPilotServoFunction.ThrottleLeft,
  right: ArduPilotServoFunction.ThrottleRight,
  boost: ArduPilotServoFunction.BoostThrottle,
} as const;

export const TILT_OUTPUT_FUNCTIONS = {
  collective: ArduPilotServoFunction.TiltCollective,
  rearCollective: ArduPilotServoFunction.TiltRearCollective,
  rearLeft: ArduPilotServoFunction.TiltRearLeft,
  rearRight: ArduPilotServoFunction.TiltRearRight,
  frontLeft: ArduPilotServoFunction.TiltFrontLeft,
  frontRight: ArduPilotServoFunction.TiltFrontRight,
} as const;

const MOTOR_NUMBER_BY_FUNCTION = new Map<number, MotorNumber>(
  Object.entries(MOTOR_FUNCTION_BY_NUMBER).map(([motorNumber, functionValue]) => [
    functionValue,
    Number(motorNumber) as MotorNumber,
  ]),
);

const PROPULSION_FUNCTIONS = new Set<number>([
  ...Object.values(MOTOR_FUNCTION_BY_NUMBER),
  ...Object.values(THROTTLE_OUTPUT_FUNCTIONS),
]);

export function servoFunctionForMotor(motorNumber: number): ArduPilotServoFunction | null {
  if (!isMotorNumber(motorNumber)) {
    return null;
  }

  return MOTOR_FUNCTION_BY_NUMBER[motorNumber] ?? null;
}

export function motorNumberForServoFunction(functionValue: number): MotorNumber | null {
  return MOTOR_NUMBER_BY_FUNCTION.get(functionValue) ?? null;
}

export function outputFrameClass(paramStore: ParamStore | null): FrameClass | null {
  const params = paramStore?.params;
  return decodeArduPilotFrameClass(
    ((params?.Q_ENABLE?.value ?? 0) > 0 ? params?.Q_FRAME_CLASS?.value : params?.FRAME_CLASS?.value) ?? null,
  );
}

export function isTricopterYawFunction(functionValue: number | null, frameClass: FrameClass | null): boolean {
  return frameClass === FrameClass.Tri && functionValue === ArduPilotServoFunction.TricopterYaw;
}

export function isPropulsionServoFunction(functionValue: number | null, frameClass: FrameClass | null = null): boolean {
  return (
    functionValue !== null &&
    !isTricopterYawFunction(functionValue, frameClass) &&
    PROPULSION_FUNCTIONS.has(functionValue)
  );
}

export function propulsionFunctionLabel(functionValue: number): string | null {
  const motorNumber = motorNumberForServoFunction(functionValue);
  if (motorNumber !== null) {
    return `Motor ${motorNumber}`;
  }

  switch (functionValue) {
    case THROTTLE_OUTPUT_FUNCTIONS.throttle:
      return "Throttle";
    case THROTTLE_OUTPUT_FUNCTIONS.left:
      return "Throttle left";
    case THROTTLE_OUTPUT_FUNCTIONS.right:
      return "Throttle right";
    case THROTTLE_OUTPUT_FUNCTIONS.boost:
      return "Boost throttle";
    default:
      return null;
  }
}
