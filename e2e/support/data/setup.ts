export const setupSections = [
  { id: "overview", label: "Overview", testId: "setup-workspace-overview-section" },
  { id: "frame_orientation", label: "Frame & Orientation", testId: "setup-workspace-frame-section" },
  { id: "calibration", label: "Calibration", testId: "setup-workspace-calibration-section" },
  { id: "rc_receiver", label: "RC / Receiver", testId: "setup-workspace-rc-section" },
  { id: "navigation", label: "Navigation", testId: "setup-workspace-navigation-section" },
  { id: "battery_monitor", label: "Battery Monitor", testId: "setup-workspace-battery-section" },
  { id: "motors_esc", label: "Motors & ESC", testId: "setup-workspace-motors-esc-section" },
  { id: "servo_outputs", label: "Servo Outputs", testId: "setup-workspace-servo-outputs-section" },
  { id: "serial_ports", label: "Serial Ports", testId: "setup-workspace-serial-ports-section" },
  { id: "flight_modes", label: "Flight Modes", testId: "setup-workspace-flight-modes-section" },
  { id: "failsafe", label: "Failsafe", testId: "setup-workspace-failsafe-section" },
  { id: "rtl_return", label: "RTL / Return", testId: "setup-workspace-rtl-return-section" },
  { id: "geofence", label: "Geofence", testId: "setup-workspace-geofence-section" },
  { id: "arming", label: "Arming", testId: "setup-workspace-arming-section" },
  { id: "initial_params", label: "Initial Parameters", testId: "setup-workspace-initial-params-section" },
  { id: "pid_tuning", label: "PID Tuning", testId: "setup-workspace-pid-tuning-section" },
  { id: "peripherals", label: "Peripherals", testId: "setup-workspace-peripherals-section" },
  { id: "full_parameters", label: "Full Parameters", testId: "setup-workspace-full-parameters" },
] as const;

export type SetupSection = (typeof setupSections)[number];

export const safeParameterEditCandidates = ["BATT_LOW_VOLT", "RTL_ALT", "WP_RADIUS", "CRUISE_SPEED"] as const;

export type ParameterEdit = {
  name: string;
  current: number;
  next: number;
};
