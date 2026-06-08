import type { ParamMeta, ParamMetadataMap } from "../../param-metadata";
import { isNonNullParam, type NonNullParam, type ParamStore } from "../../params";

export type ParameterItemModel = {
  name: string;
  rawName: string;
  label: string;
  description: string | null;
  value: number;
  valueText: string;
  valueLabel: string | null;
  units: string | null;
  unitText?: string | null;
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
    .filter(isNonNullParam)
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
  param: NonNullParam,
  metadata: ParamMetadataMap | null,
): ParameterItemModel {
  const meta = metadata?.get(param.name);
  const increment = normalizeIncrement(meta?.increment);

  return {
    name: param.name,
    rawName: param.name,
    label: normalizeLabel(meta?.humanName, param.name),
    description: normalizeOptionalText(meta?.description),
    value: param.value,
    valueText: formatParamValue(param.value, increment),
    valueLabel: resolveValueLabel(param.value, meta),
    units: normalizeOptionalText(meta?.units) ?? normalizeOptionalText(meta?.unitText),
    unitText: normalizeOptionalText(meta?.unitText),
    rebootRequired: meta?.rebootRequired === true,
    order: param.index,
    increment,
    range: normalizeRange(meta?.range),
    readOnly: meta?.readOnly === true,
  };
}

export function formatParamValue(value: number, increment: number | null | undefined = null): string {
  if (!Number.isFinite(value)) {
    return "--";
  }

  const normalizedIncrement = normalizeIncrement(increment ?? undefined);
  const displayValue = normalizedIncrement ? roundToIncrement(value, normalizedIncrement) : cleanFloatArtifact(value);
  const decimals = normalizedIncrement ? decimalPlacesForIncrement(normalizedIncrement) : 6;

  return displayValue.toFixed(decimals).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

export function formatParamDisplayValue(
  value: number,
  meta: ParamMeta | undefined,
  fallbackUnits: string | null = null,
): string {
  const valueLabel = resolveValueLabel(value, meta);
  if (valueLabel) {
    return valueLabel;
  }

  const valueText = formatParamValue(value, meta?.increment);
  const units = normalizeOptionalText(meta?.units) ?? normalizeOptionalText(meta?.unitText) ?? fallbackUnits;
  return units ? `${valueText} ${units}` : valueText;
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

function roundToIncrement(value: number, increment: number): number {
  const rounded = Math.round(value / increment) * increment;
  const decimals = Math.max(0, Math.min(10, decimalPlacesForIncrement(increment) + 2));
  return Number(rounded.toFixed(decimals));
}

function decimalPlacesForIncrement(increment: number): number {
  const text = increment.toString().toLowerCase();
  if (text.includes("e-")) {
    const [, exponent] = text.split("e-");
    return Number.parseInt(exponent ?? "0", 10) || 0;
  }

  const decimal = text.split(".")[1];
  return decimal ? decimal.length : 0;
}

function cleanFloatArtifact(value: number): number {
  if (Number.isInteger(value)) {
    return value;
  }

  const rounded = Number(value.toFixed(6));
  return Math.abs(value - rounded) < 1e-6 ? rounded : value;
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
