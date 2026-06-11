import { pathFromSvelteKitRouteId } from "./sveltekit-route-path";

export type SetupSectionId =
  | "overview"
  | "frame_orientation"
  | "calibration"
  | "rc_receiver"
  | "navigation"
  | "battery_monitor"
  | "motors_esc"
  | "servo_outputs"
  | "serial_ports"
  | "osd"
  | "flight_modes"
  | "failsafe"
  | "rtl_return"
  | "geofence"
  | "arming"
  | "initial_params"
  | "pid_tuning"
  | "peripherals"
  | "full_parameters";

export type SetupSectionKind = "overview" | "guided" | "recovery";
export type SetupSectionPath =
  | "/setup"
  | "/setup/frame-orientation"
  | "/setup/calibration"
  | "/setup/rc-receiver"
  | "/setup/navigation"
  | "/setup/battery-monitor"
  | "/setup/motors-esc"
  | "/setup/servo-outputs"
  | "/setup/serial-ports"
  | "/setup/osd"
  | "/setup/flight-modes"
  | "/setup/failsafe"
  | "/setup/rtl-return"
  | "/setup/geofence"
  | "/setup/arming"
  | "/setup/initial-params"
  | "/setup/pid-tuning"
  | "/setup/peripherals"
  | "/setup/full-parameters";

export type SetupSectionGroupId =
  | "workspace"
  | "hardware"
  | "safety"
  | "tuning"
  | "recovery"
  | "other";

export type SetupSectionGroupDefinition = {
  id: SetupSectionGroupId;
  title: string;
  description: string;
  order: number;
};

export type SetupSectionDefinition = {
  id: SetupSectionId;
  title: string;
  description: string;
  kind: SetupSectionKind;
  groupId: Exclude<SetupSectionGroupId, "other">;
};

export const SETUP_SECTION_GROUPS: ReadonlyArray<SetupSectionGroupDefinition> = [
  {
    id: "workspace",
    title: "Workspace",
    description: "Start from the setup dashboard before opening detailed editors.",
    order: 0,
  },
  {
    id: "hardware",
    title: "Hardware",
    description: "Airframe, sensors, power, outputs, and serial connections.",
    order: 1,
  },
  {
    id: "safety",
    title: "Safety & control",
    description: "Receiver, modes, failsafes, return, fence, and arming settings.",
    order: 2,
  },
  {
    id: "tuning",
    title: "Tuning & peripherals",
    description: "Initial tuning, PID work, and payload/peripheral finishing steps.",
    order: 3,
  },
  {
    id: "recovery",
    title: "Advanced",
    description: "Full parameter access for settings not covered by guided cards.",
    order: 4,
  },
];

export const SETUP_SECTION_CATALOG: ReadonlyArray<SetupSectionDefinition> = [
  {
    id: "overview",
    title: "Overview",
    description: "Grouped setup dashboard with current vehicle readiness and next steps.",
    kind: "overview",
    groupId: "workspace",
  },
  {
    id: "frame_orientation",
    title: "Frame & Orientation",
    description: "Vehicle layout, VTOL settings, and board orientation.",
    kind: "guided",
    groupId: "hardware",
  },
  {
    id: "calibration",
    title: "Calibration",
    description: "Accelerometer, compass, radio, and sensor calibration actions.",
    kind: "guided",
    groupId: "hardware",
  },
  {
    id: "navigation",
    title: "Navigation",
    description: "Primary GNSS receiver, compass heading, altitude reference, and navigation guidance settings.",
    kind: "guided",
    groupId: "hardware",
  },
  {
    id: "battery_monitor",
    title: "Battery Monitor",
    description: "Battery monitor presets, live power telemetry, and manual calibration settings.",
    kind: "guided",
    groupId: "hardware",
  },
  {
    id: "motors_esc",
    title: "Motors & ESC",
    description: "Motor layout, direction checks, and guarded test readiness.",
    kind: "guided",
    groupId: "hardware",
  },
  {
    id: "servo_outputs",
    title: "Servo Outputs",
    description: "Function-aware output inspection, reversal staging, and live readback.",
    kind: "guided",
    groupId: "hardware",
  },
  {
    id: "serial_ports",
    title: "Serial Ports",
    description: "Serial protocols, baud rates, and reboot-required port changes.",
    kind: "guided",
    groupId: "hardware",
  },
  {
    id: "osd",
    title: "OSD",
    description: "Configure ArduPilot on-screen display items by screen and grid position.",
    kind: "guided",
    groupId: "hardware",
  },
  {
    id: "rc_receiver",
    title: "RC / Receiver",
    description: "Live channel mapping, preset order, and receiver motion checks.",
    kind: "guided",
    groupId: "safety",
  },
  {
    id: "flight_modes",
    title: "Flight Modes",
    description: "Mode switch channel, six mode slots, and vehicle defaults.",
    kind: "guided",
    groupId: "safety",
  },
  {
    id: "failsafe",
    title: "Failsafe",
    description: "Loss-of-link behavior and protective defaults for the active vehicle family.",
    kind: "guided",
    groupId: "safety",
  },
  {
    id: "rtl_return",
    title: "RTL / Return",
    description: "Return-home altitude, descent, landing, and final behavior.",
    kind: "guided",
    groupId: "safety",
  },
  {
    id: "geofence",
    title: "Geofence",
    description: "Fence type, boundary limits, and breach actions.",
    kind: "guided",
    groupId: "safety",
  },
  {
    id: "arming",
    title: "Arming",
    description: "Pre-arm checks, current blockers, and arm/disarm controls.",
    kind: "guided",
    groupId: "safety",
  },
  {
    id: "initial_params",
    title: "Initial Parameters",
    description: "Calculator-style startup batches and recommended baseline settings.",
    kind: "guided",
    groupId: "tuning",
  },
  {
    id: "pid_tuning",
    title: "PID Tuning",
    description: "Rate controllers and vehicle-specific tuning groups.",
    kind: "guided",
    groupId: "tuning",
  },
  {
    id: "peripherals",
    title: "Peripherals",
    description: "Optional hardware families and configured peripheral settings.",
    kind: "guided",
    groupId: "tuning",
  },
  {
    id: "full_parameters",
    title: "Full Parameters",
    description: "Search and edit the complete parameter catalog for the active vehicle.",
    kind: "recovery",
    groupId: "recovery",
  },
];

