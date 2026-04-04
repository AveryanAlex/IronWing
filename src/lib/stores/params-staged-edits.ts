import { formatParamValue, type ParameterWorkspaceItem } from "../params/workspace-sections";

import type { ParamStore } from "../../params";

export type StagedParameterEdit = {
  name: string;
  label: string;
  rawName: string;
  description: string | null;
  currentValue: number;
  currentValueText: string;
  nextValue: number;
  nextValueText: string;
  units: string | null;
  rebootRequired: boolean;
  order: number;
};

export function stageParameterEdit(
  stagedEdits: Record<string, StagedParameterEdit>,
  item: ParameterWorkspaceItem,
  currentValue: number,
  nextValue: number,
): Record<string, StagedParameterEdit> {
  const nextStagedEdits = { ...stagedEdits };
  if (nextValue === currentValue) {
    delete nextStagedEdits[item.name];
    return nextStagedEdits;
  }

  nextStagedEdits[item.name] = {
    name: item.name,
    label: item.label,
    rawName: item.rawName,
    description: item.description,
    currentValue,
    currentValueText: formatParamValue(currentValue),
    nextValue,
    nextValueText: formatParamValue(nextValue),
    units: item.units,
    rebootRequired: item.rebootRequired,
    order: item.order,
  };

  return nextStagedEdits;
}

export function discardStagedEdit(
  stagedEdits: Record<string, StagedParameterEdit>,
  name: string,
): Record<string, StagedParameterEdit> {
  if (!(name in stagedEdits)) {
    return stagedEdits;
  }

  const nextStagedEdits = { ...stagedEdits };
  delete nextStagedEdits[name];
  return nextStagedEdits;
}

export function clearStagedEdits(stagedEdits: Record<string, StagedParameterEdit>): Record<string, StagedParameterEdit> {
  if (Object.keys(stagedEdits).length === 0) {
    return stagedEdits;
  }

  return {};
}

export function pruneResolvedStagedEdits(
  stagedEdits: Record<string, StagedParameterEdit>,
  paramStore: ParamStore | null,
): Record<string, StagedParameterEdit> {
  if (Object.keys(stagedEdits).length === 0) {
    return stagedEdits;
  }

  const nextEntries = Object.entries(stagedEdits).filter(([name, edit]) => {
    const currentValue = paramStore?.params[name]?.value;
    if (typeof currentValue !== "number" || !Number.isFinite(currentValue)) {
      return true;
    }

    return currentValue !== edit.nextValue;
  });

  if (nextEntries.length === Object.keys(stagedEdits).length) {
    return stagedEdits;
  }

  return Object.fromEntries(nextEntries);
}
