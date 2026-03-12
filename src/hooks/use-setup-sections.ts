import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import type { ParamStore } from "../params";
import type { SensorHealth } from "../sensor-health";
import type { VehicleState } from "../telemetry";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SetupSectionId =
  | "overview"
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
  | "full_parameters"
  | "firmware";

export type SectionStatus = "not_started" | "in_progress" | "complete";

export type OverallProgress = {
  completed: number;
  total: number;
  percentage: number;
};

// ---------------------------------------------------------------------------
// Section definitions
// ---------------------------------------------------------------------------

export const SECTION_IDS: SetupSectionId[] = [
  "overview",
  "frame_orientation",
  "calibration",
  "rc_receiver",
  "gps",
  "battery_monitor",
  "motors_esc",
  "servo_outputs",
  "serial_ports",
  "flight_modes",
  "failsafe",
  "rtl_return",
  "geofence",
  "arming",
  "initial_params",
  "pid_tuning",
  "peripherals",
  "full_parameters",
  "firmware",
];

// Sections whose completion is user-confirmed via localStorage
const USER_CONFIRMED_SECTIONS: ReadonlySet<SetupSectionId> = new Set([
  "flight_modes",
  "failsafe",
]);

/**
 * Sections that have an actual completion path (param heuristic, sensor check,
 * or user confirmation). Only these count toward overallProgress totals.
 * The remaining sections still appear in sectionStatuses but are excluded
 * from progress because they have no completion logic in this branch.
 */
export const TRACKABLE_SECTIONS: ReadonlySet<SetupSectionId> = new Set([
  "frame_orientation",
  "calibration",
  "rc_receiver",
  "gps",
  "battery_monitor",
  "motors_esc",
  "flight_modes",  // user-confirmed
  "failsafe",      // user-confirmed
  "arming",        // sensorHealth-driven
]);

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

type PersistedSections = {
  activeSection: SetupSectionId;
  confirmed: Record<string, boolean>;
};

function storageKey(sysId: number): string {
  return `ironwing_setup_section_${sysId}`;
}

function loadPersisted(key: string): PersistedSections | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedSections;
  } catch {
    return null;
  }
}

function savePersisted(key: string, data: PersistedSections): void {
  localStorage.setItem(key, JSON.stringify(data));
}

// ---------------------------------------------------------------------------
// Param helper
// ---------------------------------------------------------------------------

type ParamMap = Record<string, { value: number }>;

function paramValue(params: ParamMap | null, name: string): number | null {
  if (!params) return null;
  return params[name]?.value ?? null;
}

// ---------------------------------------------------------------------------
// Pure completion heuristics
// ---------------------------------------------------------------------------

/**
 * Compute the completion status for each section based on param values,
 * sensor health, vehicle type, and user-confirmed localStorage flags.
 *
 * Exported for testing — pure function, no React dependency.
 */
export function computeSectionStatuses(
  params: ParamMap | null,
  sensorHealth: SensorHealth | null,
  vehicleType: string | null,
  confirmedSections: Record<string, boolean>,
): Map<SetupSectionId, SectionStatus> {
  const statuses = new Map<SetupSectionId, SectionStatus>();
  const p = (name: string) => paramValue(params, name);

  for (const id of SECTION_IDS) {
    // User-confirmed sections (localStorage only)
    if (USER_CONFIRMED_SECTIONS.has(id)) {
      statuses.set(id, confirmedSections[id] ? "complete" : "not_started");
      continue;
    }

    switch (id) {
      case "frame_orientation": {
        // Plane is always complete (no frame class needed); copter needs FRAME_CLASS > 0
        const isPlane = vehicleType === "fixed_wing";
        if (isPlane) {
          statuses.set(id, "complete");
        } else {
          const frameClass = p("FRAME_CLASS") ?? 0;
          statuses.set(id, frameClass > 0 ? "complete" : "not_started");
        }
        break;
      }

      case "calibration": {
        // Accel offsets ≠ 0
        const accelDone =
          (p("INS_ACCOFFS_X") ?? 0) !== 0 ||
          (p("INS_ACCOFFS_Y") ?? 0) !== 0 ||
          (p("INS_ACCOFFS_Z") ?? 0) !== 0;
        // Compass offsets ≠ 0
        const compassDone =
          (p("COMPASS_OFS_X") ?? 0) !== 0 ||
          (p("COMPASS_OFS_Y") ?? 0) !== 0 ||
          (p("COMPASS_OFS_Z") ?? 0) !== 0;
        // RC calibrated (RC1_MIN != default 1100)
        const radioDone =
          (p("RC1_MIN") ?? 1100) < (p("RC1_MAX") ?? 1900) &&
          (p("RC1_MIN") ?? 1100) !== 1100;

        if (accelDone && compassDone && radioDone) {
          statuses.set(id, "complete");
        } else if (accelDone || compassDone || radioDone) {
          statuses.set(id, "in_progress");
        } else {
          statuses.set(id, "not_started");
        }
        break;
      }

      case "gps": {
        // GPS1_TYPE > 0 (newer firmware) or GPS_TYPE > 0 (older firmware)
        const gps1Type = p("GPS1_TYPE");
        const gpsType = p("GPS_TYPE");
        const gpsConfigured = (gps1Type !== null && gps1Type > 0) || (gpsType !== null && gpsType > 0);
        statuses.set(id, gpsConfigured ? "complete" : "not_started");
        break;
      }

      case "battery_monitor": {
        const battMonitor = p("BATT_MONITOR") ?? 0;
        statuses.set(id, battMonitor > 0 ? "complete" : "not_started");
        break;
      }

      case "motors_esc": {
        // Motors auto-assigned when FRAME_CLASS > 0
        const frameClass = p("FRAME_CLASS") ?? 0;
        statuses.set(id, frameClass > 0 ? "complete" : "not_started");
        break;
      }

      case "rc_receiver": {
        // RC calibrated if RC1_MIN != 1100 (default)
        const rc1Min = p("RC1_MIN") ?? 1100;
        statuses.set(id, rc1Min !== 1100 ? "complete" : "not_started");
        break;
      }

      case "arming": {
        if (sensorHealth?.pre_arm_good) {
          statuses.set(id, "complete");
        } else if (sensorHealth !== null) {
          statuses.set(id, "in_progress");
        } else {
          statuses.set(id, "not_started");
        }
        break;
      }

      default:
        // Sections without param-derived heuristics
        statuses.set(id, "not_started");
        break;
    }
  }

  return statuses;
}

