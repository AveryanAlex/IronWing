import type { StagedParameterValues } from "../params/parameter-values";
import { readAppliedParameter, readProposedParameter } from "../params/parameter-values";
import type { FrameClass } from "../airframe";
import { ArduPilotServoFunction } from "../ardupilot/servo-functions";
import { getMotorLayout } from "../../data/motor-layouts";
import type { ParamMetadataMap } from "../../param-metadata";
import type { ParamStore } from "../../params";
import {
  isPropulsionServoFunction,
  isTricopterYawFunction,
  outputFrameClass,
  motorNumberForServoFunction,
  propulsionFunctionLabel,
  servoFunctionForMotor,
} from "./motor-functions";
import { deriveVehicleProfile } from "./vehicle-profile";
import { buildVtolTopologyModel } from "./vtol-topology-model";

export type OutputFunctionCategory = "propulsion" | "servo";
export type OutputFunctionSource = "required" | "recommended" | "configured" | "catalog";

export type OutputMappingInput = {
  paramStore: ParamStore | null;
  metadata: ParamMetadataMap | null;
  stagedEdits: StagedParameterValues;
  vehicleType: string | null;
  addedFunctionValues?: readonly number[];
};

export type PhysicalOutput = {
  index: number;
  paramName: string;
  appliedFunctionValue: number;
  proposedFunctionValue: number;
  appliedFunctionLabel: string;
  proposedFunctionLabel: string;
  hasStagedChange: boolean;
  readOnly: boolean;
};

export type OutputFunctionCatalogItem = {
  value: number;
  label: string;
  category: OutputFunctionCategory;
};

export type OutputFunctionRow = OutputFunctionCatalogItem & {
  source: OutputFunctionSource;
  sourceDetail: string;
  required: boolean;
  recommended: boolean;
  topologyDependent: boolean;
  mappingLocked: boolean;
  appliedOutputIndexes: number[];
  proposedOutputIndexes: number[];
  hasStagedChange: boolean;
  mirroredMotor: boolean;
};

export type OutputMappingModel = {
  outputs: PhysicalOutput[];
  catalog: OutputFunctionCatalogItem[];
  propulsionRows: OutputFunctionRow[];
  servoRows: OutputFunctionRow[];
  requiredFunctionValues: number[];
  assignedOutputCount: number;
  missingRequiredCount: number;
  stagedOutputCount: number;
  topologyMappingLocked: boolean;
};

export type OutputAssignmentEdit = {
  paramName: string;
  nextValue: number;
};

export type DisplacedOutputAssignment = {
  outputIndex: number;
  previousFunctionValue: number;
  previousFunctionLabel: string;
};

export type OutputAssignmentPlan = {
  functionValue: number;
  desiredOutputIndexes: number[];
  previousOutputIndexes: number[];
  edits: OutputAssignmentEdit[];
  displacedAssignments: DisplacedOutputAssignment[];
  newlyMissingRequiredFunctionValues: number[];
  mirroredMotor: boolean;
};

type Requirement = {
  label: string;
  detail: string;
  category: OutputFunctionCategory;
};

const OUTPUT_FUNCTION_PARAM = /^SERVO(\d+)_FUNCTION$/;
const PLANE_RECOMMENDATIONS = [
  ArduPilotServoFunction.Aileron,
  ArduPilotServoFunction.Elevator,
  ArduPilotServoFunction.Rudder,
] as const;
const CONVENTIONAL_PLANE_THROTTLE = ArduPilotServoFunction.Throttle;
const KNOWN_FUNCTION_LABELS = new Map<number, string>([
  [ArduPilotServoFunction.Gpio, "GPIO"],
  [ArduPilotServoFunction.Aileron, "Aileron"],
  [ArduPilotServoFunction.Elevator, "Elevator"],
  [ArduPilotServoFunction.Rudder, "Rudder"],
  [ArduPilotServoFunction.TiltCollective, "Tilt motors front"],
  [ArduPilotServoFunction.TiltRearCollective, "Tilt motors rear"],
  [ArduPilotServoFunction.TiltRearLeft, "Tilt motor rear left"],
  [ArduPilotServoFunction.TiltRearRight, "Tilt motor rear right"],
  [ArduPilotServoFunction.Throttle, "Throttle"],
  [ArduPilotServoFunction.ThrottleLeft, "Throttle left"],
  [ArduPilotServoFunction.ThrottleRight, "Throttle right"],
  [ArduPilotServoFunction.TiltFrontLeft, "Tilt motor front left"],
  [ArduPilotServoFunction.TiltFrontRight, "Tilt motor front right"],
  [ArduPilotServoFunction.ElevonLeft, "Elevon left"],
  [ArduPilotServoFunction.ElevonRight, "Elevon right"],
  [ArduPilotServoFunction.VTailLeft, "V-tail left"],
  [ArduPilotServoFunction.VTailRight, "V-tail right"],
  [ArduPilotServoFunction.BoostThrottle, "Boost throttle"],
]);

