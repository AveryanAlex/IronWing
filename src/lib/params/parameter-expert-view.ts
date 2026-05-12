import type { ParamMeta, ParamMetadataMap } from "../../param-metadata";
import type { ParamStore } from "../../params";
import type { StagedParameterEdit } from "../stores/params-staged-edits";
import {
  buildParameterItemModels,
  formatParamValue,
  type ParameterItemModel,
} from "./parameter-item-model";

export type ParameterExpertFilter = "standard" | "all" | "modified";

export type ParameterExpertEnumOption = {
  code: number;
  label: string;
};

export type ParameterExpertBitmaskOption = {
  bit: number;
  label: string;
  enabled: boolean;
};

export type ParameterExpertRow = ParameterItemModel & {
  renderId: string;
  groupKey: string;
  groupLabel: string;
  userLevel: "Standard" | "Advanced" | "Unknown";
  isStandard: boolean;
  isStaged: boolean;
  stagedValue: number | null;
  stagedValueText: string | null;
  stagedValueLabel: string | null;
  diffText: string | null;
  failureMessage: string | null;
  editorKind: "number" | "enum" | "bitmask";
  enumOptions: ParameterExpertEnumOption[];
  bitmaskOptions: ParameterExpertBitmaskOption[];
  isHighlighted: boolean;
};

export type ParameterExpertGroup = {
  key: string;
  label: string;
  rows: ParameterExpertRow[];
};

export type ParameterExpertView = {
  filter: ParameterExpertFilter;
  searchText: string;
  metadataAvailable: boolean;
  totalCount: number;
  matchingCount: number;
  visibleCount: number;
  stagedCount: number;
  highlightedCount: number;
  forcedHighlightCount: number;
  missingHighlightTargets: string[];
  hiddenStagedRows: ParameterExpertRow[];
  groups: ParameterExpertGroup[];
};

export type ParameterExpertRetainedFailure = {
  message: string;
};

export function buildParameterExpertView(args: {
  paramStore: ParamStore | null;
  metadata: ParamMetadataMap | null;
  stagedEdits: Record<string, StagedParameterEdit>;
  retainedFailures: Record<string, ParameterExpertRetainedFailure>;
  filter: ParameterExpertFilter;
  searchText: string;
  highlightTargets?: string[];
}): ParameterExpertView {
  const rows = buildParameterItemModels(args.paramStore, args.metadata).map((item, index) =>
    buildExpertRow(item, index, args.metadata?.get(item.name), args.stagedEdits[item.name], args.retainedFailures[item.name]),
  );
  const normalizedSearch = args.searchText.trim().toLowerCase();
  const requestedHighlights = normalizeHighlightTargets(args.highlightTargets ?? []);
  const highlightNames = new Set(requestedHighlights);
  const resolvedNames = new Set(rows.map((row) => row.name));
  const missingHighlightTargets = requestedHighlights.filter((name) => !resolvedNames.has(name));

  const visibility = rows.map((row) => {
    const matchesFilter = matchesExpertFilter(row, args.filter);
    const matchesSearch = matchesExpertSearch(row, normalizedSearch);
    const isHighlighted = highlightNames.has(row.name);
    return {
      ...row,
      isHighlighted,
      matchesFilter,
      matchesSearch,
      isVisible: (matchesFilter && matchesSearch) || isHighlighted,
    };
  });

  const matchingCount = visibility.filter((row) => row.matchesFilter && row.matchesSearch).length;
  const visibleRows = visibility.filter((row) => row.isVisible);
  const hiddenStagedRows = visibility.filter((row) => (row.isStaged || row.failureMessage !== null) && !row.isVisible);

  return {
    filter: args.filter,
    searchText: args.searchText,
    metadataAvailable: args.metadata !== null,
    totalCount: rows.length,
    matchingCount,
    visibleCount: visibleRows.length,
    stagedCount: rows.filter((row) => row.isStaged).length,
    highlightedCount: visibility.filter((row) => row.isHighlighted).length,
    forcedHighlightCount: visibility.filter(
      (row) => row.isHighlighted && !(row.matchesFilter && row.matchesSearch),
    ).length,
    missingHighlightTargets,
    hiddenStagedRows,
    groups: buildGroups(visibleRows),
  };
}

function buildExpertRow(
  item: ParameterItemModel,
  index: number,
  meta: ParamMeta | undefined,
  stagedEdit: StagedParameterEdit | undefined,
  retainedFailure: ParameterExpertRetainedFailure | undefined,
): ParameterExpertRow {
  const enumOptions = normalizeEnumOptions(meta?.values);
  const bitmaskOptions = normalizeBitmaskOptions(meta?.bitmask, item.value);
  const isStaged = Boolean(stagedEdit && stagedEdit.nextValue !== item.value);
  const stagedValue = isStaged ? stagedEdit?.nextValue ?? null : null;
  const stagedValueText = stagedValue === null ? null : formatParamValue(stagedValue);
  const stagedValueLabel = stagedValue === null ? null : resolveValueLabel(stagedValue, meta);
  const prefix = resolveGroupPrefix(item.rawName);
  const userLevel = resolveUserLevel(meta);

  return {
    ...item,
    renderId: `${item.rawName}#${index}`,
    groupKey: prefix,
    groupLabel: prefix,
    userLevel,
    isStandard: userLevel !== "Advanced",
    isStaged,
    stagedValue,
    stagedValueText,
    stagedValueLabel,
    diffText: stagedValueText === null ? null : `${item.valueText} → ${stagedValueText}`,
    failureMessage: normalizeOptionalText(retainedFailure?.message) ?? null,
    editorKind: enumOptions.length > 0 ? "enum" : bitmaskOptions.length > 0 ? "bitmask" : "number",
    enumOptions,
    bitmaskOptions,
    isHighlighted: false,
  };
}

