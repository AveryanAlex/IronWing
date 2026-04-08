import type { ParamStore } from "../../params";
import type { MotorDiagramEntry, MotorDiagramModel } from "./vtol-layout-model";

export const MOTOR_TEST_BRIDGE_LIMIT = 8;
export const MOTOR_OUTPUT_COUNT = 32;
export const MOTOR_FUNCTION_BASE = 32;

export type MotorDirection = "cw" | "ccw" | "unknown";
export type MotorOwnerStatus = "resolved" | "function-only" | "ambiguous" | "unowned";
export type MotorTestStatus = "available" | "unsupported-bridge" | "blocked-layout";

export type MotorTestParamsInput = {
  paramStore: ParamStore | null;
  stagedEdits: Record<string, { nextValue: number } | undefined>;
};

export type MotorOwnerResolution = {
  status: MotorOwnerStatus;
  servoIndex: number | null;
  functionParamName: string | null;
  reverseParamName: string | null;
  reason: string | null;
};

export type MotorTestRow = {
  motorNumber: number;
  testOrder: number;
  expectedDirection: MotorDirection;
  roleLabel: string;
  rollFactor: number;
  pitchFactor: number;
  bridgeSupported: boolean;
  testStatus: MotorTestStatus;
  testReason: string | null;
  ownerStatus: MotorOwnerStatus;
  ownerReason: string | null;
  servoIndex: number | null;
  functionParamName: string | null;
  reversalParamName: string | null;
};

function getCurrentParamValue(input: MotorTestParamsInput, name: string): number | null {
  return input.paramStore?.params[name]?.value ?? null;
}

function getStagedParamValue(input: MotorTestParamsInput, name: string): number | null {
  const nextValue = input.stagedEdits[name]?.nextValue;
  return typeof nextValue === "number" && Number.isFinite(nextValue) ? nextValue : null;
}

function hasParam(input: MotorTestParamsInput, name: string): boolean {
  return input.paramStore?.params[name] !== undefined;
}

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

export function resolveMotorOwner(
  motorNumber: number,
  input: MotorTestParamsInput,
  outputCount = MOTOR_OUTPUT_COUNT,
): MotorOwnerResolution {
  if (!Number.isInteger(motorNumber) || motorNumber < 1) {
    return {
      status: "unowned",
      servoIndex: null,
      functionParamName: null,
      reverseParamName: null,
      reason: "Motor numbering is invalid, so output ownership cannot be proven.",
    };
  }

  const targetFunction = MOTOR_FUNCTION_BASE + motorNumber;
  let resolvedServoIndex: number | null = null;
  let ambiguousServoIndex: number | null = null;

  for (let index = 1; index <= outputCount; index += 1) {
    const functionParamName = `SERVO${index}_FUNCTION`;
    if (!hasParam(input, functionParamName)) {
      continue;
    }

    const currentValue = getCurrentParamValue(input, functionParamName);
    const stagedValue = getStagedParamValue(input, functionParamName);
    const hasPendingFunctionChange = stagedValue !== null && stagedValue !== currentValue;
    const currentOwnsMotor = currentValue === targetFunction;
    const stagedOwnsMotor = stagedValue === targetFunction;

    if (hasPendingFunctionChange && (currentOwnsMotor || stagedOwnsMotor)) {
      ambiguousServoIndex = index;
      break;
    }

    if (currentOwnsMotor) {
      if (resolvedServoIndex !== null) {
        ambiguousServoIndex = index;
        break;
      }

      resolvedServoIndex = index;
    }
  }

  if (ambiguousServoIndex !== null) {
    return {
      status: "ambiguous",
      servoIndex: ambiguousServoIndex,
      functionParamName: `SERVO${ambiguousServoIndex}_FUNCTION`,
      reverseParamName: null,
      reason: "A staged SERVOx_FUNCTION remap is still pending, so the owning output is not safe to prove yet.",
    };
  }

  if (resolvedServoIndex === null) {
    return {
      status: "unowned",
      servoIndex: null,
      functionParamName: null,
      reverseParamName: null,
      reason: "No stable SERVOx_FUNCTION row proves which output owns this motor right now.",
    };
  }

  const reverseParamName = `SERVO${resolvedServoIndex}_REVERSED`;
  if (!hasParam(input, reverseParamName)) {
    return {
      status: "function-only",
      servoIndex: resolvedServoIndex,
      functionParamName: `SERVO${resolvedServoIndex}_FUNCTION`,
      reverseParamName: null,
      reason: `${reverseParamName} is unavailable, so the section stops at diagnosis and manual reversal guidance.`,
    };
  }

  return {
    status: "resolved",
    servoIndex: resolvedServoIndex,
    functionParamName: `SERVO${resolvedServoIndex}_FUNCTION`,
    reverseParamName,
    reason: null,
  };
}

function resolveLayoutTestStatus(
  layoutModel: MotorDiagramModel,
  motorNumber: number,
  bridgeLimit: number,
): { bridgeSupported: boolean; testStatus: MotorTestStatus; testReason: string | null } {
  if (layoutModel.status !== "supported") {
    const layoutReason = layoutModel.status === "preview-only"
      ? "Direction-dependent testing is blocked because this layout is preview-only and ownership remains advisory."
      : "Direction-dependent testing is blocked because the active layout is unsupported. Verify the airframe manually first.";

    return {
      bridgeSupported: motorNumber <= bridgeLimit,
      testStatus: "blocked-layout",
      testReason: layoutReason,
    };
  }

  if (motorNumber > bridgeLimit) {
    return {
      bridgeSupported: false,
      testStatus: "unsupported-bridge",
      testReason: `The current motor_test bridge only supports motors 1..=${bridgeLimit}. Verify this row manually before staging any reversal.`,
    };
  }

  return {
    bridgeSupported: true,
    testStatus: "available",
    testReason: null,
  };
}

export function buildMotorTestRows(
  layoutModel: MotorDiagramModel | null | undefined,
  input: MotorTestParamsInput,
  bridgeLimit = MOTOR_TEST_BRIDGE_LIMIT,
): MotorTestRow[] {
  if (!layoutModel || layoutModel.motors.length === 0) {
    return [];
  }

  return [...layoutModel.motors]
    .sort((left, right) => left.testOrder - right.testOrder || left.motorNumber - right.motorNumber)
    .map((motor) => {
      const owner = resolveMotorOwner(motor.motorNumber, input);
      const testability = resolveLayoutTestStatus(layoutModel, motor.motorNumber, bridgeLimit);

      return {
        motorNumber: motor.motorNumber,
        testOrder: motor.testOrder,
        expectedDirection: deriveMotorDirection(motor.yawFactor),
        roleLabel: deriveRoleLabel(motor.role),
        rollFactor: motor.rollFactor,
        pitchFactor: motor.pitchFactor,
        bridgeSupported: testability.bridgeSupported,
        testStatus: testability.testStatus,
        testReason: testability.testReason,
        ownerStatus: owner.status,
        ownerReason: owner.reason,
        servoIndex: owner.servoIndex,
        functionParamName: owner.functionParamName,
        reversalParamName: owner.reverseParamName,
      } satisfies MotorTestRow;
    });
}