function metadataFunctionLabels(input: Pick<OutputMappingInput, "paramStore" | "metadata">): Map<number, string> {
  const labels = new Map(KNOWN_FUNCTION_LABELS);
  for (const paramName of Object.keys(input.paramStore?.params ?? {})) {
    if (!OUTPUT_FUNCTION_PARAM.test(paramName)) continue;
    for (const option of input.metadata?.get(paramName)?.values ?? []) {
      const label = option.label.trim();
      if (Number.isFinite(option.code) && label && !labels.has(option.code)) {
        labels.set(option.code, label);
      }
    }
  }
  return labels;
}

function metadataFunctionValues(input: Pick<OutputMappingInput, "paramStore" | "metadata">): Set<number> {
  const values = new Set<number>();
  for (const paramName of Object.keys(input.paramStore?.params ?? {})) {
    if (!OUTPUT_FUNCTION_PARAM.test(paramName)) continue;
    for (const option of input.metadata?.get(paramName)?.values ?? []) {
      if (Number.isFinite(option.code)) values.add(option.code);
    }
  }
  return values;
}

function functionLabel(
  functionValue: number,
  labels: ReadonlyMap<number, string>,
  frameClass: FrameClass | null,
): string {
  if (isTricopterYawFunction(functionValue, frameClass)) return "Tricopter yaw servo";
  return labels.get(functionValue) ?? propulsionFunctionLabel(functionValue) ?? `Function ${functionValue}`;
}

export function discoverPhysicalOutputs(
  input: Pick<OutputMappingInput, "paramStore" | "metadata" | "stagedEdits">,
): PhysicalOutput[] {
  const labels = metadataFunctionLabels(input);
  const frameClass = outputFrameClass(input.paramStore);
  return Object.keys(input.paramStore?.params ?? {})
    .flatMap((paramName) => {
      const match = paramName.match(OUTPUT_FUNCTION_PARAM);
      const appliedFunctionValue = readAppliedParameter(input.paramStore, paramName);
      if (!match || appliedFunctionValue === null) return [];
      const index = Number(match[1]);
      if (!Number.isInteger(index) || index < 1) return [];
      const proposedFunctionValue = readProposedParameter(input, paramName) ?? appliedFunctionValue;
      return [
        {
          index,
          paramName,
          appliedFunctionValue,
          proposedFunctionValue,
          appliedFunctionLabel: functionLabel(appliedFunctionValue, labels, frameClass),
          proposedFunctionLabel: functionLabel(proposedFunctionValue, labels, frameClass),
          hasStagedChange: proposedFunctionValue !== appliedFunctionValue,
          readOnly: input.metadata?.get(paramName)?.readOnly === true,
        } satisfies PhysicalOutput,
      ];
    })
    .sort((left, right) => left.index - right.index);
}

function addRequirement(requirements: Map<number, Requirement>, value: number | null, requirement: Requirement) {
  if (value === null || requirements.has(value)) return;
  requirements.set(value, requirement);
}

