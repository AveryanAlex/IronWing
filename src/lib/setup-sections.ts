import { pathFromSvelteKitRouteId } from "./sveltekit-route-path";

export type SetupSectionKind = "overview" | "guided" | "recovery";
export type SetupSectionIconKey =
  | "overview"
  | "frame"
  | "calibration"
  | "receiver"
  | "navigation"
  | "battery"
  | "motors"
  | "servos"
  | "serial"
  | "osd"
  | "flight_modes"
  | "failsafe"
  | "return"
  | "geofence"
  | "arming"
  | "calculator"
  | "tuning"
  | "parameters";

export type SetupSectionGroupId =
  | "workspace"
  | "hardware"
  | "safety"
  | "tuning"
  | "recovery"
  | "other";

export type SetupSectionNavGroupId = "essential" | "hardware" | "safety" | "tuning" | "advanced";

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

type SetupSectionDescriptor = {
  title: string;
  description: string;
  kind: SetupSectionKind;
  path: `/setup${string}`;
  iconKey: SetupSectionIconKey;
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
    title: "Tuning",
    description: "Initial tuning and vehicle-specific PID work.",
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
  { id: "advanced", title: "Advanced", order: 4 },
];

export const SETUP_SECTIONS = {
  overview: {
    title: "Overview",
    description: "Active configuration, pre-arm readiness, safety findings, and parameter file actions.",
    kind: "overview",
    path: "/setup",
    iconKey: "overview",
    implemented: true,
    groupId: "workspace",
    navGroupId: "essential",
    navOrder: 0,
  },
  frame_orientation: {
    title: "Frame & Orientation",
    description: "Vehicle layout, VTOL settings, and board orientation.",
    kind: "guided",
    path: "/setup/frame-orientation",
    iconKey: "frame",
    implemented: true,
    groupId: "hardware",
    navGroupId: "essential",
    navOrder: 1,
  },
  calibration: {
    title: "Calibration",
    description: "Accelerometer, compass, radio, and sensor calibration actions.",
    kind: "guided",
    path: "/setup/calibration",
    iconKey: "calibration",
    implemented: true,
    groupId: "hardware",
    navGroupId: "essential",
    navOrder: 2,
  },
  navigation: {
    title: "Navigation",
    description: "Primary GNSS receiver, compass heading, altitude reference, and navigation guidance settings.",
    kind: "guided",
    path: "/setup/navigation",
    iconKey: "navigation",
    implemented: true,
    groupId: "hardware",
    navGroupId: "hardware",
    navOrder: 0,
  },
  battery_monitor: {
    title: "Battery Monitor",
    description: "Battery monitor presets, live power telemetry, and manual calibration settings.",
    kind: "guided",
    path: "/setup/battery-monitor",
    iconKey: "battery",
    implemented: true,
    groupId: "hardware",
    navGroupId: "hardware",
    navOrder: 1,
  },
  motors_esc: {
    title: "Motors & ESC",
    description: "Motor layout, direction checks, and guarded test readiness.",
    kind: "guided",
    path: "/setup/motors-esc",
    iconKey: "motors",
    implemented: true,
    groupId: "hardware",
    navGroupId: "hardware",
    navOrder: 2,
  },
  servo_outputs: {
    title: "Servo Outputs",
    description: "Function-aware output inspection, reversal staging, and live readback.",
    kind: "guided",
    path: "/setup/servo-outputs",
    iconKey: "servos",
    implemented: true,
    groupId: "hardware",
    navGroupId: "hardware",
    navOrder: 3,
  },
  serial_ports: {
    title: "Serial Ports",
    description: "Serial protocols, baud rates, and reboot-required port changes.",
    kind: "guided",
    path: "/setup/serial-ports",
    iconKey: "serial",
    implemented: true,
    groupId: "hardware",
    navGroupId: "hardware",
    navOrder: 4,
  },
  osd: {
    title: "OSD",
    description: "Configure ArduPilot on-screen display items by screen and grid position.",
    kind: "guided",
    path: "/setup/osd",
    iconKey: "osd",
    implemented: true,
    groupId: "hardware",
    navGroupId: "hardware",
    navOrder: 5,
  },
  rc_receiver: {
    title: "RC / Receiver",
    description: "Live channel mapping, preset order, and receiver motion checks.",
    kind: "guided",
    path: "/setup/rc-receiver",
    iconKey: "receiver",
    implemented: true,
    groupId: "safety",
    navGroupId: "essential",
    navOrder: 3,
  },
  flight_modes: {
    title: "Flight Modes",
    description: "Mode switch channel, six mode slots, and vehicle defaults.",
    kind: "guided",
    path: "/setup/flight-modes",
    iconKey: "flight_modes",
    implemented: true,
    groupId: "safety",
    navGroupId: "essential",
    navOrder: 4,
  },
  failsafe: {
    title: "Failsafe",
    description: "Loss-of-link behavior and protective defaults for the active vehicle family.",
    kind: "guided",
    path: "/setup/failsafe",
    iconKey: "failsafe",
    implemented: true,
    groupId: "safety",
    navGroupId: "safety",
    navOrder: 0,
  },
  rtl_return: {
    title: "RTL / Return",
    description: "Return-home altitude, descent, landing, and final behavior.",
    kind: "guided",
    path: "/setup/rtl-return",
    iconKey: "return",
    implemented: true,
    groupId: "safety",
    navGroupId: "safety",
    navOrder: 1,
  },
  geofence: {
    title: "Geofence",
    description: "Fence type, boundary limits, and breach actions.",
    kind: "guided",
    path: "/setup/geofence",
    iconKey: "geofence",
    implemented: true,
    groupId: "safety",
    navGroupId: "safety",
    navOrder: 2,
  },
  arming: {
    title: "Arming",
    description: "Pre-arm validation selection and arming method safeguards.",
    kind: "guided",
    path: "/setup/arming",
    iconKey: "arming",
    implemented: true,
    groupId: "safety",
    navGroupId: "safety",
    navOrder: 3,
  },
  initial_params: {
    title: "Initial Parameters",
    description: "Calculator-style startup batches and recommended baseline settings.",
    kind: "guided",
    path: "/setup/initial-params",
    iconKey: "calculator",
    implemented: true,
    groupId: "tuning",
    navGroupId: "tuning",
    navOrder: 0,
  },
  pid_tuning: {
    title: "PID Tuning",
    description: "Rate controllers and vehicle-specific tuning groups.",
    kind: "guided",
    path: "/setup/pid-tuning",
    iconKey: "tuning",
    implemented: true,
    groupId: "tuning",
    navGroupId: "tuning",
    navOrder: 1,
  },
  parameters: {
    title: "Parameters",
    description: "Search and edit the complete metadata-driven parameter catalog for the active vehicle.",
    kind: "recovery",
    path: "/setup/parameters",
    iconKey: "parameters",
    implemented: true,
    groupId: "recovery",
    navGroupId: "advanced",
    navOrder: 0,
  },
} as const satisfies Record<string, SetupSectionDescriptor>;

