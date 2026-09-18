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
  modifiedCount: number;
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

type PreparedParameterCatalogItem = Omit<
  ParameterCatalogItem,
  "isStaged" | "stagedValue" | "hasFailure"
>;

type PreparedParameterCatalogRow = {
  item: PreparedParameterCatalogItem;
  searchKey: string;
};

type ParameterCatalogSnapshotRow = {
  item: ParameterCatalogItem;
  searchKey: string;
};

export type PreparedParameterCatalog = {
  metadataAvailable: boolean;
  rows: PreparedParameterCatalogRow[];
};

export type ParameterCatalogSnapshot = {
  metadataAvailable: boolean;
  rows: ParameterCatalogSnapshotRow[];
  stagedCount: number;
};

export function prepareParameterCatalog(
  paramStore: ParamStore | null,
  metadata: ParamMetadataMap | null,
): PreparedParameterCatalog {
  const rows = buildParameterItemModels(paramStore, metadata).map((item, index) => {
    const catalogItem = buildPreparedCatalogItem(item, index, metadata?.get(item.name));
    return {
      item: catalogItem,
      searchKey: buildCatalogSearchKey(catalogItem),
    };
  });

  return {
    metadataAvailable: metadata !== null,
    rows,
  };
}

export function buildParameterCatalogSnapshot(args: {
  catalog: PreparedParameterCatalog;
  stagedEdits: Record<string, StagedParameterEdit>;
  retainedFailures: Record<string, ParameterCatalogRetainedFailure>;
}): ParameterCatalogSnapshot {
  let stagedCount = 0;
  const rows = args.catalog.rows.map(({ item, searchKey }) => {
    const stagedEdit = args.stagedEdits[item.name];
    const isStaged = Boolean(stagedEdit && stagedEdit.nextValue !== item.value);
    if (isStaged) {
      stagedCount += 1;
    }

    return {
      searchKey,
      item: {
        ...item,
        isStaged,
        stagedValue: isStaged ? stagedEdit?.nextValue ?? null : null,
        hasFailure: Boolean(args.retainedFailures[item.name]),
      },
    };
  });

  return {
    metadataAvailable: args.catalog.metadataAvailable,
    rows,
    stagedCount,
  };
}

export function buildParameterCatalogView(args: {
  catalog: ParameterCatalogSnapshot;
  filter: ParameterCatalogFilter;
  searchText: string;
}): ParameterCatalogView {
  const normalizedSearch = args.searchText.trim().toLowerCase();
  const visibleRows: ParameterCatalogItem[] = [];
  const hiddenStagedRows: ParameterCatalogItem[] = [];

  for (const row of args.catalog.rows) {
    const matchesFilter = matchesCatalogFilter(row.item, args.filter);
    const matchesSearch = normalizedSearch.length === 0 || row.searchKey.includes(normalizedSearch);
    if (matchesFilter && matchesSearch) {
      visibleRows.push(row.item);
    } else if (row.item.isStaged || row.item.hasFailure) {
      hiddenStagedRows.push(row.item);
    }
  }

  return {
    filter: args.filter,
    searchText: args.searchText,
    metadataAvailable: args.catalog.metadataAvailable,
    totalCount: args.catalog.rows.length,
    matchingCount: visibleRows.length,
    visibleCount: visibleRows.length,
    stagedCount: args.catalog.stagedCount,
    hiddenStagedRows,
    groups: buildGroups(visibleRows),
  };
}

function buildPreparedCatalogItem(
  item: ParameterItemModel,
  index: number,
  meta: ParamMeta | undefined,
): PreparedParameterCatalogItem {
  const enumOptions = normalizeEnumOptions(meta?.values);
  const booleanOptions = detectBooleanEnumOptions(enumOptions);
  const bitmaskOptions = normalizeBitmaskOptions(meta?.bitmask, item.value);
  const prefix = resolveGroupPrefix(item.rawName);
  const userLevel = resolveUserLevel(meta);

  return {
    ...item,
    renderId: `${item.rawName}#${index}`,
    groupKey: prefix,
    groupLabel: prefix,
    userLevel,
    isStandard: userLevel !== "Advanced",
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
      if (row.isStaged || row.hasFailure) {
        existing.modifiedCount += 1;
      }
      continue;
    }

    groups.set(row.groupKey, {
      key: row.groupKey,
      label: row.groupLabel,
      rows: [row],
      modifiedCount: row.isStaged || row.hasFailure ? 1 : 0,
    });
  }

  return Array.from(groups.values()).sort((left, right) => left.label.localeCompare(right.label));
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

function buildCatalogSearchKey(row: PreparedParameterCatalogItem): string {
  return [
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