function buildRequirements(input: OutputMappingInput): {
  requirements: Map<number, Requirement>;
  topologyMappingLocked: boolean;
} {
  const profile = deriveVehicleProfile(input.vehicleType, input);
  const requirements = new Map<number, Requirement>();
  let topologyMappingLocked =
    profile.stagedFrameClassChange ||
    profile.stagedFrameTypeChange ||
    profile.stagedEnableChange ||
    (profile.isCopter &&
      ["FRAME_CLASS", "FRAME_TYPE"].some((name) => {
        const staged = input.stagedEdits[name]?.nextValue;
        const applied = readAppliedParameter(input.paramStore, name);
        return typeof staged === "number" && applied !== null && staged !== applied;
      }));

  if (profile.isCopter && profile.frame !== null) {
    const layout = getMotorLayout(profile.frame);
    for (const motor of layout?.motors ?? []) {
      addRequirement(requirements, servoFunctionForMotor(motor.motorNumber), {
        label: `Motor ${motor.motorNumber}`,
        detail: `${layout?.className ?? "Copter"} ${layout?.typeName ?? "frame"} motor layout`,
        category: "propulsion",
      });
    }
    if (layout?.yawServo) {
      addRequirement(requirements, ArduPilotServoFunction.TricopterYaw, {
        label: layout.yawServo.label,
        detail: "Tricopter yaw actuator",
        category: "servo",
      });
    }
  }

  if (profile.isPlane && profile.quadPlaneEnabled) {
    const topology = buildVtolTopologyModel(input);
    topologyMappingLocked ||= topology.requiresRefreshBeforeMapping;
    for (const propulsor of topology.proposed.propulsors) {
      addRequirement(requirements, propulsor.functionValue, {
        label: propulsor.label,
        detail: topology.proposed.architectureLabel,
        category: "propulsion",
      });
    }
    for (const actuator of topology.proposed.actuators.filter((candidate) => candidate.required)) {
      addRequirement(requirements, actuator.functionValue, {
        label: actuator.label,
        detail: `${topology.proposed.architectureLabel} mechanism`,
        category: "servo",
      });
    }
  }

  return { requirements, topologyMappingLocked };
}

function recommendedValues(input: OutputMappingInput): Map<number, string> {
  const profile = deriveVehicleProfile(input.vehicleType, input);
  const recommendations = new Map<number, string>();
  if (!profile.isPlane) return recommendations;

  for (const value of PLANE_RECOMMENDATIONS) {
    recommendations.set(value, "Conventional Plane control surface");
  }
  if (profile.subtype !== "tiltrotor" && profile.subtype !== "tailsitter") {
    recommendations.set(CONVENTIONAL_PLANE_THROTTLE, "Conventional Plane propulsion");
  }
  return recommendations;
}

function rowOrder(row: OutputFunctionRow): [number, number, number] {
  const sourceOrder = row.required ? 0 : row.recommended ? 1 : row.source === "configured" ? 2 : 3;
  const firstOutput = row.proposedOutputIndexes[0] ?? Number.MAX_SAFE_INTEGER;
  return [sourceOrder, firstOutput, row.value];
}

