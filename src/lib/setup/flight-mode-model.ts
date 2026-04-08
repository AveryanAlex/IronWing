import type { ParamStore } from "../../params";
import type { FlightModeEntry } from "../../telemetry";
import {
  isCopterVehicleType,
  isPlaneVehicleType,
  isRoverVehicleType,
} from "./vehicle-profile";

export const MODE_SLOT_COUNT = 6;
export const FLIGHT_MODE_PARAM_NAMES = Array.from(
  { length: MODE_SLOT_COUNT },
  (_, index) => `FLTMODE${index + 1}`,
);
export const FLIGHT_MODE_CHANNEL_PARAM = "FLTMODE_CH";

export const MODE_SLOT_PWM_RANGES: { label: string; min: number; max: number }[] = [
  { label: "≤ 1230", min: 0, max: 1230 },
  { label: "1231–1360", min: 1231, max: 1360 },
  { label: "1361–1490", min: 1361, max: 1490 },
  { label: "1491–1620", min: 1491, max: 1620 },
  { label: "1621–1749", min: 1621, max: 1749 },
  { label: "≥ 1750", min: 1750, max: 65535 },
];

export type FlightModePreset = "copter" | "plane" | "rover";
export type FlightModeAvailabilityState = "live" | "stale" | "unavailable";

export type FlightModeOption = {
  customMode: number;
  name: string;
};

export type FlightModePresetPreviewRow = {
  key: string;
  label: string;
  paramName: string;
  detail: string;
  willChange: boolean;
};

export type FlightModeSlotModel = {
  slot: number;
  paramName: string;
  pwmLabel: string;
  currentValue: number | null;
  effectiveValue: number | null;
  currentName: string;
  effectiveName: string;
  unresolved: boolean;
  active: boolean;
};

export type FlightModeBitmaskSlot = {
  key: string;
  slot: number;
  label: string;
  checked: boolean;
};

export type FlightModeModelInput = {
  vehicleType: string | null;
  paramStore: ParamStore | null;
  stagedEdits: Record<string, { nextValue: number } | undefined>;
  availableModes: unknown;
  previousAvailableModes?: unknown;
  currentModeName?: string | null;
  rcChannels?: number[] | null;
  liveConnected: boolean;
  sameScope: boolean;
  telemetrySettled: boolean;
};

export type FlightModeModel = {
  preset: FlightModePreset | null;
  availabilityState: FlightModeAvailabilityState;
  availabilityText: string;
  availabilityDetail: string;
  options: FlightModeOption[];
  slots: FlightModeSlotModel[];
  activeSlotIndex: number | null;
  unresolvedSlotCount: number;
  malformedModeCount: number;
  missingParamNames: string[];
  recoveryReasons: string[];
  simpleModeSupported: boolean;
  simpleModeSlots: FlightModeBitmaskSlot[];
  superSimpleSlots: FlightModeBitmaskSlot[];
  hasPendingChanges: boolean;
  canStagePreset: boolean;
  canConfirm: boolean;
  currentModeName: string | null;
};

export const RECOMMENDED_FLIGHT_MODE_PRESETS: Record<
  FlightModePreset,
  { modes: number[]; labels: string[] }
> = {
  copter: {
    modes: [0, 2, 5, 6, 9, 3],
    labels: ["Stabilize", "AltHold", "Loiter", "RTL", "Land", "Auto"],
  },
  plane: {
    modes: [0, 5, 6, 11, 12, 10],
    labels: ["Manual", "FBW-A", "FBW-B", "RTL", "Loiter", "Auto"],
  },
  rover: {
    modes: [0, 4, 11, 5, 10, 15],
    labels: ["Manual", "Hold", "RTL", "Loiter", "Auto", "Guided"],
  },
};

function hasParam(paramStore: ParamStore | null, name: string): boolean {
  return paramStore?.params[name] !== undefined;
}

