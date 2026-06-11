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

export type SetupSectionNavGroupId = "essential" | "hardware" | "safety" | "tuning" | "peripherals";

export type SetupSectionGroupDefinition = {
  id: SetupSectionGroupId;
  title: string;
  description: string;
  order: number;
};

export type SetupSectionNavGroupDefinition = {
  id: SetupSectionNavGroupId;
  title: string;
  order: number;
};

export type SetupSectionDefinition = {
  id: SetupSectionId;
  title: string;
  description: string;
  kind: SetupSectionKind;
  path: SetupSectionPath;
  implemented: boolean;
  groupId: Exclude<SetupSectionGroupId, "other">;
  navGroupId: SetupSectionNavGroupId;
  navOrder: number;
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

export const SETUP_SECTION_NAV_GROUPS: ReadonlyArray<SetupSectionNavGroupDefinition> = [
  { id: "essential", title: "Essential Setup", order: 0 },
  { id: "hardware", title: "Hardware", order: 1 },
  { id: "safety", title: "Safety", order: 2 },
  { id: "tuning", title: "Tuning", order: 3 },
  { id: "peripherals", title: "Peripherals", order: 4 },
];

export const SETUP_SECTION_CATALOG: ReadonlyArray<SetupSectionDefinition> = [
  {
    id: "overview",
    title: "Overview",
    description: "Grouped setup dashboard with current vehicle readiness and next steps.",
    kind: "overview",
    path: "/setup",
    implemented: true,
    groupId: "workspace",
    navGroupId: "essential",
    navOrder: 0,
  },
  {
    id: "frame_orientation",
    title: "Frame & Orientation",
    description: "Vehicle layout, VTOL settings, and board orientation.",
    kind: "guided",
    path: "/setup/frame-orientation",
    implemented: true,
    groupId: "hardware",
    navGroupId: "essential",
    navOrder: 1,
  },
  {
    id: "calibration",
    title: "Calibration",
    description: "Accelerometer, compass, radio, and sensor calibration actions.",
    kind: "guided",
    path: "/setup/calibration",
    implemented: true,
    groupId: "hardware",
    navGroupId: "essential",
    navOrder: 2,
  },
  {
    id: "navigation",
    title: "Navigation",
    description: "Primary GNSS receiver, compass heading, altitude reference, and navigation guidance settings.",
    kind: "guided",
    path: "/setup/navigation",
    implemented: true,
    groupId: "hardware",
    navGroupId: "hardware",
    navOrder: 0,
  },
  {
    id: "battery_monitor",
    title: "Battery Monitor",
    description: "Battery monitor presets, live power telemetry, and manual calibration settings.",
    kind: "guided",
    path: "/setup/battery-monitor",
    implemented: true,
    groupId: "hardware",
    navGroupId: "hardware",
    navOrder: 1,
  },
  {
    id: "motors_esc",
    title: "Motors & ESC",
    description: "Motor layout, direction checks, and guarded test readiness.",
    kind: "guided",
    path: "/setup/motors-esc",
    implemented: true,
    groupId: "hardware",
    navGroupId: "hardware",
    navOrder: 2,
  },
  {
    id: "servo_outputs",
    title: "Servo Outputs",
    description: "Function-aware output inspection, reversal staging, and live readback.",
    kind: "guided",
    path: "/setup/servo-outputs",
    implemented: true,
    groupId: "hardware",
    navGroupId: "hardware",
    navOrder: 3,
  },
  {
    id: "serial_ports",
    title: "Serial Ports",
    description: "Serial protocols, baud rates, and reboot-required port changes.",
    kind: "guided",
    path: "/setup/serial-ports",
    implemented: true,
    groupId: "hardware",
    navGroupId: "hardware",
    navOrder: 4,
  },
  {
    id: "osd",
    title: "OSD",
    description: "Configure ArduPilot on-screen display items by screen and grid position.",
    kind: "guided",
    path: "/setup/osd",
    implemented: true,
    groupId: "hardware",
    navGroupId: "hardware",
    navOrder: 5,
  },
  {
    id: "rc_receiver",
    title: "RC / Receiver",
    description: "Live channel mapping, preset order, and receiver motion checks.",
    kind: "guided",
    path: "/setup/rc-receiver",
    implemented: true,
    groupId: "safety",
    navGroupId: "essential",
    navOrder: 3,
  },
  {
    id: "flight_modes",
    title: "Flight Modes",
    description: "Mode switch channel, six mode slots, and vehicle defaults.",
    kind: "guided",
    path: "/setup/flight-modes",
    implemented: true,
    groupId: "safety",
    navGroupId: "essential",
    navOrder: 4,
  },
  {
    id: "failsafe",
    title: "Failsafe",
    description: "Loss-of-link behavior and protective defaults for the active vehicle family.",
    kind: "guided",
    path: "/setup/failsafe",
    implemented: true,
    groupId: "safety",
    navGroupId: "safety",
    navOrder: 0,
  },
  {
    id: "rtl_return",
    title: "RTL / Return",
    description: "Return-home altitude, descent, landing, and final behavior.",
    kind: "guided",
    path: "/setup/rtl-return",
    implemented: true,
    groupId: "safety",
    navGroupId: "safety",
    navOrder: 1,
  },
  {
    id: "geofence",
    title: "Geofence",
    description: "Fence type, boundary limits, and breach actions.",
    kind: "guided",
    path: "/setup/geofence",
    implemented: true,
    groupId: "safety",
    navGroupId: "safety",
    navOrder: 2,
  },
  {
    id: "arming",
    title: "Arming",
    description: "Pre-arm checks, current blockers, and arm/disarm controls.",
    kind: "guided",
    path: "/setup/arming",
    implemented: true,
    groupId: "safety",
    navGroupId: "safety",
    navOrder: 3,
  },
  {
    id: "initial_params",
    title: "Initial Parameters",
    description: "Calculator-style startup batches and recommended baseline settings.",
    kind: "guided",
    path: "/setup/initial-params",
    implemented: true,
    groupId: "tuning",
    navGroupId: "tuning",
    navOrder: 0,
  },
  {
    id: "pid_tuning",
    title: "PID Tuning",
    description: "Rate controllers and vehicle-specific tuning groups.",
    kind: "guided",
    path: "/setup/pid-tuning",
    implemented: true,
    groupId: "tuning",
    navGroupId: "tuning",
    navOrder: 1,
  },
  {
    id: "peripherals",
    title: "Peripherals",
    description: "Optional hardware families and configured peripheral settings.",
    kind: "guided",
    path: "/setup/peripherals",
    implemented: true,
    groupId: "tuning",
    navGroupId: "peripherals",
    navOrder: 0,
  },
  {
    id: "full_parameters",
    title: "Full Parameters",
    description: "Search and edit the complete parameter catalog for the active vehicle.",
    kind: "recovery",
    path: "/setup/full-parameters",
    implemented: true,
    groupId: "recovery",
    navGroupId: "peripherals",
    navOrder: 1,
  },
];

export const SECTION_IDS: SetupSectionId[] = SETUP_SECTION_CATALOG.map((section) => section.id);

const SETUP_SECTION_PATHS = Object.fromEntries(
  SETUP_SECTION_CATALOG.map((section) => [section.id, section.path]),
) as Record<SetupSectionId, SetupSectionPath>;

const SETUP_SECTION_IDS_BY_PATH = new Map(
  SETUP_SECTION_CATALOG.map((section) => [section.path, section.id]),
);

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
  return SETUP_SECTION_IDS_BY_PATH.get(normalizedPath as SetupSectionPath) ?? null;
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
const SECTION_NAV_GROUP_MAP = new Map(SETUP_SECTION_NAV_GROUPS.map((group) => [group.id, group]));

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
    path: id === "overview" ? "/setup" : `/setup/${setupSectionSlug(id)}` as SetupSectionPath,
    implemented: false,
    groupId: id === "full_parameters" ? "recovery" : "hardware",
    navGroupId: id === "full_parameters" ? "peripherals" : "hardware",
    navOrder: Number.MAX_SAFE_INTEGER,
  };
}