function compareRows(left: OutputFunctionRow, right: OutputFunctionRow): number {
  const a = rowOrder(left);
  const b = rowOrder(right);
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

export function buildOutputMappingModel(input: OutputMappingInput): OutputMappingModel {
  const outputs = discoverPhysicalOutputs(input);
  const labels = metadataFunctionLabels(input);
  const frameClass = outputFrameClass(input.paramStore);
  const { requirements, topologyMappingLocked } = buildRequirements(input);
  const recommendations = recommendedValues(input);
  const configuredValues = new Set(
    outputs.flatMap((output) => [output.appliedFunctionValue, output.proposedFunctionValue]),
  );
  configuredValues.delete(ArduPilotServoFunction.Disabled);
  const visibleValues = new Set<number>([
    ...configuredValues,
    ...requirements.keys(),
    ...recommendations.keys(),
    ...(input.addedFunctionValues ?? []),
  ]);

  const catalogValues = metadataFunctionValues(input);
  for (const value of configuredValues) catalogValues.add(value);
  for (const value of requirements.keys()) catalogValues.add(value);
  for (const value of recommendations.keys()) catalogValues.add(value);
  catalogValues.delete(ArduPilotServoFunction.Disabled);

  const catalog = [...catalogValues]
    .filter(Number.isFinite)
    .map(
      (value) =>
        ({
          value,
          label: functionLabel(value, labels, frameClass),
          category:
            requirements.get(value)?.category ??
            (isPropulsionServoFunction(value, frameClass) ? "propulsion" : "servo"),
        }) satisfies OutputFunctionCatalogItem,
    )
    .sort((left, right) => left.label.localeCompare(right.label) || left.value - right.value);
  const catalogByValue = new Map(catalog.map((item) => [item.value, item]));

  const rows = [...visibleValues]
    .flatMap((value) => {
      if (!Number.isFinite(value) || value === ArduPilotServoFunction.Disabled) return [];
      const requirement = requirements.get(value);
      const recommendation = recommendations.get(value);
      const appliedOutputIndexes = outputs
        .filter((output) => output.appliedFunctionValue === value)
        .map((output) => output.index);
      const proposedOutputIndexes = outputs
        .filter((output) => output.proposedFunctionValue === value)
        .map((output) => output.index);
      const catalogItem = catalogByValue.get(value) ?? {
        value,
        label: requirement?.label ?? functionLabel(value, labels, frameClass),
        category: requirement?.category ?? (isPropulsionServoFunction(value, frameClass) ? "propulsion" : "servo"),
      };
      const source: OutputFunctionSource = requirement
        ? "required"
        : recommendation
          ? "recommended"
          : configuredValues.has(value)
            ? "configured"
            : "catalog";
      return [
        {
          ...catalogItem,
          label: requirement?.label ?? catalogItem.label,
          source,
          sourceDetail: requirement?.detail ?? recommendation ?? "Firmware output function",
          required: Boolean(requirement),
          recommended: Boolean(recommendation),
          topologyDependent: Boolean(requirement),
          mappingLocked: Boolean(requirement) && topologyMappingLocked,
          appliedOutputIndexes,
          proposedOutputIndexes,
          hasStagedChange: appliedOutputIndexes.join(",") !== proposedOutputIndexes.join(","),
          mirroredMotor:
            catalogItem.category === "propulsion" &&
            motorNumberForServoFunction(value) !== null &&
            proposedOutputIndexes.length > 1,
        } satisfies OutputFunctionRow,
      ];
    })
    .sort(compareRows);

  return {
    outputs,
    catalog,
    propulsionRows: rows.filter((row) => row.category === "propulsion"),
    servoRows: rows.filter((row) => row.category === "servo"),
    requiredFunctionValues: [...requirements.keys()],
    assignedOutputCount: outputs.filter((output) => output.proposedFunctionValue !== ArduPilotServoFunction.Disabled)
      .length,
    missingRequiredCount: [...requirements.keys()].filter(
      (value) => !outputs.some((output) => output.proposedFunctionValue === value),
    ).length,
    stagedOutputCount: outputs.filter((output) => output.hasStagedChange).length,
    topologyMappingLocked,
  };
}

export function planOutputFunctionAssignment(
  input: Pick<OutputMappingInput, "paramStore" | "metadata" | "stagedEdits">,
  functionValue: number,
  desiredOutputIndexes: readonly number[],
  options: {
    requiredFunctionValues?: readonly number[];
    category?: OutputFunctionCategory;
  } = {},
): OutputAssignmentPlan | null {
  if (!Number.isFinite(functionValue) || functionValue === ArduPilotServoFunction.Disabled) return null;

  const outputs = discoverPhysicalOutputs(input);
  const outputIndexes = new Set(outputs.map((output) => output.index));
  const desired = [...new Set(desiredOutputIndexes)]
    .filter((index) => Number.isInteger(index) && outputIndexes.has(index))
    .sort((left, right) => left - right);
  const desiredSet = new Set(desired);
  const previousOutputIndexes = outputs
    .filter((output) => output.proposedFunctionValue === functionValue)
    .map((output) => output.index);
  const edits: OutputAssignmentEdit[] = [];
  const displacedAssignments: DisplacedOutputAssignment[] = [];

  for (const output of outputs) {
    const wasAssigned = output.proposedFunctionValue === functionValue;
    const shouldBeAssigned = desiredSet.has(output.index);
    if (wasAssigned && !shouldBeAssigned) {
      edits.push({ paramName: output.paramName, nextValue: ArduPilotServoFunction.Disabled });
    } else if (!wasAssigned && shouldBeAssigned) {
      if (output.proposedFunctionValue !== ArduPilotServoFunction.Disabled) {
        displacedAssignments.push({
          outputIndex: output.index,
          previousFunctionValue: output.proposedFunctionValue,
          previousFunctionLabel: output.proposedFunctionLabel,
        });
      }
      edits.push({ paramName: output.paramName, nextValue: functionValue });
    }
  }

  const nextValues = new Map(outputs.map((output) => [output.index, output.proposedFunctionValue]));
  for (const edit of edits) {
    const index = Number(edit.paramName.match(OUTPUT_FUNCTION_PARAM)?.[1]);
    if (Number.isInteger(index)) nextValues.set(index, edit.nextValue);
  }
  const newlyMissingRequiredFunctionValues = [...new Set(options.requiredFunctionValues ?? [])].filter(
    (requiredValue) =>
      outputs.some((output) => output.proposedFunctionValue === requiredValue) &&
      ![...nextValues.values()].some((value) => value === requiredValue),
  );

  return {
    functionValue,
    desiredOutputIndexes: desired,
    previousOutputIndexes,
    edits,
    displacedAssignments,
    newlyMissingRequiredFunctionValues,
    mirroredMotor:
      options.category === "propulsion" && motorNumberForServoFunction(functionValue) !== null && desired.length > 1,
  };
}