/**
 * Compute overall progress from section statuses.
 * Exported for testing — pure function.
 */
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

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export type SetupSectionsReturn = {
  activeSection: SetupSectionId;
  setActiveSection: (id: SetupSectionId) => void;
  sectionStatuses: Map<SetupSectionId, SectionStatus>;
  overallProgress: OverallProgress;
  confirmSection: (id: SetupSectionId) => void;
  resetSections: () => void;
};

export function useSetupSections(
  params: { paramStore: ParamStore | null },
  vehicleState: VehicleState | null,
  sensorHealth: SensorHealth | null,
): SetupSectionsReturn {
  const sysId = vehicleState?.system_id ?? 0;
  const vehicleType = vehicleState?.vehicle_type ?? null;
  const key = storageKey(sysId);

  // Load persisted state
  const persisted = useRef<PersistedSections | null>(null);
  useEffect(() => {
    persisted.current = loadPersisted(key);
  }, [key]);

  // Active section from persisted or default
  const [activeSection, setActiveSectionRaw] = useState<SetupSectionId>(() => {
    const saved = loadPersisted(storageKey(sysId));
    if (saved && (SECTION_IDS as string[]).includes(saved.activeSection)) {
      return saved.activeSection;
    }
    return "overview";
  });

  // Sync active section when key changes (vehicle switch)
  const prevKeyRef = useRef(key);
  useEffect(() => {
    if (prevKeyRef.current !== key) {
      prevKeyRef.current = key;
      const saved = loadPersisted(key);
      if (saved && (SECTION_IDS as string[]).includes(saved.activeSection)) {
        setActiveSectionRaw(saved.activeSection);
      } else {
        setActiveSectionRaw("overview");
      }
    }
  }, [key]);

  // Persist active section changes
  useEffect(() => {
    const current = loadPersisted(key) ?? { activeSection: "overview" as SetupSectionId, confirmed: {} };
    current.activeSection = activeSection;
    savePersisted(key, current);
    persisted.current = current;
  }, [activeSection, key]);

  // Confirmed sections from localStorage
  const [confirmedSections, setConfirmedSections] = useState<Record<string, boolean>>(() => {
    const saved = loadPersisted(storageKey(sysId));
    return saved?.confirmed ?? {};
  });

  // Sync confirmed sections when key changes
  useEffect(() => {
    const saved = loadPersisted(key);
    setConfirmedSections(saved?.confirmed ?? {});
  }, [key]);

  // Navigation
  const setActiveSection = useCallback((id: SetupSectionId) => {
    if ((SECTION_IDS as string[]).includes(id)) {
      setActiveSectionRaw(id);
    }
  }, []);

  // Confirm a section (user-driven, for user-confirmed sections)
  const confirmSection = useCallback(
    (id: SetupSectionId) => {
      setConfirmedSections((prev) => {
        const next = { ...prev, [id]: true };
        const current = loadPersisted(key) ?? { activeSection, confirmed: {} };
        current.confirmed = next;
        savePersisted(key, current);
        persisted.current = current;
        return next;
      });
    },
    [key, activeSection],
  );

  // Reset all sections
  const resetSections = useCallback(() => {
    localStorage.removeItem(key);
    persisted.current = null;
    setActiveSectionRaw("overview");
    setConfirmedSections({});
  }, [key]);

  // Compute statuses
  const paramMap = params.paramStore?.params ?? null;
  const sectionStatuses = useMemo(
    () => computeSectionStatuses(paramMap, sensorHealth, vehicleType, confirmedSections),
    [paramMap, sensorHealth, vehicleType, confirmedSections],
  );

  const overallProgress = useMemo(
    () => computeOverallProgress(sectionStatuses),
    [sectionStatuses],
  );

  return {
    activeSection,
    setActiveSection,
    sectionStatuses,
    overallProgress,
    confirmSection,
    resetSections,
  };
}