export function getSetupSectionGroupDefinition(groupId: SetupSectionGroupId): SetupSectionGroupDefinition {
  return SECTION_GROUP_MAP.get(groupId) ?? FALLBACK_GROUP;
}

export function getSetupSectionNavGroupDefinition(groupId: SetupSectionNavGroupId): SetupSectionNavGroupDefinition {
  return SECTION_NAV_GROUP_MAP.get(groupId) ?? {
    id: groupId,
    title: groupId,
    order: Number.MAX_SAFE_INTEGER,
  };
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

export type SetupSectionNavigationGroup<TSection> = {
  id: SetupSectionNavGroupId;
  title: string;
  sections: TSection[];
};

export function groupSetupSectionNavigation<TSection extends { id: SetupSectionId }>(
  sections: readonly TSection[],
): SetupSectionNavigationGroup<TSection>[] {
  const grouped = new Map<SetupSectionNavGroupId, SetupSectionNavigationGroup<TSection> & { order: number }>();

  for (const section of sections) {
    const definition = getSetupSectionDefinition(section.id);
    const group = getSetupSectionNavGroupDefinition(definition.navGroupId);
    const existing = grouped.get(group.id);

    if (existing) {
      existing.sections.push(section);
      continue;
    }

    grouped.set(group.id, {
      id: group.id,
      title: group.title,
      order: group.order,
      sections: [section],
    });
  }

  return [...grouped.values()]
    .map((group) => ({
      id: group.id,
      title: group.title,
      order: group.order,
      sections: [...group.sections].sort((left, right) => {
        const leftDefinition = getSetupSectionDefinition(left.id);
        const rightDefinition = getSetupSectionDefinition(right.id);
        return leftDefinition.navOrder - rightDefinition.navOrder;
      }),
    }))
    .sort((left, right) => left.order - right.order)
    .map(({ order: _order, ...group }) => group);
}
