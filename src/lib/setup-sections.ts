export type SetupSectionId =
  | "overview"
  | "beginner_wizard"
  | "frame_orientation"
  | "calibration"
  | "rc_receiver"
  | "gps"
  | "battery_monitor"
  | "motors_esc"
  | "servo_outputs"
  | "serial_ports"
  | "flight_modes"
  | "failsafe"
  | "rtl_return"
  | "geofence"
  | "arming"
  | "initial_params"
  | "pid_tuning"
  | "peripherals"
  | "full_parameters";

export type SectionStatus = "unknown" | "not_started" | "in_progress" | "failed" | "complete";

export type OverallProgress = {
  completed: number;
  total: number;
  percentage: number;
};

export type SetupSectionKind = "overview" | "guided" | "recovery";
export type SetupSectionPath =
  | "/setup"
  | "/setup/beginner-wizard"
  | "/setup/frame-orientation"
  | "/setup/calibration"
  | "/setup/rc-receiver"
  | "/setup/gps"
  | "/setup/battery-monitor"
  | "/setup/motors-esc"
  | "/setup/servo-outputs"
  | "/setup/serial-ports"
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
  trackable: boolean;
};

export const SETUP_SECTION_GROUPS: ReadonlyArray<SetupSectionGroupDefinition> = [
  {
    id: "workspace",
    title: "Workspace",
    description: "Start from truthful setup status before moving into expert editors.",
    order: 0,
  },
  {
    id: "hardware",
    title: "Hardware",
    description: "Airframe, sensors, power, outputs, and port ownership stay visible together.",
    order: 1,
  },
  {
    id: "safety",
    title: "Safety & control",
    description: "Receiver, modes, failsafes, return, fence, and arming truth stay explicit.",
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
    title: "Recovery",
    description: "Fallback raw-parameter access when purpose-built cards cannot prove their state.",
    order: 4,
  },
];

export const SETUP_SECTION_CATALOG: ReadonlyArray<SetupSectionDefinition> = [
  {
    id: "overview",
    title: "Overview",
    description: "Grouped setup dashboard with current-scope progress and recovery guidance.",
    kind: "overview",
    groupId: "workspace",
    trackable: false,
  },
  {
    id: "beginner_wizard",
    title: "Beginner Wizard",
    description: "Guided setup for frame, calibration, RC, arming, plus recommended safety basics.",
    kind: "guided",
    groupId: "workspace",
    trackable: true,
  },
  {
    id: "frame_orientation",
    title: "Frame & Orientation",
    description: "Vehicle layout, VTOL ownership, and board orientation truth.",
    kind: "guided",
    groupId: "hardware",
    trackable: true,
  },
  {
    id: "calibration",
    title: "Calibration",
    description: "Sensor lifecycle status with explicit action gating and recovery guidance.",
    kind: "guided",
    groupId: "hardware",
    trackable: true,
  },
  {
    id: "gps",
    title: "GPS",
    description: "Receiver type, GNSS capabilities, and navigation-lock readiness.",
    kind: "guided",
    groupId: "hardware",
    trackable: true,
  },
  {
    id: "battery_monitor",
    title: "Battery Monitor",
    description: "Battery sensor presets, live power truth, and staged monitor configuration.",
    kind: "guided",
    groupId: "hardware",
    trackable: true,
  },
  {
    id: "motors_esc",
    title: "Motors & ESC",
    description: "VTOL motor ownership, direction proof, and fail-closed test readiness.",
    kind: "guided",
    groupId: "hardware",
    trackable: true,
  },
  {
    id: "servo_outputs",
    title: "Servo Outputs",
    description: "Function-aware output inspection, reversal staging, and live readback truth.",
    kind: "guided",
    groupId: "hardware",
    trackable: false,
  },
  {
    id: "serial_ports",
    title: "Serial Ports",
    description: "Protocol ownership, baud choices, and reboot-required port changes.",
    kind: "guided",
    groupId: "hardware",
    trackable: true,
  },
  {
    id: "rc_receiver",
    title: "RC / Receiver",
    description: "Live channel mapping, preset order, and receiver truth.",
    kind: "guided",
    groupId: "safety",
    trackable: true,
  },
  {
    id: "flight_modes",
    title: "Flight Modes",
    description: "Available-mode slots, defaults, and vehicle-aware mode readiness.",
    kind: "guided",
    groupId: "safety",
    trackable: true,
  },
  {
    id: "failsafe",
    title: "Failsafe",
    description: "Loss-of-link behavior and protective defaults for the active vehicle family.",
    kind: "guided",
    groupId: "safety",
    trackable: true,
  },
  {
    id: "rtl_return",
    title: "RTL / Return",
    description: "Return-home altitude, descent, landing, and recovery behavior.",
    kind: "guided",
    groupId: "safety",
    trackable: true,
  },
  {
    id: "geofence",
    title: "Geofence",
    description: "Fence type, boundary behavior, and constrained recovery options.",
    kind: "guided",
    groupId: "safety",
    trackable: true,
  },
  {
    id: "arming",
    title: "Arming",
    description: "Pre-arm blocker truth, request-check support, and arm/disarm recovery guidance.",
    kind: "guided",
    groupId: "safety",
    trackable: true,
  },
  {
    id: "initial_params",
    title: "Initial Parameters",
    description: "Calculator-style startup batches and recommended baseline settings.",
    kind: "guided",
    groupId: "tuning",
    trackable: true,
  },
  {
    id: "pid_tuning",
    title: "PID Tuning",
    description: "Vehicle-aware tuning surfaces without dropping straight into raw parameters.",
    kind: "guided",
    groupId: "tuning",
    trackable: false,
  },
  {
    id: "peripherals",
    title: "Peripherals",
    description: "Curated hardware inventory and configured-only expert accessories view.",
    kind: "guided",
    groupId: "tuning",
    trackable: false,
  },
  {
    id: "full_parameters",
    title: "Full Parameters",
    description: "Shared raw-parameter recovery surface with the shell-owned review tray.",
    kind: "recovery",
    groupId: "recovery",
    trackable: false,
  },
];

export const SECTION_IDS: SetupSectionId[] = SETUP_SECTION_CATALOG.map((section) => section.id);

const SETUP_SECTION_PATHS: Record<SetupSectionId, SetupSectionPath> = {
  overview: "/setup",
  beginner_wizard: "/setup/beginner-wizard",
  frame_orientation: "/setup/frame-orientation",
  calibration: "/setup/calibration",
  rc_receiver: "/setup/rc-receiver",
  gps: "/setup/gps",
  battery_monitor: "/setup/battery-monitor",
  motors_esc: "/setup/motors-esc",
  servo_outputs: "/setup/servo-outputs",
  serial_ports: "/setup/serial-ports",
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

export const TRACKABLE_SECTIONS: ReadonlySet<SetupSectionId> = new Set(
  SETUP_SECTION_CATALOG.filter((section) => section.trackable).map((section) => section.id),
);

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
    description: "Setup section metadata is unavailable for this section.",
    kind: id === "overview" ? "overview" : id === "full_parameters" ? "recovery" : "guided",
    groupId: id === "full_parameters" ? "recovery" : "hardware",
    trackable: TRACKABLE_SECTIONS.has(id),
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

export function computeOverallProgress(
  statuses: Map<SetupSectionId, SectionStatus>,
): OverallProgress {
  let total = 0;
  let completed = 0;
  for (const [id, status] of statuses.entries()) {
    if (!TRACKABLE_SECTIONS.has(id)) continue;
    total++;
    if (status === "complete") completed++;
  }
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { completed, total, percentage };
}
