import type { ParamMeta, ParamMetadataMap } from "../../param-metadata";
import type { ParamStore } from "../../params";
import type { StagedParameterEdit } from "../stores/params-staged-edits";
import {
  detectBooleanEnumOptions,
  type BooleanEnumDescriptor,
} from "./boolean-enum";
import {
  buildParameterItemModels,
  type ParameterItemModel,
} from "./parameter-item-model";

export type ParameterCatalogFilter = "standard" | "all" | "modified";

export type ParameterCatalogEnumOption = {
  code: number;
  label: string;
};

export type ParameterCatalogBitmaskOption = {
  bit: number;
  label: string;
  enabled: boolean;
};

export type ParameterCatalogItem = ParameterItemModel & {
  renderId: string;
  groupKey: string;
  groupLabel: string;
  userLevel: "Standard" | "Advanced" | "Unknown";
  isStandard: boolean;
  isStaged: boolean;
  stagedValue: number | null;
  hasFailure: boolean;
  editorKind: "number" | "enum" | "boolean" | "bitmask";
  enumOptions: ParameterCatalogEnumOption[];
  booleanOptions: BooleanEnumDescriptor | null;
  bitmaskOptions: ParameterCatalogBitmaskOption[];
};

export type ParameterCatalogGroup = {
  key: string;
  label: string;
  rows: ParameterCatalogItem[];
};

export type ParameterCatalogView = {
  filter: ParameterCatalogFilter;
  searchText: string;
  metadataAvailable: boolean;
  totalCount: number;
  matchingCount: number;
  visibleCount: number;
  stagedCount: number;
  hiddenStagedRows: ParameterCatalogItem[];
  groups: ParameterCatalogGroup[];
};

export type ParameterCatalogRetainedFailure = {
  message: string;
};

export function buildParameterCatalogView(args: {
  paramStore: ParamStore | null;
  metadata: ParamMetadataMap | null;
  stagedEdits: Record<string, StagedParameterEdit>;
  retainedFailures: Record<string, ParameterCatalogRetainedFailure>;
  filter: ParameterCatalogFilter;
  searchText: string;
}): ParameterCatalogView {
  const rows = buildParameterItemModels(args.paramStore, args.metadata).map((item, index) =>
    buildCatalogItem(item, index, args.metadata?.get(item.name), args.stagedEdits[item.name], args.retainedFailures[item.name]),
  );
  const normalizedSearch = args.searchText.trim().toLowerCase();

  const visibility = rows.map((row) => {
    const matchesFilter = matchesCatalogFilter(row, args.filter);
    const matchesSearch = matchesCatalogSearch(row, normalizedSearch);
    return {
      ...row,
      matchesFilter,
      matchesSearch,
      isVisible: matchesFilter && matchesSearch,
    };
  });

  const matchingCount = visibility.filter((row) => row.matchesFilter && row.matchesSearch).length;
  const visibleRows = visibility.filter((row) => row.isVisible);
  const hiddenStagedRows = visibility.filter((row) => (row.isStaged || row.hasFailure) && !row.isVisible);

  return {
    filter: args.filter,
    searchText: args.searchText,
    metadataAvailable: args.metadata !== null,
    totalCount: rows.length,
    matchingCount,
    visibleCount: visibleRows.length,
    stagedCount: rows.filter((row) => row.isStaged).length,
    hiddenStagedRows,
    groups: buildGroups(visibleRows),
  };
}

function buildCatalogItem(
  item: ParameterItemModel,
  index: number,
  meta: ParamMeta | undefined,
  stagedEdit: StagedParameterEdit | undefined,
  retainedFailure: ParameterCatalogRetainedFailure | undefined,
): ParameterCatalogItem {
  const enumOptions = normalizeEnumOptions(meta?.values);
  const booleanOptions = detectBooleanEnumOptions(enumOptions);
  const bitmaskOptions = normalizeBitmaskOptions(meta?.bitmask, item.value);
  const isStaged = Boolean(stagedEdit && stagedEdit.nextValue !== item.value);
  const stagedValue = isStaged ? stagedEdit?.nextValue ?? null : null;
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
    hasFailure: Boolean(retainedFailure),
    editorKind: booleanOptions ? "boolean" : enumOptions.length > 0 ? "enum" : bitmaskOptions.length > 0 ? "bitmask" : "number",
    enumOptions,
    booleanOptions,
    bitmaskOptions,
  };
}

function buildGroups(rows: ParameterCatalogItem[]): ParameterCatalogGroup[] {
  const groups = new Map<string, ParameterCatalogGroup>();

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

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      rows: group.rows.sort((left, right) => left.order - right.order || left.name.localeCompare(right.name)),
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function matchesCatalogFilter(row: ParameterCatalogItem, filter: ParameterCatalogFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "modified":
      return row.isStaged || row.hasFailure;
    case "standard":
    default:
      return row.isStandard;
  }
}

function matchesCatalogSearch(row: ParameterCatalogItem, normalizedSearch: string): boolean {
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
    row.units,
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

function normalizeEnumOptions(values: ParamMeta["values"] | undefined): ParameterCatalogEnumOption[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const normalized: ParameterCatalogEnumOption[] = [];
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
): ParameterCatalogBitmaskOption[] {
  if (!Array.isArray(values) || !Number.isInteger(currentValue) || currentValue < 0) {
    return [];
  }

  const normalized: ParameterCatalogBitmaskOption[] = [];
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

function normalizeOptionalText(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
