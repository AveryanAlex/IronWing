import type { ParamMeta, ParamMetadataMap } from "../../param-metadata";
import type { Param, ParamStore } from "../../params";

export type ParameterItemModel = {
  name: string;
  rawName: string;
  label: string;
  description: string | null;
  value: number;
  valueText: string;
  valueLabel: string | null;
  units: string | null;
  rebootRequired: boolean;
  order: number;
  increment: number | null;
  range: { min: number; max: number } | null;
  readOnly: boolean;
};

export function buildParameterItemModels(
  paramStore: ParamStore | null,
  metadata: ParamMetadataMap | null,
): ParameterItemModel[] {
  if (!paramStore) {
    return [];
  }

  return Object.values(paramStore.params ?? {})
    .sort((left, right) => left.index - right.index || left.name.localeCompare(right.name))
    .map((param) => buildParameterItemModel(param, metadata));
}

export function buildParameterItemIndex(
  paramStore: ParamStore | null,
  metadata: ParamMetadataMap | null,
): Map<string, ParameterItemModel> {
  return new Map(buildParameterItemModels(paramStore, metadata).map((item) => [item.name, item]));
}

export function buildParameterItemModel(
  param: Param,
  metadata: ParamMetadataMap | null,
): ParameterItemModel {
  const meta = metadata?.get(param.name);

  return {
    name: param.name,
    rawName: param.name,
    label: normalizeLabel(meta?.humanName, param.name),
    description: normalizeOptionalText(meta?.description),
    value: param.value,
    valueText: formatParamValue(param.value),
    valueLabel: resolveValueLabel(param.value, meta),
    units: normalizeOptionalText(meta?.unitText) ?? normalizeOptionalText(meta?.units),
    rebootRequired: meta?.rebootRequired === true,
    order: param.index,
    increment: normalizeIncrement(meta?.increment),
    range: normalizeRange(meta?.range),
    readOnly: meta?.readOnly === true,
  };
}

export function formatParamValue(value: number): string {
  if (!Number.isFinite(value)) {
    return "--";
  }

  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(3).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function normalizeLabel(value: string | undefined, fallback: string): string {
  return normalizeOptionalText(value) ?? fallback;
}

function normalizeOptionalText(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeIncrement(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function normalizeRange(range: ParamMeta["range"] | undefined): { min: number; max: number } | null {
  if (
    typeof range?.min !== "number"
    || !Number.isFinite(range.min)
    || typeof range?.max !== "number"
    || !Number.isFinite(range.max)
    || range.min > range.max
  ) {
    return null;
  }

  return { min: range.min, max: range.max };
}

function resolveValueLabel(value: number, meta: ParamMeta | undefined): string | null {
  const enumLabel = resolveEnumLabel(value, meta?.values);
  if (enumLabel) {
    return enumLabel;
  }

  return resolveBitmaskLabel(value, meta?.bitmask);
}

function resolveEnumLabel(
  value: number,
  options: ParamMeta["values"] | undefined,
): string | null {
  if (!Array.isArray(options)) {
    return null;
  }

  for (const option of options) {
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

function resolveBitmaskLabel(
  value: number,
  options: ParamMeta["bitmask"] | undefined,
): string | null {
  if (!Array.isArray(options) || !Number.isInteger(value) || value < 0) {
    return null;
  }

  const labels: string[] = [];
  for (const option of options) {
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
