import type { ParameterItemModel } from "../params/parameter-item-model";
import { clampNumber, roundToIncrement } from "./rate-curves";

export type RcCalibrationParamKey = "min" | "trim" | "max" | "deadZone" | "reversed";
export type RcCalibrationNumericParamKey = Exclude<RcCalibrationParamKey, "reversed">;
export type RcCalibrationMappedRole = "roll" | "pitch" | "throttle" | "yaw";

export type RcCalibrationValues = {
  min: number;
  trim: number;
  max: number;
  deadZone: number;
  reversed: boolean;
};

export type RcCalibrationChannel = {
  channel: number;
  roles: RcCalibrationMappedRole[];
  roleLabel: string | null;
  optionLabel: string;
};

export type RcCalibrationValidation = {
  valid: boolean;
  messages: string[];
};

export type RcCalibrationRange = {
  trimPct: number;
  deadZoneStartPct: number;
  deadZoneEndPct: number;
  livePct: number | null;
};

type ValueResolver = (name: string) => number | null;

const CALIBRATION_PARAM_SUFFIXES: Record<RcCalibrationParamKey, string> = {
  min: "MIN",
  trim: "TRIM",
  max: "MAX",
  deadZone: "DZ",
  reversed: "REVERSED",
};

const MAPPED_ROLE_PARAMS: ReadonlyArray<{ role: RcCalibrationMappedRole; name: string }> = [
  { role: "roll", name: "RCMAP_ROLL" },
  { role: "pitch", name: "RCMAP_PITCH" },
  { role: "throttle", name: "RCMAP_THROTTLE" },
  { role: "yaw", name: "RCMAP_YAW" },
];

const DEFAULT_CALIBRATION: RcCalibrationValues = {
  min: 1100,
  trim: 1500,
  max: 1900,
  deadZone: 0,
  reversed: false,
};

export function rcCalibrationParamName(channel: number, key: RcCalibrationParamKey): string {
  return `RC${channel}_${CALIBRATION_PARAM_SUFFIXES[key]}`;
}

export function discoverRcCalibrationChannels(
  itemIndex: ReadonlyMap<string, ParameterItemModel>,
  resolveValue: ValueResolver = (name) => itemIndex.get(name)?.value ?? null,
): RcCalibrationChannel[] {
  const mappedRoles = resolveMappedRoles(itemIndex, resolveValue);
  const channels: RcCalibrationChannel[] = [];

  for (let channel = 1; channel <= 16; channel += 1) {
    const hasCalibrationParam = Object.keys(CALIBRATION_PARAM_SUFFIXES).some((key) =>
      itemIndex.has(rcCalibrationParamName(channel, key as RcCalibrationParamKey)),
    );
    if (!hasCalibrationParam) {
      continue;
    }

    const roles = mappedRoles.get(channel) ?? [];
    const roleLabel = roles.length > 0 ? roles.map(formatRcCalibrationRole).join(" / ") : null;
    channels.push({
      channel,
      roles,
      roleLabel,
      optionLabel: roleLabel ? `CH${channel} · ${roleLabel}` : `CH${channel}`,
    });
  }

  return channels;
}

export function resolveRcCalibrationValues(
  channel: number,
  itemIndex: ReadonlyMap<string, ParameterItemModel>,
  resolveValue: ValueResolver = (name) => itemIndex.get(name)?.value ?? null,
): RcCalibrationValues {
  return {
    min: readCalibrationNumber(channel, "min", itemIndex, resolveValue),
    trim: readCalibrationNumber(channel, "trim", itemIndex, resolveValue),
    max: readCalibrationNumber(channel, "max", itemIndex, resolveValue),
    deadZone: readCalibrationNumber(channel, "deadZone", itemIndex, resolveValue),
    reversed: readCalibrationNumber(channel, "reversed", itemIndex, resolveValue) >= 0.5,
  };
}

export function validateRcCalibrationDraft(values: RcCalibrationValues): RcCalibrationValidation {
  const messages: string[] = [];
  const numericValues = [values.min, values.trim, values.max, values.deadZone];
  if (numericValues.some((value) => !Number.isFinite(value))) {
    messages.push("Enter finite PWM values before staging calibration changes.");
    return { valid: false, messages };
  }

  const hasValidOrdering = values.min < values.trim && values.trim < values.max;
  if (!hasValidOrdering) {
    messages.push("Keep calibration points ordered as MIN < TRIM < MAX.");
  }

  if (values.deadZone < 0) {
    messages.push("Deadzone must be zero or greater.");
  } else if (hasValidOrdering && values.deadZone > Math.min(values.trim - values.min, values.max - values.trim)) {
    messages.push("Deadzone cannot extend beyond either endpoint.");
  }

  return { valid: messages.length === 0, messages };
}

export function calculateRcCalibrationRange(values: RcCalibrationValues, livePwm: number | null = null): RcCalibrationRange | null {
  if (![values.min, values.trim, values.max, values.deadZone].every(Number.isFinite) || values.max <= values.min) {
    return null;
  }

  const toPct = (pwm: number) => Number(clampNumber(((pwm - values.min) / (values.max - values.min)) * 100, 0, 100).toFixed(6));
  return {
    trimPct: toPct(values.trim),
    deadZoneStartPct: toPct(values.trim - values.deadZone),
    deadZoneEndPct: toPct(values.trim + values.deadZone),
    livePct: typeof livePwm === "number" && Number.isFinite(livePwm) ? toPct(livePwm) : null,
  };
}

export function clampRcCalibrationDraftValue(item: ParameterItemModel, value: number): number {
  if (!Number.isFinite(value)) {
    return item.value;
  }

  const min = item.range?.min ?? Number.NEGATIVE_INFINITY;
  const max = item.range?.max ?? Number.POSITIVE_INFINITY;
  const clamped = Math.min(max, Math.max(min, value));
  return Math.min(max, Math.max(min, roundToIncrement(clamped, item.increment)));
}

function resolveMappedRoles(
  itemIndex: ReadonlyMap<string, ParameterItemModel>,
  resolveValue: ValueResolver,
): Map<number, RcCalibrationMappedRole[]> {
  const roles = new Map<number, RcCalibrationMappedRole[]>();
  for (const mapping of MAPPED_ROLE_PARAMS) {
    const value = resolveValue(mapping.name) ?? itemIndex.get(mapping.name)?.value;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      continue;
    }

    const channel = Math.round(value);
    if (channel < 1 || channel > 16) {
      continue;
    }

    roles.set(channel, [...(roles.get(channel) ?? []), mapping.role]);
  }

  return roles;
}

function formatRcCalibrationRole(role: RcCalibrationMappedRole): string {
  return role[0].toUpperCase() + role.slice(1);
}

function readCalibrationNumber(
  channel: number,
  key: RcCalibrationParamKey,
  itemIndex: ReadonlyMap<string, ParameterItemModel>,
  resolveValue: ValueResolver,
): number {
  const name = rcCalibrationParamName(channel, key);
  const value = resolveValue(name) ?? itemIndex.get(name)?.value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return key === "reversed" ? 0 : DEFAULT_CALIBRATION[key];
}
