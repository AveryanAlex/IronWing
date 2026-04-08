import type { ParamMetadataMap } from "../../param-metadata";
import type { ParamStore } from "../../params";
import {
  getVehicleSlug,
  isCopterVehicleType,
  isPlaneVehicleType,
  isRoverVehicleType,
} from "./vehicle-profile";

export type SafetyVehicleFamily = "copter" | "plane" | "rover" | "unknown";

export type SafetyDefaultsEntry = {
  paramName: string;
  value: number;
  label: string;
};

export type SafetyDefaultsPreviewEntry = {
  paramName: string;
  label: string;
  newValue: number;
  currentValue: number | null;
  willChange: boolean;
};

export type SafetyModelInput = {
  vehicleType: string | null;
  paramStore: ParamStore | null;
  metadata: ParamMetadataMap | null;
  stagedEdits: Record<string, { nextValue: number } | undefined>;
};

export type FailsafeSectionModel = {
  family: SafetyVehicleFamily;
  defaultsPreview: SafetyDefaultsPreviewEntry[];
  recoveryReasons: string[];
  warningTexts: string[];
  hasPendingChanges: boolean;
  canConfirm: boolean;
  vehicleSlug: ReturnType<typeof getVehicleSlug>;
};

export type RtlReturnModel = {
  family: SafetyVehicleFamily;
  summaryText: string;
  detailText: string;
  warningTexts: string[];
  recoveryReasons: string[];
  hasPendingChanges: boolean;
  canConfirm: boolean;
  vehicleSlug: ReturnType<typeof getVehicleSlug>;
};

export type GeofenceModel = {
  family: SafetyVehicleFamily;
  fenceEnabled: boolean;
  selectedTypeCount: number;
  selectedTypeLabels: string[];
  recoveryReasons: string[];
  warningTexts: string[];
  hasPendingChanges: boolean;
  canConfirm: boolean;
  vehicleSlug: ReturnType<typeof getVehicleSlug>;
};

export const COPTER_RADIO_FS_OPTIONS = [
  { value: 0, label: "Disabled" },
  { value: 1, label: "RTL" },
  { value: 2, label: "Continue Mission (Auto)" },
  { value: 3, label: "Land" },
  { value: 4, label: "SmartRTL → RTL" },
  { value: 5, label: "SmartRTL → Land" },
  { value: 6, label: "Auto DO_LAND_START → RTL" },
  { value: 7, label: "Brake → Land" },
] as const;

export const COPTER_BATTERY_FS_OPTIONS = [
  { value: 0, label: "Warn Only" },
  { value: 1, label: "Land" },
  { value: 2, label: "RTL" },
  { value: 3, label: "SmartRTL → RTL" },
  { value: 4, label: "SmartRTL → Land" },
  { value: 5, label: "Terminate (dangerous)" },
  { value: 6, label: "Auto DO_LAND_START → RTL" },
  { value: 7, label: "Brake → Land" },
] as const;

export const COPTER_GCS_FS_OPTIONS = [
  { value: 0, label: "Disabled" },
  { value: 1, label: "RTL" },
  { value: 2, label: "Continue Mission (Auto)" },
  { value: 3, label: "SmartRTL → RTL" },
  { value: 4, label: "SmartRTL → Land" },
  { value: 5, label: "Land" },
  { value: 6, label: "Auto DO_LAND_START → RTL" },
  { value: 7, label: "Brake → Land" },
] as const;

export const ROVER_FS_ACTION_OPTIONS = [
  { value: 0, label: "Disabled" },
  { value: 1, label: "RTL" },
  { value: 2, label: "Hold" },
  { value: 3, label: "SmartRTL → RTL" },
  { value: 4, label: "SmartRTL → Hold" },
] as const;

