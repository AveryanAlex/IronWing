import type { MotorDiagramEntry, MotorDiagramModel } from "../shared/vtol-layouts";

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
