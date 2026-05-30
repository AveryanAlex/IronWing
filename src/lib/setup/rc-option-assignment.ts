import type { ParamMeta } from "../../param-metadata";
import { formatParamValue, type ParameterItemModel } from "../params/parameter-item-model";
import type { RcChannelSample } from "./rc-input-normalization";
import { roundToIncrement } from "./rate-curves";

export type RcOptionStagedEdits = Record<string, { nextValue: number } | undefined>;

export type RcFunctionOption = {
  code: number;
  label: string;
  preserved?: boolean;
};

export type RcOptionLiveSample = {
  pwm: number;
  stale: boolean;
};

export type RcOptionAssignment = {
  channel: number;
  name: string;
  item: ParameterItemModel;
  value: number;
  staged: boolean;
  liveSample: RcOptionLiveSample | null;
  duplicateChannels: number[];
};

export type RcOptionDuplicateAssignment = {
  value: number;
  channels: number[];
};

export function rcOptionParamName(channel: number): string {
  return `RC${channel}_OPTION`;
}

export function discoverRcOptionAssignments(
  itemIndex: ReadonlyMap<string, ParameterItemModel>,
  stagedEdits: RcOptionStagedEdits = {},
  channels: readonly RcChannelSample[] = [],
): RcOptionAssignment[] {
  const assignments: RcOptionAssignment[] = [];
  for (let channel = 1; channel <= 16; channel += 1) {
    const name = rcOptionParamName(channel);
    const item = itemIndex.get(name);
    if (!item) {
      continue;
    }

    const stagedValue = stagedEdits[name]?.nextValue;
    assignments.push({
      channel,
      name,
      item,
      value: typeof stagedValue === "number" && Number.isFinite(stagedValue) ? stagedValue : item.value,
      staged: typeof stagedValue === "number" && Number.isFinite(stagedValue),
      liveSample: resolveRcOptionLiveSample(channel, channels),
      duplicateChannels: [],
    });
  }

  const duplicates = detectDuplicateEnabledRcOptionAssignments(assignments);
  return assignments.map((assignment) => ({
    ...assignment,
    duplicateChannels: duplicates.find((duplicate) => duplicate.value === assignment.value)?.channels ?? [],
  }));
}

export function normalizeRcFunctionOptions(values: ParamMeta["values"] | null | undefined): RcFunctionOption[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const options = new Map<number, RcFunctionOption>();
  for (const value of values) {
    const label = typeof value?.label === "string" ? value.label.trim() : "";
    if (typeof value?.code !== "number" || !Number.isFinite(value.code) || label.length === 0 || options.has(value.code)) {
      continue;
    }

    options.set(value.code, { code: value.code, label });
  }

  return [...options.values()].sort((left, right) => left.code - right.code || left.label.localeCompare(right.label));
}

export function filterRcFunctionOptions(options: readonly RcFunctionOption[], search: string): RcFunctionOption[] {
  const query = search.trim().toLocaleLowerCase();
  if (query.length === 0) {
    return [...options];
  }

  return options.filter((option) => option.label.toLocaleLowerCase().includes(query) || String(option.code).includes(query));
}

export function preserveSelectedRcFunctionOption(
  filteredOptions: readonly RcFunctionOption[],
  allOptions: readonly RcFunctionOption[],
  selectedValue: number | null,
): RcFunctionOption[] {
  if (selectedValue === null || !Number.isFinite(selectedValue) || filteredOptions.some((option) => option.code === selectedValue)) {
    return [...filteredOptions];
  }

  const selectedOption = allOptions.find((option) => option.code === selectedValue);
  return [
    {
      code: selectedValue,
      label: selectedOption?.label ?? `Raw assignment ${formatParamValue(selectedValue)}`,
      preserved: true,
    },
    ...filteredOptions,
  ];
}

export function resolveRcFunctionOptionLabel(options: readonly RcFunctionOption[], value: number): string {
  return options.find((option) => option.code === value)?.label ?? `Raw assignment ${formatParamValue(value)}`;
}

export function detectDuplicateEnabledRcOptionAssignments(
  assignments: readonly Pick<RcOptionAssignment, "channel" | "value">[],
): RcOptionDuplicateAssignment[] {
  const channelsByValue = new Map<number, number[]>();
  for (const assignment of assignments) {
    if (!Number.isFinite(assignment.value) || assignment.value === 0) {
      continue;
    }

    channelsByValue.set(assignment.value, [...(channelsByValue.get(assignment.value) ?? []), assignment.channel]);
  }

  return [...channelsByValue.entries()]
    .filter(([, channels]) => channels.length > 1)
    .map(([value, channels]) => ({ value, channels }))
    .sort((left, right) => left.value - right.value);
}

export function resolveRcOptionLiveSample(channel: number, channels: readonly RcChannelSample[]): RcOptionLiveSample | null {
  const sample = channels.find((entry) => entry.channel === channel && Number.isFinite(entry.pwm));
  return sample ? { pwm: sample.pwm, stale: sample.stale === true } : null;
}

export function clampRcOptionDraftValue(item: ParameterItemModel, value: number): number {
  if (!Number.isFinite(value)) {
    return item.value;
  }

  const min = item.range?.min ?? Number.NEGATIVE_INFINITY;
  const max = item.range?.max ?? Number.POSITIVE_INFINITY;
  const clamped = Math.min(max, Math.max(min, value));
  return Math.min(max, Math.max(min, roundToIncrement(clamped, item.increment)));
}
