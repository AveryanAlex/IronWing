import { SETUP_SECTION_CATALOG, type SetupSectionId } from "../../../src/lib/setup-sections";

const setupSectionTestIds = {
  overview: "setup-workspace-overview-section",
  frame_orientation: "setup-workspace-frame-section",
  calibration: "setup-workspace-calibration-section",
  rc_receiver: "setup-workspace-rc-section",
  navigation: "setup-workspace-navigation-section",
  battery_monitor: "setup-workspace-battery-section",
  motors_esc: "setup-workspace-motors-esc-section",
  servo_outputs: "setup-workspace-servo-outputs-section",
  serial_ports: "setup-workspace-serial-ports-section",
  osd: "setup-workspace-osd-section",
  flight_modes: "setup-workspace-flight-modes-section",
  failsafe: "setup-workspace-failsafe-section",
  rtl_return: "setup-workspace-rtl-return-section",
  geofence: "setup-workspace-geofence-section",
  arming: "setup-workspace-arming-section",
  initial_params: "setup-workspace-initial-params-section",
  pid_tuning: "setup-workspace-pid-tuning-section",
  parameters: "setup-workspace-parameters",
} satisfies Record<SetupSectionId, string>;

export const setupSections = SETUP_SECTION_CATALOG.map((section) => ({
  id: section.id,
  label: section.title,
  testId: setupSectionTestIds[section.id],
}));

export type SetupSection = (typeof setupSections)[number];

export const safeParameterEditCandidates = ["BATT_LOW_VOLT", "RTL_ALT", "WP_RADIUS", "CRUISE_SPEED"] as const;

export type ParameterEdit = {
  name: string;
  current: number;
  next: number;
};
