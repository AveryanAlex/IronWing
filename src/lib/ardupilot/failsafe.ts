/** Semantic actions; numeric values belong to a vehicle/parameter profile. */
export enum FailsafeAction {
  Disabled = "disabled",
  Enabled = "enabled",
  WarnOnly = "warn_only",
  Rtl = "rtl",
  Land = "land",
  Hold = "hold",
}
const ACTION_LABELS: Record<FailsafeAction, string> = {
  disabled: "Disabled",
  enabled: "Enabled",
  warn_only: "Warn Only",
  rtl: "RTL",
  land: "Land",
  hold: "Hold",
};
const COPTER_BATTERY = { [FailsafeAction.WarnOnly]: 0, [FailsafeAction.Land]: 1, [FailsafeAction.Rtl]: 2 };
const PLANE_BATTERY = { [FailsafeAction.WarnOnly]: 0, [FailsafeAction.Rtl]: 1, [FailsafeAction.Land]: 2 };
const ROVER_BATTERY = { [FailsafeAction.WarnOnly]: 0, [FailsafeAction.Rtl]: 1, [FailsafeAction.Hold]: 2 };

// Only actions used by guided defaults. Editable options always come from firmware metadata.
const DEFAULT_ACTION_PROFILES = {
  "copter.FS_THR_ENABLE": { [FailsafeAction.Disabled]: 0, [FailsafeAction.Rtl]: 1, [FailsafeAction.Land]: 3 },
  "copter.FS_EKF_ACTION": { [FailsafeAction.Land]: 1 },
  "copter.FS_CRASH_CHECK": { [FailsafeAction.Disabled]: 0, [FailsafeAction.Enabled]: 1 },
  "copter.BATT_FS_LOW_ACT": COPTER_BATTERY,
  "copter.BATT_FS_CRT_ACT": COPTER_BATTERY,
  "plane.THR_FAILSAFE": { [FailsafeAction.Disabled]: 0, [FailsafeAction.Enabled]: 1 },
  "plane.BATT_FS_LOW_ACT": PLANE_BATTERY,
  "plane.BATT_FS_CRT_ACT": PLANE_BATTERY,
  "rover.FS_ACTION": { [FailsafeAction.Disabled]: 0, [FailsafeAction.Rtl]: 1, [FailsafeAction.Hold]: 2 },
  "rover.BATT_FS_LOW_ACT": ROVER_BATTERY,
  "rover.BATT_FS_CRT_ACT": ROVER_BATTERY,
} as const;

type Profile = keyof typeof DEFAULT_ACTION_PROFILES;
export function failsafeDefault<P extends Profile>(
  profile: P,
  action: keyof (typeof DEFAULT_ACTION_PROFILES)[P] & FailsafeAction,
  caption: string,
) {
  const codes: Partial<Record<FailsafeAction, number>> = DEFAULT_ACTION_PROFILES[profile];
  const value = codes[action];
  if (value === undefined) throw new RangeError(`Unsupported ${profile} action ${action}`);
  return { paramName: profile.split(".")[1], value, label: `${caption} → ${ACTION_LABELS[action]}` };
}
