import { parameterEncoding, resolveRtlParameter } from "./ardupilot-parameters";
import { FailsafeAction, failsafeDefault } from "../ardupilot/failsafe";
import { hasBit, normalizeBitmaskOptions } from "../bitmask";
import type { StagedParameterValues } from "../params/parameter-values";
import { readAppliedParameter, hasParameter, readProposedParameter, hasPendingParameterEdit } from "../params/parameter-values";
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
  stagedEdits: StagedParameterValues;
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

export const FAILSAFE_DEFAULTS_COPTER: SafetyDefaultsEntry[] = [
  failsafeDefault("copter.FS_THR_ENABLE", FailsafeAction.Rtl, "Radio"),
  failsafeDefault("copter.FS_EKF_ACTION", FailsafeAction.Land, "EKF"),
  failsafeDefault("copter.BATT_FS_LOW_ACT", FailsafeAction.Rtl, "Low Battery"),
  failsafeDefault("copter.BATT_FS_CRT_ACT", FailsafeAction.Land, "Critical Battery"),
  failsafeDefault("copter.FS_CRASH_CHECK", FailsafeAction.Enabled, "Crash Detection"),
];
export const FAILSAFE_DEFAULTS_PLANE: SafetyDefaultsEntry[] = [
  failsafeDefault("plane.THR_FAILSAFE", FailsafeAction.Enabled, "Radio"),
  failsafeDefault("plane.BATT_FS_LOW_ACT", FailsafeAction.Rtl, "Low Battery"),
  failsafeDefault("plane.BATT_FS_CRT_ACT", FailsafeAction.Land, "Critical Battery"),
];
export const FAILSAFE_DEFAULTS_ROVER: SafetyDefaultsEntry[] = [
  failsafeDefault("rover.FS_ACTION", FailsafeAction.Rtl, "Radio / GCS"),
  { paramName: "FS_TIMEOUT", value: 5, label: "GCS Timeout → 5 s" },
  failsafeDefault("rover.BATT_FS_LOW_ACT", FailsafeAction.Rtl, "Low Battery"),
  failsafeDefault("rover.BATT_FS_CRT_ACT", FailsafeAction.Hold, "Critical Battery"),
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

const RTL_REQUIRED_ROWS: Record<Exclude<SafetyVehicleFamily, "unknown">, { numeric: string[][]; enum: string[] }> = {
  copter: {
    numeric: [["RTL_ALT_M", "RTL_ALT"], ["RTL_ALT_FINAL_M", "RTL_ALT_FINAL"], ["RTL_CLIMB_MIN_M", "RTL_CLIMB_MIN"], ["RTL_SPEED_MS", "RTL_SPEED"], ["RTL_LOIT_TIME"]],
    enum: [],
  },
  plane: {
    numeric: [["RTL_ALTITUDE", "ALT_HOLD_RTL"]],
    enum: ["RTL_AUTOLAND"],
  },
  rover: {
    numeric: [["RTL_SPEED"], ["WP_RADIUS"]],
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

function hasEnumMetadata(metadata: ParamMetadataMap | null, name: string): boolean {
  const values = metadata?.get(name)?.values;
  return Array.isArray(values)
    && values.some((entry) => Number.isFinite(entry.code) && typeof entry.label === "string" && entry.label.trim().length > 0);
}

function normalizeBitmaskLabels(metadata: ParamMetadataMap | null, name: string): { bit: number; label: string }[] {
  return normalizeBitmaskOptions(metadata?.get(name)?.bitmask);
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
    const current = readProposedParameter(input, entry.paramName);
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
    if (!hasParameter(input.paramStore, name)) {
      reasons.push(`${name} is absent from the active parameter set.`);
    }
  }

  for (const name of requiredRows.enum) {
    if (!hasParameter(input.paramStore, name)) {
      reasons.push(`${name} is absent from the active parameter set.`);
    } else if (!hasEnumMetadata(input.metadata, name)) {
      reasons.push(`${name} option labels are unavailable, so this selector stays read-only in the guided view.`);
    }
  }

  for (const name of requiredRows.bitmask ?? []) {
    if (!hasParameter(input.paramStore, name)) {
      reasons.push(`${name} is absent from the active parameter set.`);
    } else if (!hasBitmaskMetadata(input.metadata, name)) {
      reasons.push(`${name} checklist labels are unavailable, so this checklist stays read-only in the guided view.`);
    }
  }

  return reasons;
}

function hasPendingChangesForRows(
  input: SafetyModelInput,
  rows: readonly string[],
): boolean {
  return rows.some((name) => hasPendingParameterEdit(input, name));
}

function firstPresentParamName(paramStore: ParamStore | null, names: readonly string[]): string | null {
  return names.find((name) => hasParameter(paramStore, name)) ?? null;
}

function buildRtlRecoveryReasons(
  input: SafetyModelInput,
  requiredRows: { numeric: string[][]; enum: string[] },
): string[] {
  const reasons = requiredRows.numeric.flatMap((names) => firstPresentParamName(input.paramStore, names)
    ? []
    : [`${names.join(" or ")} is absent from the active parameter set.`]);

  return [...reasons, ...buildRecoveryReasons(input, { numeric: [], enum: requiredRows.enum })];
}

function selectedRtlRowNames(input: SafetyModelInput, requiredRows: { numeric: string[][]; enum: string[] }): string[] {
  return [
    ...requiredRows.numeric.flatMap((names) => firstPresentParamName(input.paramStore, names) ?? []),
    ...requiredRows.enum,
  ];
}

function rtlValueForRole(input: SafetyModelInput, family: string, role: string) {
  const encoding = resolveRtlParameter(family, role, Object.keys(input.paramStore?.params ?? {}));
  return { name: encoding?.name ?? "", value: encoding ? readProposedParameter(input, encoding.name) : null };
}

function formatRtlValue(value: number | null, factor: number, unit: string): string {
  return value == null ? "--" : `${(value / factor).toFixed(1)} ${unit}`;
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
  const lowVolt = readProposedParameter(input, "BATT_LOW_VOLT");
  const criticalVolt = readProposedParameter(input, "BATT_CRT_VOLT");

  if (readProposedParameter(input, radioParam) === 0) {
    warningTexts.push(family === "rover" ? "Radio / GCS failsafe is disabled." : "Radio failsafe is disabled.");
  }
  if (family !== "rover" && readProposedParameter(input, gcsParam) === 0) {
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
  const recoveryReasons = buildRtlRecoveryReasons(input, required);
  const warningTexts: string[] = [];
  const hasPendingChanges = hasPendingChangesForRows(input, selectedRtlRowNames(input, required));

  let summaryText = "";
  let detailText = "";

  if (family === "copter") {
    const rtlAlt = rtlValueForRole(input, family, "return_altitude");
    const finalAlt = rtlValueForRole(input, family, "final_altitude");
    summaryText = `Return altitude ${formatRtlValue(rtlAlt.value, parameterEncoding(family, rtlAlt.name)?.raw_per_unit ?? 1, "m")} · Final altitude ${formatRtlValue(finalAlt.value, parameterEncoding(family, finalAlt.name)?.raw_per_unit ?? 1, "m")}`;
    detailText = "Copter RTL combines climb altitude, return speed, loiter, and final descent settings.";
    if (rtlAlt.value === 0) {
      warningTexts.push(`${rtlAlt.name} is 0, so the vehicle may return at its current altitude instead of climbing above obstacles.`);
    }
  } else if (family === "plane") {
    const holdAlt = rtlValueForRole(input, family, "return_altitude");
    summaryText = `Return altitude ${holdAlt.value === -1 ? "current altitude" : formatRtlValue(holdAlt.value, parameterEncoding(family, holdAlt.name)?.raw_per_unit ?? 1, "m")}`;
    detailText = "Plane RTL keeps return altitude and auto-land intent explicit for fixed-wing recovery.";
  } else {
    const speed = readProposedParameter(input, "RTL_SPEED");
    const radius = readProposedParameter(input, "WP_RADIUS");
    const speedFactor = parameterEncoding("rover", "RTL_SPEED")!.raw_per_unit;
    summaryText = `Return speed ${formatRtlValue(speed, speedFactor, "m/s")} · Approach radius ${formatRtlValue(radius, 1, "m")}`;
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
  const fenceEnabled = (readProposedParameter(input, "FENCE_ENABLE") ?? 0) !== 0;
  const fenceMask = readProposedParameter(input, "FENCE_TYPE") ?? 0;
  const selectedTypeLabels = normalizeBitmaskLabels(input.metadata, "FENCE_TYPE")
    .filter((entry) => hasBit(fenceMask, entry.bit))
    .map((entry) => entry.label);
  const selectedTypeCount = selectedTypeLabels.length;
  const warningTexts: string[] = [];

  if (fenceEnabled && selectedTypeCount === 0) {
    warningTexts.push("Fence is enabled but no fence types are selected yet.");
  }
  if (!fenceEnabled) {
    warningTexts.push("Fence is disabled, so breach actions will not trigger.");
  }

  const altMax = readProposedParameter(input, "FENCE_ALT_MAX");
  const altMin = readProposedParameter(input, "FENCE_ALT_MIN");
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