export type SetupSectionId = keyof typeof SETUP_SECTIONS;
export type SetupSectionPath = (typeof SETUP_SECTIONS)[SetupSectionId]["path"];
export type SetupSectionDefinition = {
  [Id in SetupSectionId]: { id: Id } & (typeof SETUP_SECTIONS)[Id];
}[SetupSectionId];

export const SETUP_SECTION_CATALOG: ReadonlyArray<SetupSectionDefinition> = Object.entries(SETUP_SECTIONS).map(
  ([id, descriptor]) => ({ id, ...descriptor }),
) as SetupSectionDefinition[];

export const SECTION_IDS: SetupSectionId[] = Object.keys(SETUP_SECTIONS) as SetupSectionId[];

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
  return SETUP_SECTIONS[sectionId].path;
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
  return SECTION_DEFINITION_MAP.get(id)!;
}

export function getSetupSectionGroupDefinition(groupId: SetupSectionGroupId): SetupSectionGroupDefinition {
  return SECTION_GROUP_MAP.get(groupId) ?? FALLBACK_GROUP;
}

export function getSetupSectionNavGroupDefinition(groupId: SetupSectionNavGroupId): SetupSectionNavGroupDefinition {
  return SECTION_NAV_GROUP_MAP.get(groupId)!;
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
