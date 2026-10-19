import type { ParameterItemModel } from "./parameter-item-model";
import { finiteParameterValue, resolveParameterValue, type DraftParameterValues, type StagedParameterValues } from "./parameter-values";
import { roundToIncrement } from "../numeric";

export type NumericRule = {
  range?: { min: number; max: number } | null;
  increment?: number | null;
  specialValues?: readonly number[];
};

export type NumericEditState = {
  draftValue: number;
  staged: boolean;
  changed: boolean;
  locallyEdited: boolean;
  pendingStage: boolean;
};

export function normalizeNumericDraft(rule: NumericRule, value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  if (rule.specialValues?.includes(value)) return value;
  const min = rule.range?.min ?? -Infinity;
  const max = rule.range?.max ?? Infinity;
  const clamp = (next: number) => Math.min(max, Math.max(min, next));
  return clamp(roundToIncrement(clamp(value), rule.increment));
}

export function clampParameterDraft(item: ParameterItemModel, value: number): number {
  return normalizeNumericDraft(item, value, item.value);
}

export function sameNumericValue(left: number, right: number, increment?: number | null): boolean {
  return Math.abs(left - right) <= Math.max(1e-6, (increment ?? 1) * 0.001);
}

export function resolveNumericEditState(
  item: ParameterItemModel, stagedEdits: StagedParameterValues, drafts: DraftParameterValues,
): NumericEditState {
  const draftValue = resolveParameterValue(item.value, stagedEdits[item.name], drafts[item.name]) ?? item.value;
  const stagedValue = finiteParameterValue(stagedEdits[item.name]?.nextValue);
  const staged = stagedValue !== null;
  const locallyEdited = Object.prototype.hasOwnProperty.call(drafts, item.name);
  return {
    draftValue, staged, locallyEdited,
    changed: !sameNumericValue(draftValue, item.value, item.increment),
    pendingStage: locallyEdited && !sameNumericValue(draftValue, stagedValue ?? item.value, item.increment),
  };
}