export const FAILSAFE_DEFAULTS_COPTER: SafetyDefaultsEntry[] = [
  { paramName: "FS_THR_ENABLE", value: 1, label: "Radio → RTL" },
  { paramName: "FS_EKF_ACTION", value: 1, label: "EKF → Land" },
  { paramName: "BATT_FS_LOW_ACT", value: 2, label: "Low Battery → RTL" },
  { paramName: "BATT_FS_CRT_ACT", value: 1, label: "Critical Battery → Land" },
  { paramName: "FS_CRASH_CHECK", value: 1, label: "Crash Detection → Enabled" },
];

export const FAILSAFE_DEFAULTS_PLANE: SafetyDefaultsEntry[] = [
  { paramName: "THR_FAILSAFE", value: 1, label: "Radio → Enabled" },
  { paramName: "BATT_FS_LOW_ACT", value: 2, label: "Low Battery → RTL" },
  { paramName: "BATT_FS_CRT_ACT", value: 1, label: "Critical Battery → Land" },
];

export const FAILSAFE_DEFAULTS_ROVER: SafetyDefaultsEntry[] = [
  { paramName: "FS_ACTION", value: 1, label: "Radio / GCS → RTL" },
  { paramName: "FS_TIMEOUT", value: 5, label: "GCS Timeout → 5 s" },
  { paramName: "BATT_FS_LOW_ACT", value: 2, label: "Low Battery → RTL" },
  { paramName: "BATT_FS_CRT_ACT", value: 1, label: "Critical Battery → Land" },
];

const FAILSAFE_REQUIRED_ROWS: Record<
  Exclude<SafetyVehicleFamily, "unknown">,
  { numeric: string[]; enum: string[] }
> = {
  copter: {
    numeric: ["FS_THR_VALUE", "BATT_LOW_VOLT", "BATT_LOW_MAH", "BATT_CRT_VOLT", "BATT_CRT_MAH", "FS_EKF_THRESH"],
    enum: ["FS_THR_ENABLE", "BATT_FS_LOW_ACT", "BATT_FS_CRT_ACT", "FS_GCS_ENABLE", "FS_EKF_ACTION", "FS_CRASH_CHECK"],
  },
  plane: {
    numeric: ["THR_FS_VALUE", "BATT_LOW_VOLT", "BATT_LOW_MAH", "BATT_CRT_VOLT", "BATT_CRT_MAH"],
    enum: ["THR_FAILSAFE", "BATT_FS_LOW_ACT", "BATT_FS_CRT_ACT", "FS_LONG_ACTN", "FS_SHORT_ACTN"],
  },
  rover: {
    numeric: ["FS_TIMEOUT", "BATT_LOW_VOLT", "BATT_LOW_MAH", "BATT_CRT_VOLT", "BATT_CRT_MAH"],
    enum: ["FS_ACTION", "BATT_FS_LOW_ACT", "BATT_FS_CRT_ACT"],
  },
};

const RTL_REQUIRED_ROWS: Record<Exclude<SafetyVehicleFamily, "unknown">, { numeric: string[]; enum: string[] }> = {
  copter: {
    numeric: ["RTL_ALT", "RTL_ALT_FINAL", "RTL_CLIMB_MIN", "RTL_SPEED", "RTL_LOIT_TIME"],
    enum: [],
  },
  plane: {
    numeric: ["ALT_HOLD_RTL"],
    enum: ["RTL_AUTOLAND"],
  },
  rover: {
    numeric: ["RTL_SPEED", "WP_RADIUS"],
    enum: [],
  },
};

const GEOFENCE_REQUIRED_ROWS: Record<Exclude<SafetyVehicleFamily, "unknown">, { numeric: string[]; enum: string[]; bitmask: string[] }> = {
  copter: {
    numeric: ["FENCE_ALT_MAX", "FENCE_ALT_MIN", "FENCE_RADIUS", "FENCE_MARGIN"],
    enum: ["FENCE_ENABLE", "FENCE_ACTION"],
    bitmask: ["FENCE_TYPE"],
  },
  plane: {
    numeric: ["FENCE_ALT_MAX", "FENCE_MARGIN"],
    enum: ["FENCE_ENABLE", "FENCE_ACTION"],
    bitmask: ["FENCE_TYPE"],
  },
  rover: {
    numeric: ["FENCE_RADIUS", "FENCE_MARGIN"],
    enum: ["FENCE_ENABLE", "FENCE_ACTION"],
    bitmask: ["FENCE_TYPE"],
  },
};

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

