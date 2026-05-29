import type { ParameterItemModel } from "../params/parameter-item-model";
import { clampNumber } from "./rate-curves";

export type RcInputRole = "roll" | "pitch" | "throttle" | "yaw" | "steering";
export type RcNormalizationMode = "norm_input" | "norm_input_dz" | "control_in";

export type RcChannelSample = {
  channel: number;
  pwm: number;
  stale?: boolean;
};

export type RcStickMarker = {
  stick: number;
  pwm: number;
  channel: number;
  stale: boolean;
};

type ValueResolver = (name: string) => number | null;

const ROLE_TO_RCMAP: Record<RcInputRole, string> = {
  roll: "RCMAP_ROLL",
  pitch: "RCMAP_PITCH",
  throttle: "RCMAP_THROTTLE",
  yaw: "RCMAP_YAW",
  steering: "RCMAP_ROLL",
};

type RcCalibration = {
  min: number;
  trim: number;
  max: number;
  deadZone: number;
  reversed: boolean;
};

export function resolveRcMappedChannel(
  role: RcInputRole,
  itemIndex: ReadonlyMap<string, ParameterItemModel>,
  resolveValue: ValueResolver = (name) => itemIndex.get(name)?.value ?? null,
): number | null {
  const name = ROLE_TO_RCMAP[role];
  const value = resolveValue(name);
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const channel = Math.round(value);
  return channel >= 1 && channel <= 18 ? channel : null;
}

export function resolveRcStickMarker(input: {
  role: RcInputRole;
  mode: RcNormalizationMode;
  channels: readonly RcChannelSample[];
  itemIndex: ReadonlyMap<string, ParameterItemModel>;
  resolveValue?: ValueResolver;
}): RcStickMarker | null {
  const resolveValue = input.resolveValue ?? ((name: string) => input.itemIndex.get(name)?.value ?? null);
  const channel = resolveRcMappedChannel(input.role, input.itemIndex, resolveValue);
  if (channel == null) {
    return null;
  }

  const sample = input.channels.find((entry) => entry.channel === channel);
  if (!sample || !Number.isFinite(sample.pwm)) {
    return null;
  }

  return {
    channel,
    pwm: sample.pwm,
    stale: sample.stale === true,
    stick: normalizeRcPwm(sample.pwm, input.mode, readRcCalibration(channel, input.itemIndex, resolveValue)),
  };
}

export function normalizeRcPwm(
  pwm: number,
  mode: RcNormalizationMode,
  calibration: Partial<RcCalibration> = {},
): number {
  const resolved = normalizeCalibration(calibration);
  switch (mode) {
    case "norm_input":
      return normalizeAroundTrim(pwm, resolved, 0);
    case "control_in":
    case "norm_input_dz":
      return normalizeAroundTrim(pwm, resolved, resolved.deadZone);
    default:
      return 0;
  }
}

function readRcCalibration(
  channel: number,
  itemIndex: ReadonlyMap<string, ParameterItemModel>,
  resolveValue: ValueResolver,
): RcCalibration {
  const prefix = `RC${channel}_`;
  const read = (suffix: string, fallback: number) => {
    const value = resolveValue(`${prefix}${suffix}`) ?? itemIndex.get(`${prefix}${suffix}`)?.value;
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  };

  return normalizeCalibration({
    min: read("MIN", 1100),
    trim: read("TRIM", 1500),
    max: read("MAX", 1900),
    deadZone: read("DZ", 0),
    reversed: read("REVERSED", 0) >= 0.5,
  });
}

function normalizeCalibration(calibration: Partial<RcCalibration>): RcCalibration {
  const min = clampNumber(calibration.min ?? 1100, 500, 3000);
  const max = clampNumber(calibration.max ?? 1900, 500, 3000);
  const low = Math.min(min, max - 1);
  const high = Math.max(max, low + 1);
  const trim = clampNumber(calibration.trim ?? 1500, low + 1, high - 1);
  const deadZone = clampNumber(calibration.deadZone ?? 0, 0, Math.min(500, trim - low, high - trim));

  return {
    min: low,
    trim,
    max: high,
    deadZone,
    reversed: calibration.reversed === true,
  };
}

function normalizeAroundTrim(pwm: number, calibration: RcCalibration, deadZone: number): number {
  if (!Number.isFinite(pwm)) {
    return 0;
  }

  const reverseMultiplier = calibration.reversed ? -1 : 1;
  const dzMin = calibration.trim - deadZone;
  const dzMax = calibration.trim + deadZone;

  if (pwm >= dzMin && pwm <= dzMax) {
    return 0;
  }

  if (pwm < dzMin) {
    const divisor = dzMin - calibration.min;
    return divisor > 0 ? clampNumber(reverseMultiplier * ((pwm - dzMin) / divisor), -1, 1) : 0;
  }

  const divisor = calibration.max - dzMax;
  return divisor > 0 ? clampNumber(reverseMultiplier * ((pwm - dzMax) / divisor), -1, 1) : 0;
}