function buildGroups(rows: ParameterExpertRow[]): ParameterExpertGroup[] {
  const groups = new Map<string, ParameterExpertGroup>();

  for (const row of rows) {
    const existing = groups.get(row.groupKey);
    if (existing) {
      existing.rows.push(row);
      continue;
    }

    groups.set(row.groupKey, {
      key: row.groupKey,
      label: row.groupLabel,
      rows: [row],
    });
  }

  return Array.from(groups.values()).map((group) => ({
    ...group,
    rows: group.rows.sort((left, right) => left.order - right.order || left.name.localeCompare(right.name)),
  }));
}

function matchesExpertFilter(row: ParameterExpertRow, filter: ParameterExpertFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "modified":
      return row.isStaged || row.failureMessage !== null;
    case "standard":
    default:
      return row.isStandard;
  }
}

function matchesExpertSearch(row: ParameterExpertRow, normalizedSearch: string): boolean {
  if (normalizedSearch.length === 0) {
    return true;
  }

  const haystack = [
    row.name,
    row.rawName,
    row.label,
    row.description,
    row.valueLabel,
    row.groupLabel,
    row.enumOptions.map((option) => option.label).join(" "),
    row.bitmaskOptions.map((option) => option.label).join(" "),
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalizedSearch);
}

function resolveGroupPrefix(rawName: string): string {
  const [prefix] = rawName.split("_");
  const trimmed = prefix?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : rawName;
}

function resolveUserLevel(meta: ParamMeta | undefined): "Standard" | "Advanced" | "Unknown" {
  if (meta?.userLevel === "Standard" || meta?.userLevel === "Advanced") {
    return meta.userLevel;
  }

  return "Unknown";
}

function normalizeHighlightTargets(targets: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const target of targets) {
    const trimmed = target.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

function normalizeEnumOptions(values: ParamMeta["values"] | undefined): ParameterExpertEnumOption[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const normalized: ParameterExpertEnumOption[] = [];
  for (const value of values) {
    if (typeof value?.code !== "number" || !Number.isFinite(value.code)) {
      continue;
    }

    const label = normalizeOptionalText(value.label);
    if (!label) {
      continue;
    }

    normalized.push({ code: value.code, label });
  }

  return normalized;
}

function normalizeBitmaskOptions(
  values: ParamMeta["bitmask"] | undefined,
  currentValue: number,
): ParameterExpertBitmaskOption[] {
  if (!Array.isArray(values) || !Number.isInteger(currentValue) || currentValue < 0) {
    return [];
  }

  const normalized: ParameterExpertBitmaskOption[] = [];
  for (const value of values) {
    if (
      typeof value?.bit !== "number"
      || !Number.isInteger(value.bit)
      || value.bit < 0
      || value.bit > 31
    ) {
      continue;
    }

    const label = normalizeOptionalText(value.label);
    if (!label) {
      continue;
    }

    normalized.push({
      bit: value.bit,
      label,
      enabled: (currentValue & (1 << value.bit)) !== 0,
    });
  }

  return normalized;
}

function resolveValueLabel(value: number, meta: ParamMeta | undefined): string | null {
  const enumLabel = resolveEnumLabel(value, meta?.values);
  if (enumLabel) {
    return enumLabel;
  }

  return resolveBitmaskLabel(value, meta?.bitmask);
}

function resolveEnumLabel(value: number, values: ParamMeta["values"] | undefined): string | null {
  if (!Array.isArray(values)) {
    return null;
  }

  for (const option of values) {
    if (typeof option?.code !== "number" || !Number.isFinite(option.code)) {
      continue;
    }

    const label = normalizeOptionalText(option.label);
    if (!label) {
      continue;
    }

    if (option.code === value) {
      return label;
    }
  }

  return null;
}

function resolveBitmaskLabel(value: number, values: ParamMeta["bitmask"] | undefined): string | null {
  if (!Array.isArray(values) || !Number.isInteger(value) || value < 0) {
    return null;
  }

  const labels: string[] = [];
  for (const option of values) {
    if (
      typeof option?.bit !== "number"
      || !Number.isInteger(option.bit)
      || option.bit < 0
      || option.bit > 31
    ) {
      continue;
    }

    const label = normalizeOptionalText(option.label);
    if (!label) {
      continue;
    }

    if ((value & (1 << option.bit)) !== 0) {
      labels.push(label);
    }
  }

  return labels.length > 0 ? labels.join(", ") : null;
}

function normalizeOptionalText(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
