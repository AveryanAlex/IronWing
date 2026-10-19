import type { MotorNumber, MotorRotation } from "../airframe";
import type { ParamStore } from "../../params";
import type { StatusMessage } from "../../statustext";
import type { MotorDiagramEntry, MotorDiagramModel } from "./vtol-layout-model";
import { servoFunctionForMotor } from "./motor-functions";

export const MOTOR_TEST_BRIDGE_LIMIT = 12;
export const MOTOR_OUTPUT_COUNT = 32;

export type MotorOwnerStatus = "resolved" | "ambiguous" | "unowned";
export type MotorTestStatus = "available" | "unsupported-bridge" | "blocked-layout";

export type MotorTestParamsInput = {
  paramStore: ParamStore | null;
  stagedEdits: Record<string, { nextValue: number } | undefined>;
};

export type MotorOwnerResolution = {
  status: MotorOwnerStatus;
  servoIndex: number | null;
  functionParamName: string | null;
  reason: string | null;
};

export type MotorTestRow = {
  motorNumber: MotorNumber;
  testOrder: number;
  expectedDirection: MotorRotation;
  roleLabel: string;
  bridgeSupported: boolean;
  testStatus: MotorTestStatus;
  testReason: string | null;
  ownerStatus: MotorOwnerStatus;
  ownerReason: string | null;
  servoIndex: number | null;
  functionParamName: string | null;
};

export type MotorTestUnlockInput = {
  checkpointBlocked: boolean;
  liveConnected: boolean;
  vehicleArmed: boolean | null;
  layoutModel: MotorDiagramModel | null;
  rowCount: number;
};

export function resolveMotorTestUnlockDisabledReason(input: MotorTestUnlockInput): string | null {
  if (input.checkpointBlocked) {
    return "Testing stays locked while the reboot/reconnect checkpoint is unresolved.";
  }

  if (!input.liveConnected) {
    return "Testing stays locked until the live vehicle link is connected.";
  }

  if (input.vehicleArmed === true) {
    return "Disarm the vehicle before unlocking motor testing.";
  }

  if (input.vehicleArmed === null) {
    return "Testing stays locked until the vehicle reports that it is disarmed.";
  }

  if (!input.layoutModel) {
    return "Testing stays locked because the active layout is unavailable.";
  }

  if (input.layoutModel.status === "preview-only") {
    return "Testing stays locked because this layout is preview-only. Verify the airframe manually first.";
  }

  if (input.layoutModel.status === "unsupported") {
    return "Testing stays locked because the active layout is unsupported and motor order cannot be trusted here.";
  }

  if (input.rowCount === 0) {
    return "Testing stays locked because no mapped motors are available for this layout.";
  }

  return null;
}

export function latestStatusTextSequence(entries: readonly StatusMessage[]): number {
  return entries.reduce((latest, entry) => Math.max(latest, entry.sequence), 0);
}

export function findMotorTestFailureStatus(entries: readonly StatusMessage[], afterSequence: number): string | null {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.sequence <= afterSequence) {
      break;
    }

    const text = entry.text.trim();
    if (/^motor test:|must be disarmed for motor test/i.test(text)) {
      return text;
    }
  }

  return null;
}

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
      reason: "Motor numbering is invalid, so no output can be selected for this motor.",
    };
  }

  const targetFunction = servoFunctionForMotor(motorNumber);
  if (targetFunction === null) {
    return {
      status: "unowned",
      servoIndex: null,
      functionParamName: null,
      reason: `Motor ${motorNumber} is outside the supported ArduPilot motor-function map.`,
    };
  }
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
      reason:
        "This motor has multiple output owners or a pending SERVOx_FUNCTION remap. Review its output assignments before testing.",
    };
  }

  if (resolvedServoIndex === null) {
    return {
      status: "unowned",
      servoIndex: null,
      functionParamName: null,
      reason: "No current SERVOx_FUNCTION row maps to this motor.",
    };
  }

  return {
    status: "resolved",
    servoIndex: resolvedServoIndex,
    functionParamName: `SERVO${resolvedServoIndex}_FUNCTION`,
    reason: null,
  };
}

function resolveLayoutTestStatus(
  layoutModel: MotorDiagramModel,
  testOrder: number,
  bridgeLimit: number,
): { bridgeSupported: boolean; testStatus: MotorTestStatus; testReason: string | null } {
  if (layoutModel.status !== "supported") {
    const layoutReason =
      layoutModel.status === "preview-only"
        ? "Direction-dependent testing is blocked because this layout is preview-only. Verify the airframe manually first."
        : "Direction-dependent testing is blocked because the active layout is unsupported. Verify the airframe manually first.";

    return {
      bridgeSupported: testOrder <= bridgeLimit,
      testStatus: "blocked-layout",
      testReason: layoutReason,
    };
  }

  if (testOrder > bridgeLimit) {
    return {
      bridgeSupported: false,
      testStatus: "unsupported-bridge",
      testReason: `The current motor_test bridge only supports test sequences 1..=${bridgeLimit}. Verify this row manually before testing.`,
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
      const testability = resolveLayoutTestStatus(layoutModel, motor.testOrder, bridgeLimit);

      return {
        motorNumber: motor.motorNumber,
        testOrder: motor.testOrder,
        expectedDirection: motor.rotation,
        roleLabel: deriveRoleLabel(motor.role),
        bridgeSupported: testability.bridgeSupported,
        testStatus: testability.testStatus,
        testReason: testability.testReason,
        ownerStatus: owner.status,
        ownerReason: owner.reason,
        servoIndex: owner.servoIndex,
        functionParamName: owner.functionParamName,
      } satisfies MotorTestRow;
    });
}
