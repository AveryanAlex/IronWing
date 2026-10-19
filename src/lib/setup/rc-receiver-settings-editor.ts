import { normalizeBitmaskOptions as normalizeRcReceiverBitmaskOptions } from "../bitmask";
export { normalizeBitmaskOptions as normalizeRcReceiverBitmaskOptions, hasBit as isRcReceiverBitEnabled, setBit as toggleRcReceiverBit } from "../bitmask";
import { normalizeNumericDraft, resolveNumericEditState, type NumericEditState } from "../params/numeric-editing";
import { resolveParameterValue } from "../params/parameter-values";
import type { StagedParameterValues } from "../params/parameter-values";
import type { ParamMeta } from "../../param-metadata";
import type { ParameterItemModel } from "../params/parameter-item-model";

export const RC_RECEIVER_SETTING_NAMES = [
  "RC_FS_TIMEOUT",
  "RC_OVERRIDE_TIME",
  "RC_OPTIONS",
  "RC_PROTOCOLS",
] as const;

export type RcReceiverSettingName = (typeof RC_RECEIVER_SETTING_NAMES)[number];
export type RcReceiverSettingsStagedEdits = StagedParameterValues;

export type RcReceiverSettingSpec = {
  name: RcReceiverSettingName;
  label: string;
  description: string;
  level: "Standard" | "Advanced";
  kind: "number" | "bitmask";
  fallbackRange?: { min: number; max: number };
  fallbackIncrement: number;
  specialValues?: readonly number[];
};

export type RcReceiverSetting = RcReceiverSettingSpec & {
  item: ParameterItemModel;
};

export type RcReceiverBitmaskOption = {
  bit: number;
  label: string;
};

export type RcReceiverSettingEditState = NumericEditState;

export const RC_RECEIVER_SETTING_SPECS: readonly RcReceiverSettingSpec[] = [
  {
    name: "RC_FS_TIMEOUT",
    label: "RC loss failsafe timeout",
    description: "Seconds after receiver input is lost before ArduPilot triggers RC failsafe.",
    level: "Standard",
    kind: "number",
    fallbackRange: { min: 0.1, max: 10 },
    fallbackIncrement: 0.1,
  },
  {
    name: "RC_OVERRIDE_TIME",
    specialValues: [-1],
    label: "MAVLink override timeout",
    description: "Seconds before MAVLink RC overrides expire and receiver input resumes. Use 0 to disable overrides; -1 keeps overrides active until disabled.",
    level: "Advanced",
    kind: "number",
    fallbackRange: { min: 0, max: 120 },
    fallbackIncrement: 0.1,
  },
  {
    name: "RC_OPTIONS",
    label: "Receiver behavior options",
    description: "Advanced receiver-input behavior flags. Available labels come from firmware metadata when present.",
    level: "Advanced",
    kind: "bitmask",
    fallbackIncrement: 1,
  },
  {
    name: "RC_PROTOCOLS",
    label: "Enabled receiver protocols",
    description: "Protocol auto-detection mask. Select All for broad detection, or clear All and enable specific protocols to narrow detection.",
    level: "Advanced",
    kind: "bitmask",
    fallbackIncrement: 1,
  },
];

const FALLBACK_BITMASK_OPTIONS: Readonly<Record<"RC_OPTIONS" | "RC_PROTOCOLS", readonly RcReceiverBitmaskOption[]>> = {
  RC_OPTIONS: [
    { bit: 0, label: "Ignore RC Receiver" },
    { bit: 1, label: "Ignore MAVLink Overrides" },
    { bit: 2, label: "Ignore Receiver Failsafe bit but allow other RC failsafes if setup" },
    { bit: 3, label: "FPort Pad" },
    { bit: 4, label: "Log RC input bytes" },
    { bit: 5, label: "Arming check throttle for 0 input" },
    { bit: 6, label: "Skip the arming check for neutral Roll/Pitch/Yaw sticks" },
    { bit: 7, label: "Allow Switch reverse" },
    { bit: 8, label: "Use passthrough for CRSF telemetry" },
    { bit: 9, label: "Suppress CRSF mode/rate message for ELRS systems" },
    { bit: 10, label: "Enable multiple receiver support" },
    { bit: 11, label: "Use Link Quality for RSSI with CRSF" },
    { bit: 12, label: "Annotate CRSF flight mode with * on disarm" },
    { bit: 13, label: "Use 420kbaud for ELRS protocol" },
  ],
  RC_PROTOCOLS: [
    { bit: 0, label: "All" },
    { bit: 1, label: "PPM" },
    { bit: 2, label: "IBUS" },
    { bit: 3, label: "SBUS" },
    { bit: 4, label: "SBUS_NI" },
    { bit: 5, label: "DSM" },
    { bit: 6, label: "SUMD" },
    { bit: 7, label: "SRXL" },
    { bit: 8, label: "SRXL2" },
    { bit: 9, label: "CRSF" },
    { bit: 10, label: "ST24" },
    { bit: 11, label: "FPORT" },
    { bit: 12, label: "FPORT2" },
    { bit: 13, label: "FastSBUS" },
    { bit: 14, label: "DroneCAN" },
    { bit: 15, label: "Ghost" },
    { bit: 16, label: "MAVRadio" },
  ],
};

export function discoverRcReceiverSettings(
  itemIndex: ReadonlyMap<string, ParameterItemModel>,
): RcReceiverSetting[] {
  return RC_RECEIVER_SETTING_SPECS.flatMap((spec) => {
    const item = itemIndex.get(spec.name);
    return item ? [{ ...spec, item }] : [];
  });
}

export function resolveRcReceiverBitmaskOptions(
  name: RcReceiverSettingName,
  metadataOptions: ParamMeta["bitmask"] | null | undefined,
): RcReceiverBitmaskOption[] {
  const normalizedMetadata = normalizeRcReceiverBitmaskOptions(metadataOptions);
  if (normalizedMetadata.length > 0) {
    return normalizedMetadata;
  }

  return name === "RC_OPTIONS" || name === "RC_PROTOCOLS"
    ? FALLBACK_BITMASK_OPTIONS[name].map((option) => ({ ...option }))
    : [];
}

export function resolveRcReceiverSettingDraftValue(
  item: ParameterItemModel,
  stagedEdits: RcReceiverSettingsStagedEdits,
  draftOverrides: Readonly<Record<string, number>>,
): number {
  return resolveParameterValue(item.value, stagedEdits[item.name], draftOverrides[item.name]) ?? item.value;
}

export const resolveRcReceiverSettingEditState = resolveNumericEditState;

export function resolveRcReceiverNumericConfig(item: ParameterItemModel): {
  range: { min: number; max: number } | null;
  increment: number;
} {
  const spec = RC_RECEIVER_SETTING_SPECS.find((entry) => entry.name === item.name);
  return {
    range: item.range ?? spec?.fallbackRange ?? null,
    increment: item.increment ?? spec?.fallbackIncrement ?? 1,
  };
}

export function clampRcReceiverSettingDraftValue(item: ParameterItemModel, value: number): number {
  const spec = RC_RECEIVER_SETTING_SPECS.find((entry) => entry.name === item.name);
  return normalizeNumericDraft({ ...resolveRcReceiverNumericConfig(item), specialValues: spec?.specialValues }, value, item.value);
}

export function isRcReceiverSettingOutsideRange(item: ParameterItemModel, value: number): boolean {
  const range = resolveRcReceiverNumericConfig(item).range;
  return Boolean(range && (value < range.min || value > range.max));
}
