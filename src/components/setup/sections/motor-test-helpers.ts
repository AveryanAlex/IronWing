import type { ParamInputParams } from "../primitives/param-helpers";
import { getStagedOrCurrent } from "../primitives/param-helpers";
import type { MotorDiagramEntry, MotorDiagramModel } from "../shared/vtol-layouts";

const ACTUATED_SERVO_COUNT = 16;
const MOTOR_FUNCTION_BASE = 32;

export type MotorDirection = "cw" | "ccw" | "unknown";

export type MotorTestRow = {
  motorNumber: number;
  testOrder: number;
  expectedDirection: MotorDirection;
  roleLabel: string;
  rollFactor: number;
  pitchFactor: number;
};

function deriveRoleLabel(role: MotorDiagramEntry["role"]): string {
  switch (role) {
    case "lift":
      return "Lift motor";
    case "tilt":
      return "Tilt motor";
    case "propulsion":
      return "Propulsion motor";
    default:
      return "Motor";
  }
}

export function deriveMotorDirection(yawFactor: number): MotorDirection {
  if (!Number.isFinite(yawFactor) || yawFactor === 0) {
    return "unknown";
  }

  return yawFactor > 0 ? "cw" : "ccw";
}

/**
 * Find which servo output index carries the given motor number.
 * Motor N maps to SERVOx_FUNCTION = 32 + N (Motor1 = 33, Motor2 = 34, …).
 * Returns the 1-based servo index, or null if no match is found.
 */
export function resolveServoIndexForMotor(
  motorNumber: number,
  params: ParamInputParams,
): number | null {
  const targetFunction = MOTOR_FUNCTION_BASE + motorNumber;

  for (let index = 1; index <= ACTUATED_SERVO_COUNT; index++) {
    const value = getStagedOrCurrent(`SERVO${index}_FUNCTION`, params);
    if (value === targetFunction) return index;
  }

  return null;
}

export function deriveMotorTestRows(model: MotorDiagramModel | null | undefined): MotorTestRow[] {
  if (!model || model.motors.length === 0) {
    return [];
  }

  return [...model.motors]
    .sort((left, right) => left.testOrder - right.testOrder || left.motorNumber - right.motorNumber)
    .map((motor) => ({
      motorNumber: motor.motorNumber,
      testOrder: motor.testOrder,
      expectedDirection: deriveMotorDirection(motor.yawFactor),
      roleLabel: deriveRoleLabel(motor.role),
      rollFactor: motor.rollFactor,
      pitchFactor: motor.pitchFactor,
    }));
}