function currentValue(paramStore: ParamStore | null, name: string): number | null {
  return paramStore?.params[name]?.value ?? null;
}

function stagedOrCurrentValue(
  paramStore: ParamStore | null,
  stagedEdits: Record<string, { nextValue: number } | undefined>,
  name: string,
): number | null {
  const stagedValue = stagedEdits[name]?.nextValue;
  if (typeof stagedValue === "number" && Number.isFinite(stagedValue)) {
    return stagedValue;
  }

  return currentValue(paramStore, name);
}

function hasPendingChange(
  paramStore: ParamStore | null,
  stagedEdits: Record<string, { nextValue: number } | undefined>,
  name: string,
): boolean {
  const stagedValue = stagedEdits[name]?.nextValue;
  const storedValue = currentValue(paramStore, name);

  return typeof stagedValue === "number"
    && Number.isFinite(stagedValue)
    && stagedValue !== storedValue;
}

function normalizeModeName(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeCustomMode(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

export function normalizeAvailableModes(input: unknown): {
  options: FlightModeOption[];
  malformedCount: number;
} {
  if (!Array.isArray(input)) {
    return {
      options: [],
      malformedCount: input == null ? 0 : 1,
    };
  }

  const options: FlightModeOption[] = [];
  const seenModes = new Set<number>();
  let malformedCount = 0;

  for (const entry of input) {
    const mode = normalizeCustomMode((entry as { custom_mode?: unknown })?.custom_mode);
    const name = normalizeModeName((entry as { name?: unknown })?.name);

    if (mode === null || name === null || seenModes.has(mode)) {
      malformedCount += 1;
      continue;
    }

    seenModes.add(mode);
    options.push({ customMode: mode, name });
  }

  options.sort((left, right) => left.name.localeCompare(right.name) || left.customMode - right.customMode);

  return { options, malformedCount };
}

export function vehicleTypeToFlightModePreset(vehicleType: string | null): FlightModePreset | null {
  if (isCopterVehicleType(vehicleType)) {
    return "copter";
  }

  if (isPlaneVehicleType(vehicleType)) {
    return "plane";
  }

  if (isRoverVehicleType(vehicleType)) {
    return "rover";
  }

  return null;
}

export function modeNameForValue(
  value: number | null,
  options: FlightModeOption[],
  fallback?: string,
): string {
  if (value === null) {
    return "Unavailable";
  }

  const option = options.find((item) => item.customMode === value);
  return option?.name ?? fallback ?? `Mode ${value}`;
}

export function getActiveFlightModeSlotIndex(
  rcChannels: number[] | null | undefined,
  flightModeChannel: number | null,
): number | null {
  if (!Array.isArray(rcChannels) || flightModeChannel === null || !Number.isInteger(flightModeChannel) || flightModeChannel < 1) {
    return null;
  }

  const resolvedChannel = flightModeChannel as number;
  const pwm = rcChannels[resolvedChannel - 1];
  if (typeof pwm !== "number" || !Number.isFinite(pwm) || pwm === 0 || pwm === 65535) {
    return null;
  }

  for (let index = 0; index < MODE_SLOT_PWM_RANGES.length; index += 1) {
    const range = MODE_SLOT_PWM_RANGES[index];
    if (pwm >= range.min && pwm <= range.max) {
      return index;
    }
  }

  return null;
}

function buildBitmaskSlots(value: number | null): FlightModeBitmaskSlot[] {
  const resolved = Number.isInteger(value) && value !== null && value >= 0 ? value : 0;

  return FLIGHT_MODE_PARAM_NAMES.map((_, index) => ({
    key: String(index),
    slot: index + 1,
    label: `Slot ${index + 1}`,
    checked: (resolved & (1 << index)) !== 0,
  }));
}

export function toggleFlightModeBitmaskValue(currentValue: number | null, bit: number): number {
  const resolved = Number.isInteger(currentValue) && currentValue !== null && currentValue >= 0 ? currentValue : 0;
  return resolved ^ (1 << bit);
}

export function buildFlightModePresetPreviewRows(
  preset: FlightModePreset,
  paramStore: ParamStore | null,
  stagedEdits: Record<string, { nextValue: number } | undefined>,
  options: FlightModeOption[],
): FlightModePresetPreviewRow[] {
  const recommended = RECOMMENDED_FLIGHT_MODE_PRESETS[preset];

  return FLIGHT_MODE_PARAM_NAMES.map((paramName, index) => {
    const nextValue = recommended.modes[index] ?? null;
    const current = stagedOrCurrentValue(paramStore, stagedEdits, paramName);
    const proposedName = modeNameForValue(nextValue, options, recommended.labels[index]);
    const currentName = current === null ? null : modeNameForValue(current, options);
    const willChange = current !== nextValue;

    return {
      key: paramName,
      label: `Slot ${index + 1}`,
      paramName,
      detail: willChange && currentName ? `${currentName} → ${proposedName}` : proposedName,
      willChange,
    } satisfies FlightModePresetPreviewRow;
  });
}

export function buildFlightModeModel(input: FlightModeModelInput): FlightModeModel {
  const preset = vehicleTypeToFlightModePreset(input.vehicleType);
  const normalizedCurrentModes = normalizeAvailableModes(input.availableModes);
  const normalizedPreviousModes = normalizeAvailableModes(input.previousAvailableModes);
  const flightModeChannel = stagedOrCurrentValue(input.paramStore, input.stagedEdits, FLIGHT_MODE_CHANNEL_PARAM);
  const activeSlotIndex = getActiveFlightModeSlotIndex(input.rcChannels, flightModeChannel);

  let availabilityState: FlightModeAvailabilityState = "unavailable";
  let options: FlightModeOption[] = [];
  let availabilityText = "Mode list unavailable";
  let availabilityDetail = "Available flight modes have not been confirmed for this scope yet, so slot editing stays visible but fail-closed.";

  if (input.liveConnected && normalizedCurrentModes.options.length > 0) {
    availabilityState = "live";
    options = normalizedCurrentModes.options;
    availabilityText = normalizedCurrentModes.malformedCount > 0 ? "Live, partial" : "Live";
    availabilityDetail = normalizedCurrentModes.malformedCount > 0
      ? "Malformed available-mode rows were dropped. Valid mode names stay visible, but unsupported values fall back to raw numbers."
      : "Available flight modes are live for this scope and can be staged through the shared review tray.";
  } else if (
    input.sameScope
    && normalizedPreviousModes.options.length > 0
    && (!input.liveConnected || !input.telemetrySettled || normalizedCurrentModes.options.length === 0)
  ) {
    availabilityState = "stale";
    options = normalizedPreviousModes.options;
    availabilityText = "Stale, same scope";
    availabilityDetail = "Last same-scope mode availability is retained for visibility only while the link or mode list refresh settles. New staging stays blocked until the live list returns.";
  }

  const slots = FLIGHT_MODE_PARAM_NAMES.map((paramName, index) => {
    const current = currentValue(input.paramStore, paramName);
    const effective = stagedOrCurrentValue(input.paramStore, input.stagedEdits, paramName);
    const recommendedFallback = preset
      ? RECOMMENDED_FLIGHT_MODE_PRESETS[preset].labels[index]
      : undefined;
    const effectiveResolved = effective !== null && !options.some((option) => option.customMode === effective);

    return {
      slot: index + 1,
      paramName,
      pwmLabel: MODE_SLOT_PWM_RANGES[index]?.label ?? "--",
      currentValue: current,
      effectiveValue: effective,
      currentName: modeNameForValue(current, options),
      effectiveName: modeNameForValue(effective, options, effectiveResolved ? undefined : recommendedFallback),
      unresolved: effective !== null && !options.some((option) => option.customMode === effective),
      active: activeSlotIndex === index,
    } satisfies FlightModeSlotModel;
  });

  const missingParamNames = [
    ...FLIGHT_MODE_PARAM_NAMES.filter((name) => !hasParam(input.paramStore, name)),
    ...(!hasParam(input.paramStore, FLIGHT_MODE_CHANNEL_PARAM) ? [FLIGHT_MODE_CHANNEL_PARAM] : []),
  ];

  const simpleModeSupported = preset === "copter";
  const simpleValue = simpleModeSupported
    ? stagedOrCurrentValue(input.paramStore, input.stagedEdits, "SIMPLE")
    : null;
  const superSimpleValue = simpleModeSupported
    ? stagedOrCurrentValue(input.paramStore, input.stagedEdits, "SUPER_SIMPLE")
    : null;
  const simpleModeSlots = simpleModeSupported && hasParam(input.paramStore, "SIMPLE")
    ? buildBitmaskSlots(simpleValue)
    : [];
  const superSimpleSlots = simpleModeSupported && hasParam(input.paramStore, "SUPER_SIMPLE")
    ? buildBitmaskSlots(superSimpleValue)
    : [];

  const recoveryReasons: string[] = [];
  if (missingParamNames.length > 0) {
    recoveryReasons.push(`Missing flight-mode rows: ${missingParamNames.join(", ")}.`);
  }
  if (availabilityState === "unavailable") {
    recoveryReasons.push("Available flight modes are missing or stale, so slot selectors stay read-only and preset staging is blocked.");
  }
  if (normalizedCurrentModes.malformedCount > 0) {
    recoveryReasons.push(`Dropped ${normalizedCurrentModes.malformedCount} malformed available-mode row${normalizedCurrentModes.malformedCount === 1 ? "" : "s"}. Unsupported slot values fall back to raw mode numbers.`);
  }
  if (simpleModeSupported && !hasParam(input.paramStore, "SIMPLE")) {
    recoveryReasons.push("SIMPLE is unavailable for this copter scope, so Simple-mode toggles stay hidden.");
  }
  if (simpleModeSupported && !hasParam(input.paramStore, "SUPER_SIMPLE")) {
    recoveryReasons.push("SUPER_SIMPLE is unavailable for this copter scope, so Super Simple toggles stay hidden.");
  }
  if (slots.some((slot) => slot.unresolved) && options.length > 0) {
    recoveryReasons.push("One or more configured slot values are not present in the current available-mode list.");
  }

  const relevantPendingNames = new Set<string>([
    ...FLIGHT_MODE_PARAM_NAMES,
    FLIGHT_MODE_CHANNEL_PARAM,
    ...(simpleModeSupported ? ["SIMPLE", "SUPER_SIMPLE"] : []),
  ]);
  const hasPendingChanges = [...relevantPendingNames].some((name) => hasPendingChange(input.paramStore, input.stagedEdits, name));
  const unresolvedSlotCount = slots.filter((slot) => slot.unresolved).length;
  const canStagePreset = preset !== null
    && availabilityState === "live"
    && missingParamNames.filter((name) => name !== FLIGHT_MODE_CHANNEL_PARAM).length === 0;
  const canConfirm = availabilityState === "live"
    && missingParamNames.length === 0
    && unresolvedSlotCount === 0
    && !hasPendingChanges;

  return {
    preset,
    availabilityState,
    availabilityText,
    availabilityDetail,
    options,
    slots,
    activeSlotIndex,
    unresolvedSlotCount,
    malformedModeCount: normalizedCurrentModes.malformedCount,
    missingParamNames,
    recoveryReasons,
    simpleModeSupported,
    simpleModeSlots,
    superSimpleSlots,
    hasPendingChanges,
    canStagePreset,
    canConfirm,
    currentModeName: normalizeModeName(input.currentModeName),
  } satisfies FlightModeModel;
}
