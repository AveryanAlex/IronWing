import { RSSI_SOURCE_DESCRIPTORS, rssiSourceDescriptor } from "../ardupilot/rssi";
export { resolveRssiSourceType } from "../ardupilot/rssi";
export type { ArduPilotRssiSource as RssiSourceType } from "../ardupilot/rssi";
export { clampParameterDraft as clampRssiDraftValue } from "../params/numeric-editing";
import type { StagedParameterValues } from "../params/parameter-values";
import type { ParamMeta } from "../../param-metadata";
import type { ParameterItemModel } from "../params/parameter-item-model";
import type { RcChannelSample } from "./rc-input-normalization";
import { clampNumber } from "./rate-curves";

export const RSSI_TYPE_PARAM_NAME = "RSSI_TYPE";

export type RssiStagedEdits = StagedParameterValues;

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

const FALLBACK_SOURCE_OPTIONS: readonly RssiSourceOption[] = Object.entries(RSSI_SOURCE_DESCRIPTORS).map(([code, source]) => ({ code: Number(code), label: source.label }));

export function requiredRssiSourceParameterNames(sourceType: number | null | undefined): string[] {
  return [...(rssiSourceDescriptor(sourceType)?.parameters ?? [])];
}
export function rssiCalibrationParameterNames(sourceType: number | null | undefined): { low: string; high: string } | null {
  return rssiSourceDescriptor(sourceType)?.calibration ?? null;
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
