import type { ParamMeta } from "../../param-metadata";
import type { ParameterItemModel } from "../params/parameter-item-model";
import type { RcChannelSample } from "./rc-input-normalization";
import { clampNumber, roundToIncrement } from "./rate-curves";

export const RSSI_TYPE_PARAM_NAME = "RSSI_TYPE";

export type RssiSourceType = 0 | 1 | 2 | 3 | 4 | 5;
export type RssiStagedEdits = Record<string, { nextValue: number } | undefined>;

export type RssiSourceOption = {
  code: number;
  label: string;
};

export type RssiChannelPwmSample = {
  channel: number;
  pwm: number;
  stale: boolean;
};

export type RssiScalePreview = {
  percent: number | null;
  equalRange: boolean;
  inverted: boolean;
  clipped: boolean;
};

const FALLBACK_SOURCE_OPTIONS: readonly RssiSourceOption[] = [
  { code: 0, label: "Disabled" },
  { code: 1, label: "Analog pin" },
  { code: 2, label: "RC channel PWM value" },
  { code: 3, label: "Receiver protocol" },
  { code: 4, label: "PWM input pin" },
  { code: 5, label: "Telemetry radio RSSI" },
];

const SOURCE_SETTING_NAMES: Record<RssiSourceType, readonly string[]> = {
  0: [],
  1: ["RSSI_ANA_PIN", "RSSI_PIN_LOW", "RSSI_PIN_HIGH"],
  2: ["RSSI_CHANNEL", "RSSI_CHAN_LOW", "RSSI_CHAN_HIGH"],
  3: [],
  4: ["RSSI_ANA_PIN", "RSSI_CHAN_LOW", "RSSI_CHAN_HIGH"],
  5: [],
};

export function resolveRssiSourceType(value: number | null | undefined): RssiSourceType | null {
  if (!Number.isInteger(value) || value == null || value < 0 || value > 5) {
    return null;
  }

  return value as RssiSourceType;
}

export function requiredRssiSourceParameterNames(sourceType: number | null | undefined): string[] {
  const resolvedType = resolveRssiSourceType(sourceType);
  return resolvedType == null ? [] : [...SOURCE_SETTING_NAMES[resolvedType]];
}

export function rssiCalibrationParameterNames(sourceType: number | null | undefined): { low: string; high: string } | null {
  switch (resolveRssiSourceType(sourceType)) {
    case 1:
      return { low: "RSSI_PIN_LOW", high: "RSSI_PIN_HIGH" };
    case 2:
    case 4:
      return { low: "RSSI_CHAN_LOW", high: "RSSI_CHAN_HIGH" };
    default:
      return null;
  }
}

export function resolveRssiSourceOptions(
  metadataValues: ParamMeta["values"] | null | undefined,
  selectedValue: number | null | undefined = null,
): RssiSourceOption[] {
  const options = new Map(FALLBACK_SOURCE_OPTIONS.map((option) => [option.code, option]));

  for (const option of metadataValues ?? []) {
    const label = typeof option?.label === "string" ? option.label.trim() : "";
    if (typeof option?.code !== "number" || !Number.isFinite(option.code) || label.length === 0) {
      continue;
    }

    options.set(option.code, { code: option.code, label });
  }

  if (typeof selectedValue === "number" && Number.isFinite(selectedValue) && !options.has(selectedValue)) {
    options.set(selectedValue, { code: selectedValue, label: `Unknown source ${selectedValue}` });
  }

  return [...options.values()].sort((left, right) => left.code - right.code || left.label.localeCompare(right.label));
}

export function scaleRssiPwmToPercent(pwm: number, low: number, high: number): RssiScalePreview {
  const inverted = Number.isFinite(low) && Number.isFinite(high) && low > high;
  if (![pwm, low, high].every(Number.isFinite)) {
    return { percent: null, equalRange: false, inverted, clipped: false };
  }

  if (low === high) {
    return { percent: null, equalRange: true, inverted: false, clipped: false };
  }

  const rawPercent = ((pwm - low) / (high - low)) * 100;
  const percent = clampNumber(rawPercent, 0, 100);
  return { percent, equalRange: false, inverted, clipped: percent !== rawPercent };
}

export function resolveRssiChannelPwm(input: {
  channelItem?: ParameterItemModel | null;
  channelValue?: number | null;
  stagedEdits?: RssiStagedEdits;
  channels: readonly RcChannelSample[];
}): RssiChannelPwmSample | null {
  const channelValue = input.channelValue ?? input.stagedEdits?.RSSI_CHANNEL?.nextValue ?? input.channelItem?.value;
  if (!Number.isInteger(channelValue) || channelValue == null || channelValue < 1 || channelValue > 16) {
    return null;
  }

  const sample = input.channels.find((entry) => entry.channel === channelValue && Number.isFinite(entry.pwm));
  return sample ? { channel: channelValue, pwm: sample.pwm, stale: sample.stale === true } : null;
}

export function clampRssiDraftValue(item: ParameterItemModel, value: number): number {
  if (!Number.isFinite(value)) {
    return item.value;
  }

  const min = item.range?.min ?? Number.NEGATIVE_INFINITY;
  const max = item.range?.max ?? Number.POSITIVE_INFINITY;
  return clampNumber(roundToIncrement(clampNumber(value, min, max), item.increment), min, max);
}
