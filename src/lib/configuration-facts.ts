import { SECTION_IDS, type SectionStatus, type SetupSectionId } from "../hooks/use-setup-sections";
import { isPreArmGood, type SensorHealthDomain } from "../sensor-health";
import type { ConfigurationFactsDomain } from "../configuration-facts";
import type { CalibrationDomain } from "../calibration";
import type { SupportDomain } from "../support";

type CalibrationStep = {
    lifecycle: "not_started" | "running" | "complete" | "failed";
};

type CalibrationState = {
    accel?: CalibrationStep | null;
    compass?: CalibrationStep | null;
    radio?: CalibrationStep | null;
};

type SetupFactsInput = {
    vehicle_type: string | null;
    confirmed_sections: Record<string, boolean>;
    support: SupportDomain | null;
    sensor_health: SensorHealthDomain | null;
    configuration_facts: ConfigurationFactsDomain | null;
    calibration: CalibrationDomain | null;
};

const USER_CONFIRMED_SECTIONS: ReadonlySet<SetupSectionId> = new Set([
    "flight_modes",
    "failsafe",
]);

function statusFromConfigured(flag: { configured: boolean } | null | undefined): SectionStatus {
    if (flag === null || flag === undefined) {
        return "unknown";
    }
    return flag.configured ? "complete" : "not_started";
}

function calibrationStepStatus(step: CalibrationStep | null | undefined): CalibrationStep["lifecycle"] {
    return step?.lifecycle ?? "not_started";
}

function armingStatus(input: Pick<SetupFactsInput, "support" | "sensor_health">): SectionStatus {
    if (input.support?.value?.can_request_prearm_checks === false) {
        return "unknown";
    }

    if (!input.sensor_health?.available || !input.sensor_health.value) {
        return "unknown";
    }

    return isPreArmGood(input.sensor_health.value) ? "complete" : "in_progress";
}

function calibrationSectionStatus(calibration: CalibrationState | null | undefined): SectionStatus {
    if (!calibration) {
        return "unknown";
    }

    const steps = [calibration.accel, calibration.compass, calibration.radio].filter(
        (step): step is CalibrationStep => step != null,
    );

    if (steps.length === 0) {
        return "unknown";
    }

    if (steps.some((step) => step.lifecycle === "failed")) {
        return "failed";
    }

    if (steps.every((step) => step.lifecycle === "complete")) {
        return "complete";
    }

    if (steps.some((step) => step.lifecycle === "running" || step.lifecycle === "complete")) {
        return "in_progress";
    }

    return "not_started";
}

export function deriveSetupSectionStatuses(input: SetupFactsInput): Map<SetupSectionId, SectionStatus> {
    const statuses = new Map<SetupSectionId, SectionStatus>();
    const facts = input.configuration_facts?.value;
    const calibration = input.calibration?.value;

    const radio = calibrationStepStatus(calibration?.radio);

    for (const id of SECTION_IDS) {
        if (USER_CONFIRMED_SECTIONS.has(id)) {
            statuses.set(id, input.confirmed_sections[id] ? "complete" : "not_started");
            continue;
        }

        switch (id) {
            case "frame_orientation":
                statuses.set(id, statusFromConfigured(facts?.frame));
                break;
            case "gps":
                statuses.set(id, statusFromConfigured(facts?.gps));
                break;
            case "battery_monitor":
                statuses.set(id, statusFromConfigured(facts?.battery_monitor));
                break;
            case "motors_esc":
                statuses.set(id, statusFromConfigured(facts?.motors_esc));
                break;
            case "calibration":
                statuses.set(id, calibrationSectionStatus(calibration));
                break;
            case "rc_receiver":
                statuses.set(
                    id,
                    calibration?.radio == null
                        ? "unknown"
                        : radio === "failed"
                            ? "failed"
                            : radio === "complete"
                                ? "complete"
                                : radio === "running"
                                    ? "in_progress"
                                    : "not_started",
                );
                break;
            case "arming":
                statuses.set(id, armingStatus(input));
                break;
            default:
                statuses.set(id, "not_started");
                break;
        }
    }

    return statuses;
}
