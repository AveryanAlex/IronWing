import type { ParameterItemModel } from "../../../lib/params/parameter-item-model";
import type { StagedParameterEdit } from "../../../lib/stores/params";

export type SetupEnumOption = {
  code: number;
  label: string;
};

export type SetupStagedEdits = Record<string, StagedParameterEdit | undefined>;

type SetupParameterStageStore = {
  stageParameterEdit: (item: ParameterItemModel, nextValue: number) => void;
};

type StageSetupParameterEditOptions = {
  actionsBlocked?: boolean;
  optionsReady?: boolean;
};

export function resolveSetupEnumOptions(
  values: readonly { code: number; label: string }[] | null | undefined,
): SetupEnumOption[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return values.filter((value) => Number.isFinite(value.code) && value.label.trim().length > 0);
}

export function resolveSetupDraftNumber(value: unknown): number | null {
  const normalized = typeof value === "string" ? value : value == null ? "" : String(value);
  if (normalized.trim().length === 0) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function resolveSetupDraftValue(
  item: ParameterItemModel | null | undefined,
  stagedEdits: SetupStagedEdits | null | undefined,
  fallback: number | string | null = "",
): string {
  const value = item ? (stagedEdits?.[item.name]?.nextValue ?? item.value) : fallback;
  return value === null || value === undefined ? "" : String(value);
}

export function stageSetupParameterEdit(
  paramsStore: SetupParameterStageStore,
  item: ParameterItemModel | null | undefined,
  draftValue: unknown,
  { actionsBlocked = false, optionsReady = true }: StageSetupParameterEditOptions = {},
): boolean {
  const nextValue = resolveSetupDraftNumber(draftValue);
  if (!item || item.readOnly === true || nextValue === null || actionsBlocked || !optionsReady) {
    return false;
  }

  paramsStore.stageParameterEdit(item, nextValue);
  return true;
}
