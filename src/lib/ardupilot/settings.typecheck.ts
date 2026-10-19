import { FailsafeAction, failsafeDefault } from "./failsafe";

function settingsTypeContracts() {
  // @ts-expect-error Rover cannot land as a battery failsafe action.
  failsafeDefault("rover.BATT_FS_CRT_ACT", FailsafeAction.Land, "Critical Battery");
  // @ts-expect-error An EKF action cannot be substituted for a radio action.
  failsafeDefault("copter.FS_EKF_ACTION", FailsafeAction.Rtl, "EKF");
  // @ts-expect-error Only known family/parameter pairs have guided defaults.
  failsafeDefault("plane.FS_THR_ENABLE", FailsafeAction.Rtl, "Radio");
}
void settingsTypeContracts;
