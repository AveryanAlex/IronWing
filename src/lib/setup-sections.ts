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
    "flight_modes",
    "failsafe",
    "rtl_return",
    "geofence",
    "arming",
    "initial_params",
]);

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