export const SECTION_IDS: SetupSectionId[] = SETUP_SECTION_CATALOG.map((section) => section.id);

const SETUP_SECTION_PATHS: Record<SetupSectionId, SetupSectionPath> = {
  overview: "/setup",
  frame_orientation: "/setup/frame-orientation",
  calibration: "/setup/calibration",
  rc_receiver: "/setup/rc-receiver",
  navigation: "/setup/navigation",
  battery_monitor: "/setup/battery-monitor",
  motors_esc: "/setup/motors-esc",
  servo_outputs: "/setup/servo-outputs",
  serial_ports: "/setup/serial-ports",
  osd: "/setup/osd",
  flight_modes: "/setup/flight-modes",
  failsafe: "/setup/failsafe",
  rtl_return: "/setup/rtl-return",
  geofence: "/setup/geofence",
  arming: "/setup/arming",
  initial_params: "/setup/initial-params",
  pid_tuning: "/setup/pid-tuning",
  peripherals: "/setup/peripherals",
  full_parameters: "/setup/full-parameters",
};

export function isSetupSectionId(value: string): value is SetupSectionId {
  return SECTION_IDS.includes(value as SetupSectionId);
}

export function setupSectionSlug(sectionId: SetupSectionId): string {
  return sectionId.replace(/_/g, "-");
}

export function setupSectionIdFromSlug(slug: string): SetupSectionId | null {
  const normalizedSlug = slug.trim().toLowerCase();
  if (normalizedSlug.length === 0) {
    return null;
  }

  const candidate = normalizedSlug.replace(/-/g, "_");
  return isSetupSectionId(candidate) ? candidate : null;
}

export function setupSectionPath(sectionId: SetupSectionId): SetupSectionPath {
  return SETUP_SECTION_PATHS[sectionId];
}

export function setupSectionForPath(pathname: string): SetupSectionId | null {
  const normalizedPath = normalizeSetupPath(pathname);
  if (normalizedPath === "/setup") {
    return "overview";
  }

  const prefix = "/setup/";
  if (!normalizedPath.startsWith(prefix)) {
    return null;
  }

  const slug = normalizedPath.slice(prefix.length);
  if (slug.includes("/")) {
    return null;
  }

  const sectionId = setupSectionIdFromSlug(slug);
  return sectionId === "overview" ? null : sectionId;
}

export function setupSectionForRouteId(routeId: string | null | undefined): SetupSectionId | null {
  const pathname = pathFromSvelteKitRouteId(routeId);
  return pathname ? setupSectionForPath(pathname) : null;
}

function normalizeSetupPath(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

const SECTION_DEFINITION_MAP = new Map(SETUP_SECTION_CATALOG.map((section) => [section.id, section]));
const SECTION_GROUP_MAP = new Map(SETUP_SECTION_GROUPS.map((group) => [group.id, group]));

const FALLBACK_GROUP: SetupSectionGroupDefinition = {
  id: "other",
  title: "Other setup",
  description: "Fallback group used when a section is missing explicit group metadata.",
  order: Number.MAX_SAFE_INTEGER,
};

export function getSetupSectionDefinition(id: SetupSectionId): SetupSectionDefinition {
  return SECTION_DEFINITION_MAP.get(id) ?? {
    id,
    title: id,
    description: "Setup section details are unavailable for this section.",
    kind: id === "overview" ? "overview" : id === "full_parameters" ? "recovery" : "guided",
    groupId: id === "full_parameters" ? "recovery" : "hardware",
  };
}

export function getSetupSectionGroupDefinition(groupId: SetupSectionGroupId): SetupSectionGroupDefinition {
  return SECTION_GROUP_MAP.get(groupId) ?? FALLBACK_GROUP;
}

export type GroupedSetupSections<TSection> = {
  group: SetupSectionGroupDefinition;
  sections: TSection[];
};

export function groupSetupSections<TSection extends { id: SetupSectionId }>(
  sections: readonly TSection[],
): GroupedSetupSections<TSection>[] {
  const grouped = new Map<SetupSectionGroupId, GroupedSetupSections<TSection>>();

  for (const section of sections) {
    const definition = getSetupSectionDefinition(section.id);
    const group = getSetupSectionGroupDefinition(definition.groupId);
    const existing = grouped.get(group.id);

    if (existing) {
      existing.sections.push(section);
      continue;
    }

    grouped.set(group.id, {
      group,
      sections: [section],
    });
  }

  return [...grouped.values()].sort((left, right) => left.group.order - right.group.order);
}
