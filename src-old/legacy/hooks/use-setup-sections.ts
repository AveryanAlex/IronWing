import { useState, useCallback, useMemo, useEffect } from "react";
import type { CalibrationDomain } from "../calibration";
import type { ConfigurationFactsDomain } from "../configuration-facts";
import { deriveSetupSectionStatuses } from "../lib/configuration-facts";
import type { SensorHealthDomain } from "../sensor-health";
import type { SupportDomain } from "../support";
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
    | "full_parameters";

export type SectionStatus = "unknown" | "not_started" | "in_progress" | "failed" | "complete";

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
];

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
    "serial_ports",
    "flight_modes",  // user-confirmed
    "failsafe",      // user-confirmed
    "rtl_return",    // user-confirmed
    "geofence",      // user-confirmed
    "arming",        // sensorHealth-driven
    "initial_params", // user-confirmed
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

function isSetupSectionId(value: unknown): value is SetupSectionId {
    return typeof value === "string" && (SECTION_IDS as string[]).includes(value);
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

export type SetupFactDomains = {
    support: SupportDomain | null;
    sensorHealth: SensorHealthDomain | null;
    configurationFacts: ConfigurationFactsDomain | null;
    calibration: CalibrationDomain | null;
};

export function computeSectionStatuses(
    facts: SetupFactDomains,
    vehicleType: string | null,
    confirmedSections: Record<string, boolean>,
): Map<SetupSectionId, SectionStatus> {
    return deriveSetupSectionStatuses({
        vehicle_type: vehicleType,
        confirmed_sections: confirmedSections,
        support: facts.support,
        sensor_health: facts.sensorHealth,
        configuration_facts: facts.configurationFacts,
        calibration: facts.calibration,
    });
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
    vehicleState: VehicleState | null,
    facts: SetupFactDomains,
): SetupSectionsReturn {
    const sysId = vehicleState?.system_id ?? 0;
    const vehicleType = vehicleState?.vehicle_type ?? null;
    const key = storageKey(sysId);

    // Active section from persisted or default
    const [activeSection, setActiveSectionRaw] = useState<SetupSectionId>(() => {
        const saved = loadPersisted(storageKey(sysId));
        if (saved && isSetupSectionId(saved.activeSection)) {
            return saved.activeSection;
        }
        return "overview";
    });

    // Sync active section when key changes (vehicle switch)
    useEffect(() => {
        const saved = loadPersisted(key);
        if (saved && isSetupSectionId(saved.activeSection)) {
            setActiveSectionRaw(saved.activeSection);
        } else {
            setActiveSectionRaw("overview");
        }
    }, [key]);

    // Persist active section changes
    useEffect(() => {
        const current = loadPersisted(key) ?? { activeSection: "overview" as SetupSectionId, confirmed: {} };
        current.activeSection = activeSection;
        savePersisted(key, current);
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
        if (isSetupSectionId(id)) {
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
                return next;
            });
        },
        [key, activeSection],
    );

    // Reset all sections
    const resetSections = useCallback(() => {
        localStorage.removeItem(key);
        setActiveSectionRaw("overview");
        setConfirmedSections({});
    }, [key]);

    // Compute statuses
    const sectionStatuses = useMemo(
        () => computeSectionStatuses(facts, vehicleType, confirmedSections),
        [facts, vehicleType, confirmedSections],
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
