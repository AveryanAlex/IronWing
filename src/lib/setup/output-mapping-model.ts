import { getMotorLayout } from "../../data/motor-layouts";
import type { ParamMetadataMap } from "../../param-metadata";
import type { ParamStore } from "../../params";
import {
  isPropulsionServoFunction,
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
  stagedEdits: Record<string, { nextValue: number } | undefined>;
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
const PLANE_RECOMMENDATIONS = [4, 19, 21] as const;
const CONVENTIONAL_PLANE_THROTTLE = 70;
const KNOWN_FUNCTION_LABELS = new Map<number, string>([
  [-1, "GPIO"],
  [4, "Aileron"],
  [19, "Elevator"],
  [21, "Rudder"],
  [41, "Tilt motors front"],
  [45, "Tilt motors rear"],
  [46, "Tilt motor rear left"],
  [47, "Tilt motor rear right"],
  [70, "Throttle"],
  [73, "Throttle left"],
  [74, "Throttle right"],
  [75, "Tilt motor front left"],
  [76, "Tilt motor front right"],
  [77, "Elevon left"],
  [78, "Elevon right"],
  [79, "V-tail left"],
  [80, "V-tail right"],
  [81, "Boost throttle"],
]);

function currentValue(input: Pick<OutputMappingInput, "paramStore">, paramName: string): number | null {
  const value = input.paramStore?.params[paramName]?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function proposedValue(
  input: Pick<OutputMappingInput, "paramStore" | "stagedEdits">,
  paramName: string,
): number | null {
  const staged = input.stagedEdits[paramName]?.nextValue;
  return typeof staged === "number" && Number.isFinite(staged) ? staged : currentValue(input, paramName);
}

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

function functionLabel(functionValue: number, labels: ReadonlyMap<number, string>): string {
  return labels.get(functionValue)
    ?? propulsionFunctionLabel(functionValue)
    ?? `Function ${functionValue}`;
}

export function discoverPhysicalOutputs(
  input: Pick<OutputMappingInput, "paramStore" | "metadata" | "stagedEdits">,
): PhysicalOutput[] {
  const labels = metadataFunctionLabels(input);
  return Object.keys(input.paramStore?.params ?? {})
    .flatMap((paramName) => {
      const match = paramName.match(OUTPUT_FUNCTION_PARAM);
      const appliedFunctionValue = currentValue(input, paramName);
      if (!match || appliedFunctionValue === null) return [];
      const index = Number(match[1]);
      if (!Number.isInteger(index) || index < 1) return [];
      const proposedFunctionValue = proposedValue(input, paramName) ?? appliedFunctionValue;
      return [{
        index,
        paramName,
        appliedFunctionValue,
        proposedFunctionValue,
        appliedFunctionLabel: functionLabel(appliedFunctionValue, labels),
        proposedFunctionLabel: functionLabel(proposedFunctionValue, labels),
        hasStagedChange: proposedFunctionValue !== appliedFunctionValue,
        readOnly: input.metadata?.get(paramName)?.readOnly === true,
      } satisfies PhysicalOutput];
    })
    .sort((left, right) => left.index - right.index);
}

function addRequirement(
  requirements: Map<number, Requirement>,
  value: number | null,
  requirement: Requirement,
) {
  if (value === null || requirements.has(value)) return;
  requirements.set(value, requirement);
}

function buildRequirements(input: OutputMappingInput): {
  requirements: Map<number, Requirement>;
  topologyMappingLocked: boolean;
} {
  const profile = deriveVehicleProfile(input.vehicleType, input);
  const requirements = new Map<number, Requirement>();
  let topologyMappingLocked = profile.stagedFrameClassChange
    || profile.stagedFrameTypeChange
    || profile.stagedEnableChange
    || (profile.isCopter && ["FRAME_CLASS", "FRAME_TYPE"].some((name) => {
      const staged = input.stagedEdits[name]?.nextValue;
      const applied = currentValue(input, name);
      return typeof staged === "number" && applied !== null && staged !== applied;
    }));

  if (profile.isCopter && profile.frameClassValue !== null && profile.frameTypeValue !== null) {
    const layout = getMotorLayout(profile.frameClassValue, profile.frameTypeValue);
    for (const motor of layout?.motors ?? []) {
      addRequirement(requirements, servoFunctionForMotor(motor.motorNumber), {
        label: `Motor ${motor.motorNumber}`,
        detail: `${layout?.className ?? "Copter"} ${layout?.typeName ?? "frame"} motor layout`,
        category: "propulsion",
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
  const { requirements, topologyMappingLocked } = buildRequirements(input);
  const recommendations = recommendedValues(input);
  const configuredValues = new Set(outputs.flatMap((output) => [output.appliedFunctionValue, output.proposedFunctionValue]));
  configuredValues.delete(0);
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
  catalogValues.delete(0);

  const catalog = [...catalogValues]
    .filter(Number.isFinite)
    .map((value) => ({
      value,
      label: functionLabel(value, labels),
      category: requirements.get(value)?.category
        ?? (isPropulsionServoFunction(value) ? "propulsion" : "servo"),
    } satisfies OutputFunctionCatalogItem))
    .sort((left, right) => left.label.localeCompare(right.label) || left.value - right.value);
  const catalogByValue = new Map(catalog.map((item) => [item.value, item]));

  const rows = [...visibleValues].flatMap((value) => {
    if (!Number.isFinite(value) || value === 0) return [];
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
      label: requirement?.label ?? functionLabel(value, labels),
      category: requirement?.category ?? (isPropulsionServoFunction(value) ? "propulsion" : "servo"),
    };
    const source: OutputFunctionSource = requirement
      ? "required"
      : recommendation
        ? "recommended"
        : configuredValues.has(value)
          ? "configured"
          : "catalog";
    return [{
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
      mirroredMotor: catalogItem.category === "propulsion"
        && motorNumberForServoFunction(value) !== null
        && proposedOutputIndexes.length > 1,
    } satisfies OutputFunctionRow];
  }).sort(compareRows);

  return {
    outputs,
    catalog,
    propulsionRows: rows.filter((row) => row.category === "propulsion"),
    servoRows: rows.filter((row) => row.category === "servo"),
    requiredFunctionValues: [...requirements.keys()],
    assignedOutputCount: outputs.filter((output) => output.proposedFunctionValue !== 0).length,
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
  if (!Number.isFinite(functionValue) || functionValue === 0) return null;

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
      edits.push({ paramName: output.paramName, nextValue: 0 });
    } else if (!wasAssigned && shouldBeAssigned) {
      if (output.proposedFunctionValue !== 0) {
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
  const newlyMissingRequiredFunctionValues = [...new Set(options.requiredFunctionValues ?? [])]
    .filter((requiredValue) => (
      outputs.some((output) => output.proposedFunctionValue === requiredValue)
      && ![...nextValues.values()].some((value) => value === requiredValue)
    ));

  return {
    functionValue,
    desiredOutputIndexes: desired,
    previousOutputIndexes,
    edits,
    displacedAssignments,
    newlyMissingRequiredFunctionValues,
    mirroredMotor: options.category === "propulsion"
      && motorNumberForServoFunction(functionValue) !== null
      && desired.length > 1,
  };
}
