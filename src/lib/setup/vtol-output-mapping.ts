import type { ParamStore } from "../../params";

export type VtolOutputMappingInput = {
  paramStore: ParamStore | null;
  stagedEdits: Record<string, { nextValue: number } | undefined>;
};

export type VtolPhysicalOutput = {
  index: number;
  paramName: string;
  appliedFunctionValue: number;
  proposedFunctionValue: number;
  hasStagedChange: boolean;
};

export type VtolOutputEdit = {
  paramName: string;
  nextValue: number;
};

export type VtolOutputAssignmentPlan = {
  functionValue: number;
  targetOutputIndex: number | null;
  previousOutputIndexes: number[];
  displacedFunctionValue: number | null;
  edits: VtolOutputEdit[];
};

function currentValue(input: VtolOutputMappingInput, paramName: string): number | null {
  const value = input.paramStore?.params[paramName]?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function proposedValue(input: VtolOutputMappingInput, paramName: string): number | null {
  const staged = input.stagedEdits[paramName]?.nextValue;
  return typeof staged === "number" && Number.isFinite(staged) ? staged : currentValue(input, paramName);
}

export function listVtolPhysicalOutputs(input: VtolOutputMappingInput): VtolPhysicalOutput[] {
  const outputs: VtolPhysicalOutput[] = [];
  for (let index = 1; index <= 32; index += 1) {
    const paramName = `SERVO${index}_FUNCTION`;
    const appliedFunctionValue = currentValue(input, paramName);
    if (appliedFunctionValue === null) {
      continue;
    }
    const nextValue = proposedValue(input, paramName) ?? appliedFunctionValue;
    outputs.push({
      index,
      paramName,
      appliedFunctionValue,
      proposedFunctionValue: nextValue,
      hasStagedChange: nextValue !== appliedFunctionValue,
    });
  }
  return outputs;
}

export function planVtolOutputAssignment(
  input: VtolOutputMappingInput,
  functionValue: number,
  targetOutputIndex: number | null,
): VtolOutputAssignmentPlan | null {
  if (!Number.isFinite(functionValue) || functionValue <= 0) {
    return null;
  }

  const outputs = listVtolPhysicalOutputs(input);
  const previousOutputIndexes = outputs
    .filter((output) => output.proposedFunctionValue === functionValue)
    .map((output) => output.index);
  const target = targetOutputIndex === null
    ? null
    : outputs.find((output) => output.index === targetOutputIndex) ?? null;
  if (targetOutputIndex !== null && !target) {
    return null;
  }

  const displacedFunctionValue = target && target.proposedFunctionValue > 0 && target.proposedFunctionValue !== functionValue
    ? target.proposedFunctionValue
    : null;
  const edits: VtolOutputEdit[] = [];

  for (const previousIndex of previousOutputIndexes) {
    if (previousIndex === targetOutputIndex) {
      continue;
    }
    edits.push({ paramName: `SERVO${previousIndex}_FUNCTION`, nextValue: 0 });
  }

  if (target && target.proposedFunctionValue !== functionValue) {
    edits.push({ paramName: target.paramName, nextValue: functionValue });
  }

  return {
    functionValue,
    targetOutputIndex,
    previousOutputIndexes,
    displacedFunctionValue,
    edits,
  };
}
