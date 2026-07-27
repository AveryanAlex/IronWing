export const MOTOR_FUNCTION_BY_NUMBER = {
  1: 33,
  2: 34,
  3: 35,
  4: 36,
  5: 37,
  6: 38,
  7: 39,
  8: 40,
  9: 82,
  10: 83,
  11: 84,
  12: 85,
} as const;

export const THROTTLE_OUTPUT_FUNCTIONS = {
  throttle: 70,
  left: 73,
  right: 74,
} as const;

export const TILT_OUTPUT_FUNCTIONS = {
  frontCollective: 41,
  rearCollective: 45,
  rearLeft: 46,
  rearRight: 47,
  frontLeft: 75,
  frontRight: 76,
} as const;

export type SupportedMotorNumber = keyof typeof MOTOR_FUNCTION_BY_NUMBER;

const MOTOR_NUMBER_BY_FUNCTION = new Map<number, SupportedMotorNumber>(
  Object.entries(MOTOR_FUNCTION_BY_NUMBER).map(([motorNumber, functionValue]) => [
    functionValue,
    Number(motorNumber) as SupportedMotorNumber,
  ]),
);

const PROPULSION_FUNCTIONS = new Set<number>([
  ...Object.values(MOTOR_FUNCTION_BY_NUMBER),
  ...Object.values(THROTTLE_OUTPUT_FUNCTIONS),
]);

export function servoFunctionForMotor(motorNumber: number): number | null {
  if (!Number.isInteger(motorNumber)) {
    return null;
  }

  return MOTOR_FUNCTION_BY_NUMBER[motorNumber as SupportedMotorNumber] ?? null;
}

export function motorNumberForServoFunction(functionValue: number): number | null {
  return MOTOR_NUMBER_BY_FUNCTION.get(functionValue) ?? null;
}

export function isPropulsionServoFunction(functionValue: number | null): boolean {
  return functionValue !== null && PROPULSION_FUNCTIONS.has(functionValue);
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
    default:
      return null;
  }
}