function hasParam(paramStore: ParamStore | null, name: string): boolean {
  return paramStore?.params[name] !== undefined;
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

function hasEnumMetadata(metadata: ParamMetadataMap | null, name: string): boolean {
  const values = metadata?.get(name)?.values;
  return Array.isArray(values)
    && values.some((entry) => Number.isFinite(entry.code) && typeof entry.label === "string" && entry.label.trim().length > 0);
}

function normalizeBitmaskLabels(metadata: ParamMetadataMap | null, name: string): { bit: number; label: string }[] {
  const bitmask = metadata?.get(name)?.bitmask;
  if (!Array.isArray(bitmask)) {
    return [];
  }

  return bitmask
    .filter((entry) => Number.isInteger(entry.bit) && entry.bit >= 0 && typeof entry.label === "string" && entry.label.trim().length > 0)
    .map((entry) => ({ bit: entry.bit, label: entry.label.trim() }));
}

function hasBitmaskMetadata(metadata: ParamMetadataMap | null, name: string): boolean {
  return normalizeBitmaskLabels(metadata, name).length > 0;
}

export function resolveSafetyVehicleFamily(vehicleType: string | null): SafetyVehicleFamily {
  if (isCopterVehicleType(vehicleType)) {
    return "copter";
  }
  if (isPlaneVehicleType(vehicleType)) {
    return "plane";
  }
  if (isRoverVehicleType(vehicleType)) {
    return "rover";
  }
  return "unknown";
}

export function buildFailsafeDefaultsPreview(input: SafetyModelInput): SafetyDefaultsPreviewEntry[] {
  const family = resolveSafetyVehicleFamily(input.vehicleType);
  const defaults = family === "plane"
    ? FAILSAFE_DEFAULTS_PLANE
    : family === "rover"
      ? FAILSAFE_DEFAULTS_ROVER
      : FAILSAFE_DEFAULTS_COPTER;

  return defaults.map((entry) => {
    const current = stagedOrCurrentValue(input.paramStore, input.stagedEdits, entry.paramName);
    return {
      paramName: entry.paramName,
      label: entry.label,
      newValue: entry.value,
      currentValue: current,
      willChange: current !== entry.value,
    } satisfies SafetyDefaultsPreviewEntry;
  });
}

function buildRecoveryReasons(
  input: SafetyModelInput,
  requiredRows: { numeric: string[]; enum: string[]; bitmask?: string[] },
): string[] {
  const reasons: string[] = [];

  for (const name of requiredRows.numeric) {
    if (!hasParam(input.paramStore, name)) {
      reasons.push(`${name} is unavailable for this vehicle scope.`);
    }
  }

  for (const name of requiredRows.enum) {
    if (!hasParam(input.paramStore, name)) {
      reasons.push(`${name} is unavailable for this vehicle scope.`);
    } else if (!hasEnumMetadata(input.metadata, name)) {
      reasons.push(`${name} metadata is missing or malformed, so the purpose-built selector stays read-only.`);
    }
  }

  for (const name of requiredRows.bitmask ?? []) {
    if (!hasParam(input.paramStore, name)) {
      reasons.push(`${name} is unavailable for this vehicle scope.`);
    } else if (!hasBitmaskMetadata(input.metadata, name)) {
      reasons.push(`${name} bitmask metadata is missing or malformed, so the purpose-built checklist stays read-only.`);
    }
  }

  return reasons;
}

function hasPendingChangesForRows(
  input: SafetyModelInput,
  rows: readonly string[],
): boolean {
  return rows.some((name) => hasPendingChange(input.paramStore, input.stagedEdits, name));
}

export function buildFailsafeSectionModel(input: SafetyModelInput): FailsafeSectionModel {
  const family = resolveSafetyVehicleFamily(input.vehicleType);
  if (family === "unknown") {
    return {
      family,
      defaultsPreview: [],
      recoveryReasons: ["Failsafe guidance is unavailable because the active vehicle family is unknown."],
      warningTexts: [],
      hasPendingChanges: false,
      canConfirm: false,
      vehicleSlug: getVehicleSlug(input.vehicleType),
    };
  }

  const required = FAILSAFE_REQUIRED_ROWS[family];
  const recoveryReasons = buildRecoveryReasons(input, required);
  const warningTexts: string[] = [];
  const radioParam = family === "plane" ? "THR_FAILSAFE" : family === "rover" ? "FS_ACTION" : "FS_THR_ENABLE";
  const gcsParam = family === "plane" ? "FS_LONG_ACTN" : family === "rover" ? "FS_ACTION" : "FS_GCS_ENABLE";
  const lowVolt = stagedOrCurrentValue(input.paramStore, input.stagedEdits, "BATT_LOW_VOLT");
  const criticalVolt = stagedOrCurrentValue(input.paramStore, input.stagedEdits, "BATT_CRT_VOLT");

  if (stagedOrCurrentValue(input.paramStore, input.stagedEdits, radioParam) === 0) {
    warningTexts.push(family === "rover" ? "Radio / GCS failsafe is disabled." : "Radio failsafe is disabled.");
  }
  if (family !== "rover" && stagedOrCurrentValue(input.paramStore, input.stagedEdits, gcsParam) === 0) {
    warningTexts.push("GCS failsafe is disabled.");
  }
  if (
    typeof lowVolt === "number"
    && typeof criticalVolt === "number"
    && lowVolt > 0
    && criticalVolt > 0
    && lowVolt <= criticalVolt
  ) {
    warningTexts.push("Low-voltage threshold should stay higher than the critical-voltage threshold.");
  }

  const rowNames = [...required.numeric, ...required.enum];
  const hasPendingChanges = hasPendingChangesForRows(input, rowNames);

  return {
    family,
    defaultsPreview: buildFailsafeDefaultsPreview(input),
    recoveryReasons,
    warningTexts,
    hasPendingChanges,
    canConfirm: recoveryReasons.length === 0 && !hasPendingChanges,
    vehicleSlug: getVehicleSlug(input.vehicleType),
  };
}

export function buildRtlReturnModel(input: SafetyModelInput): RtlReturnModel {
  const family = resolveSafetyVehicleFamily(input.vehicleType);
  if (family === "unknown") {
    return {
      family,
      summaryText: "Unknown vehicle family",
      detailText: "Return-home guidance is unavailable because the active vehicle family could not be identified.",
      warningTexts: [],
      recoveryReasons: ["RTL / Return guidance is unavailable because the active vehicle family is unknown."],
      hasPendingChanges: false,
      canConfirm: false,
      vehicleSlug: getVehicleSlug(input.vehicleType),
    };
  }

  const required = RTL_REQUIRED_ROWS[family];
  const recoveryReasons = buildRecoveryReasons(input, required);
  const warningTexts: string[] = [];
  const hasPendingChanges = hasPendingChangesForRows(input, [...required.numeric, ...required.enum]);

  let summaryText = "";
  let detailText = "";

  if (family === "copter") {
    const rtlAlt = stagedOrCurrentValue(input.paramStore, input.stagedEdits, "RTL_ALT");
    const finalAlt = stagedOrCurrentValue(input.paramStore, input.stagedEdits, "RTL_ALT_FINAL");
    summaryText = `Return altitude ${rtlAlt == null ? "--" : `${(rtlAlt / 100).toFixed(1)} m`} · Final altitude ${finalAlt == null ? "--" : `${(finalAlt / 100).toFixed(1)} m`}`;
    detailText = "Copter RTL keeps climb, return speed, and final descent explicit instead of hiding them in raw parameters.";
    if (rtlAlt === 0) {
      warningTexts.push("RTL_ALT is 0, so the vehicle may return at its current altitude instead of climbing above obstacles.");
    }
  } else if (family === "plane") {
    const holdAlt = stagedOrCurrentValue(input.paramStore, input.stagedEdits, "ALT_HOLD_RTL");
    summaryText = `Return altitude ${holdAlt === -1 ? "current altitude" : holdAlt == null ? "--" : `${(holdAlt / 100).toFixed(1)} m`}`;
    detailText = "Plane RTL keeps return altitude and auto-land intent explicit for fixed-wing recovery.";
  } else {
    const speed = stagedOrCurrentValue(input.paramStore, input.stagedEdits, "RTL_SPEED");
    const radius = stagedOrCurrentValue(input.paramStore, input.stagedEdits, "WP_RADIUS");
    summaryText = `Return speed ${speed == null ? "--" : `${(speed / 100).toFixed(1)} m/s`} · Approach radius ${radius == null ? "--" : `${radius.toFixed(1)} m`}`;
    detailText = "Rover return keeps speed and arrival radius explicit without pretending aircraft-only altitude controls exist.";
  }

  return {
    family,
    summaryText,
    detailText,
    warningTexts,
    recoveryReasons,
    hasPendingChanges,
    canConfirm: recoveryReasons.length === 0 && !hasPendingChanges,
    vehicleSlug: getVehicleSlug(input.vehicleType),
  };
}

export function buildGeofenceModel(input: SafetyModelInput): GeofenceModel {
  const family = resolveSafetyVehicleFamily(input.vehicleType);
  if (family === "unknown") {
    return {
      family,
      fenceEnabled: false,
      selectedTypeCount: 0,
      selectedTypeLabels: [],
      recoveryReasons: ["Geofence guidance is unavailable because the active vehicle family is unknown."],
      warningTexts: [],
      hasPendingChanges: false,
      canConfirm: false,
      vehicleSlug: getVehicleSlug(input.vehicleType),
    };
  }

  const required = GEOFENCE_REQUIRED_ROWS[family];
  const recoveryReasons = buildRecoveryReasons(input, required);
  const fenceEnabled = (stagedOrCurrentValue(input.paramStore, input.stagedEdits, "FENCE_ENABLE") ?? 0) !== 0;
  const fenceMask = stagedOrCurrentValue(input.paramStore, input.stagedEdits, "FENCE_TYPE") ?? 0;
  const selectedTypeLabels = normalizeBitmaskLabels(input.metadata, "FENCE_TYPE")
    .filter((entry) => (fenceMask & (1 << entry.bit)) !== 0)
    .map((entry) => entry.label);
  const selectedTypeCount = selectedTypeLabels.length;
  const warningTexts: string[] = [];

  if (fenceEnabled && selectedTypeCount === 0) {
    warningTexts.push("Fence is enabled but no fence types are selected yet.");
  }
  if (!fenceEnabled) {
    warningTexts.push("Fence is disabled, so breach actions will not trigger.");
  }

  const altMax = stagedOrCurrentValue(input.paramStore, input.stagedEdits, "FENCE_ALT_MAX");
  const altMin = stagedOrCurrentValue(input.paramStore, input.stagedEdits, "FENCE_ALT_MIN");
  if (
    family !== "rover"
    && typeof altMax === "number"
    && typeof altMin === "number"
    && altMax > 0
    && altMin > 0
    && altMax <= altMin
  ) {
    warningTexts.push("FENCE_ALT_MAX must stay above FENCE_ALT_MIN.");
  }

  const rowNames = [...required.numeric, ...required.enum, ...required.bitmask];
  const hasPendingChanges = hasPendingChangesForRows(input, rowNames);

  return {
    family,
    fenceEnabled,
    selectedTypeCount,
    selectedTypeLabels,
    recoveryReasons,
    warningTexts,
    hasPendingChanges,
    canConfirm: recoveryReasons.length === 0 && !hasPendingChanges && (!fenceEnabled || selectedTypeCount > 0),
    vehicleSlug: getVehicleSlug(input.vehicleType),
  };
}
