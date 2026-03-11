export type VehicleSlug = "copter" | "plane" | "rover";

export type DocsTopic = CommonTopic | VehicleSpecificTopic;

export type CommonTopic =
  | "geofence"
  | "positioning_gps_compass"
  | "power_module_config"
  | "radio_calibration"
  | "accelerometer_calibration"
  | "compass_calibration"
  | "prearm_safety_checks"
  | "optional_hardware"
  | "tuning";

const COMMON_BASE = "https://ardupilot.org/copter/docs";

const COMMON_TOPICS: Record<CommonTopic, string> = {
  geofence: `${COMMON_BASE}/common-geofencing-landing-page.html`,
  positioning_gps_compass: `${COMMON_BASE}/common-positioning-landing-page.html`,
  power_module_config: `${COMMON_BASE}/common-power-module-configuration-in-mission-planner.html`,
  radio_calibration: `${COMMON_BASE}/common-radio-control-calibration.html`,
  accelerometer_calibration: `${COMMON_BASE}/common-accelerometer-calibration.html`,
  compass_calibration: `${COMMON_BASE}/common-compass-calibration-in-mission-planner.html`,
  prearm_safety_checks: `${COMMON_BASE}/common-prearm-safety-checks.html`,
  optional_hardware: `${COMMON_BASE}/common-optional-hardware.html`,
  tuning: `${COMMON_BASE}/common-tuning.html`,
};

export type VehicleSpecificTopic =
  | "failsafe_battery"
  | "failsafe_radio"
  | "failsafe_gcs"
  | "failsafe_ekf"
  | "failsafe_crash_check"
  | "failsafe_landing_page"
  | "rtl_mode"
  | "frame_type"
  | "motors_esc"
  | "esc_calibration"
  | "arming"
  | "mandatory_hardware_config"
  | "simple_super_simple_modes";

const VEHICLE_TOPICS: Record<
  VehicleSpecificTopic,
  Record<VehicleSlug, string | null>
> = {
  failsafe_battery: {
    copter: "https://ardupilot.org/copter/docs/failsafe-battery.html",
    plane: "https://ardupilot.org/plane/docs/apms-failsafe-function.html",
    rover: "https://ardupilot.org/rover/docs/rover-failsafes.html",
  },
  failsafe_radio: {
    copter: "https://ardupilot.org/copter/docs/radio-failsafe.html",
    plane: "https://ardupilot.org/plane/docs/apms-failsafe-function.html",
    rover: "https://ardupilot.org/rover/docs/rover-failsafes.html",
  },
  failsafe_gcs: {
    copter: "https://ardupilot.org/copter/docs/gcs-failsafe.html",
    plane: "https://ardupilot.org/plane/docs/apms-failsafe-function.html",
    rover: "https://ardupilot.org/rover/docs/rover-failsafes.html",
  },
  failsafe_ekf: {
    copter: "https://ardupilot.org/copter/docs/ekf-inav-failsafe.html",
    plane: null,
    rover: null,
  },
  failsafe_crash_check: {
    copter: "https://ardupilot.org/copter/docs/crash_check.html",
    plane: null,
    rover: null,
  },
  failsafe_landing_page: {
    copter: "https://ardupilot.org/copter/docs/failsafe-landing-page.html",
    plane: "https://ardupilot.org/plane/docs/apms-failsafe-function.html",
    rover: "https://ardupilot.org/rover/docs/rover-failsafes.html",
  },
  rtl_mode: {
    copter: "https://ardupilot.org/copter/docs/rtl-mode.html",
    plane: "https://ardupilot.org/plane/docs/rtl-mode.html",
    rover: "https://ardupilot.org/rover/docs/rtl-mode.html",
  },
  frame_type: {
    copter: "https://ardupilot.org/copter/docs/frame-type-configuration.html",
    plane: null,
    rover: null,
  },
  motors_esc: {
    copter: "https://ardupilot.org/copter/docs/connect-escs-and-motors.html",
    plane: null,
    rover: null,
  },
  esc_calibration: {
    copter: "https://ardupilot.org/copter/docs/esc-calibration.html",
    plane: "https://ardupilot.org/plane/docs/common-esc-calibration.html",
    rover: "https://ardupilot.org/rover/docs/common-esc-calibration.html",
  },
  arming: {
    copter: "https://ardupilot.org/copter/docs/arming_the_motors.html",
    plane: "https://ardupilot.org/plane/docs/arming-your-plane.html",
    rover: null,
  },
  mandatory_hardware_config: {
    copter: "https://ardupilot.org/copter/docs/configuring-hardware.html",
    plane: "https://ardupilot.org/plane/docs/plane-configuration-landing-page.html",
    rover: "https://ardupilot.org/rover/docs/rover-code-configuration.html",
  },
  simple_super_simple_modes: {
    copter: "https://ardupilot.org/copter/docs/simpleandsuper-simple-modes.html",
    plane: null,
    rover: null,
  },
};

function isCommonTopic(topic: string): topic is CommonTopic {
  return topic in COMMON_TOPICS;
}

function isVehicleSpecificTopic(topic: string): topic is VehicleSpecificTopic {
  return topic in VEHICLE_TOPICS;
}

/**
 * Resolve a docs topic to an authoritative ArduPilot URL.
 *
 * Common topics always return a URL regardless of vehicle slug.
 * Vehicle-specific topics return null when the slug is unknown or
 * when no authoritative page exists for that vehicle family.
 */
export function resolveDocsUrl(
  topic: DocsTopic,
  vehicleSlug?: VehicleSlug | null,
): string | null {
  if (isCommonTopic(topic)) {
    return COMMON_TOPICS[topic];
  }

  if (isVehicleSpecificTopic(topic)) {
    if (!vehicleSlug) return null;
    return VEHICLE_TOPICS[topic][vehicleSlug] ?? null;
  }

  return null;
}

export function isKnownTopic(topic: string): topic is DocsTopic {
  return isCommonTopic(topic) || isVehicleSpecificTopic(topic);
}

export function commonTopics(): CommonTopic[] {
  return Object.keys(COMMON_TOPICS) as CommonTopic[];
}

export function vehicleSpecificTopics(): VehicleSpecificTopic[] {
  return Object.keys(VEHICLE_TOPICS) as VehicleSpecificTopic[];
}
