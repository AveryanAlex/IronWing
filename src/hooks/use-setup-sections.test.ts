import { describe, expect, it } from "vitest";
import {
  computeOverallProgress,
  computeSectionStatuses,
  SECTION_IDS,
  TRACKABLE_SECTIONS,
  type SectionStatus,
  type SetupFactDomains,
  type SetupSectionId,
} from "./use-setup-sections";

function makeFacts(overrides: Partial<SetupFactDomains> = {}): SetupFactDomains {
  return {
    support: { available: false, complete: false, provenance: "stream", value: null },
    sensorHealth: { available: false, complete: false, provenance: "stream", value: null },
    configurationFacts: { available: false, complete: false, provenance: "stream", value: null },
    calibration: { available: false, complete: false, provenance: "stream", value: null },
    ...overrides,
  };
}

describe("computeSectionStatuses", () => {
  it("derives setup progress from backend fact domains", () => {
    const statuses = computeSectionStatuses(makeFacts({
      sensorHealth: {
        available: true,
        complete: true,
        provenance: "stream",
        value: { gyro: "healthy", accel: "healthy", mag: "healthy", baro: "healthy", gps: "healthy", airspeed: "not_present", rc_receiver: "healthy", battery: "healthy", terrain: "not_present", geofence: "not_present" },
      },
      configurationFacts: {
        available: true,
        complete: false,
        provenance: "stream",
        value: {
          frame: { configured: true },
          gps: { configured: true },
          battery_monitor: { configured: true },
          motors_esc: null,
        },
      },
      calibration: {
        available: true,
        complete: false,
        provenance: "stream",
        value: {
          accel: { lifecycle: "complete", progress: null, report: null },
          compass: { lifecycle: "running", progress: null, report: null },
          radio: { lifecycle: "complete", progress: null, report: null },
        },
      },
    }), "quadrotor", {});

    expect(statuses.get("frame_orientation")).toBe("complete");
    expect(statuses.get("gps")).toBe("complete");
    expect(statuses.get("battery_monitor")).toBe("complete");
    expect(statuses.get("motors_esc")).toBe("unknown");
    expect(statuses.get("calibration")).toBe("in_progress");
    expect(statuses.get("rc_receiver")).toBe("complete");
    expect(statuses.get("arming")).toBe("complete");
  });

  it("keeps arming driven by sensor health instead of support capability facts", () => {
    const statuses = computeSectionStatuses(makeFacts({
      support: {
        available: true,
        complete: true,
        provenance: "stream",
        value: {
          can_request_prearm_checks: true,
          can_calibrate_accel: true,
          can_calibrate_compass: true,
          can_calibrate_radio: false,
        },
      },
      sensorHealth: {
        available: true,
        complete: true,
        provenance: "stream",
        value: { gyro: "unhealthy", accel: "healthy", mag: "healthy", baro: "healthy", gps: "healthy", airspeed: "not_present", rc_receiver: "healthy", battery: "healthy", terrain: "not_present", geofence: "not_present" },
      },
    }), "quadrotor", {});

    expect(statuses.get("arming")).toBe("in_progress");
  });

  it("keeps user-confirmed sections frontend-owned", () => {
    const statuses = computeSectionStatuses(makeFacts(), "quadrotor", {
      flight_modes: true,
      failsafe: false,
    });

    expect(statuses.get("flight_modes")).toBe("complete");
    expect(statuses.get("failsafe")).toBe("not_started");
  });

  it("preserves failed calibration and unknown fact status", () => {
    const statuses = computeSectionStatuses(makeFacts({
      support: {
        available: true,
        complete: true,
        provenance: "stream",
        value: {
          can_request_prearm_checks: true,
          can_calibrate_accel: false,
          can_calibrate_compass: true,
          can_calibrate_radio: false,
        },
      },
      configurationFacts: {
        available: true,
        complete: false,
        provenance: "stream",
        value: {
          frame: { configured: true },
          gps: null,
          battery_monitor: null,
          motors_esc: null,
        },
      },
      calibration: {
        available: true,
        complete: false,
        provenance: "stream",
        value: {
          accel: null,
          compass: {
            lifecycle: "failed",
            progress: null,
            report: {
              compass_id: 1,
              status: "failed",
              fitness: 12,
              ofs_x: 1,
              ofs_y: 2,
              ofs_z: 3,
              autosaved: false,
            },
          },
          radio: null,
        },
      },
    }), "quadrotor", {});

    expect(statuses.get("calibration")).toBe("failed");
    expect(statuses.get("motors_esc")).toBe("unknown");
    expect(statuses.get("gps")).toBe("unknown");
  });

  it("returns a status for every section", () => {
    const statuses = computeSectionStatuses(makeFacts(), null, {});
    expect(statuses.size).toBe(SECTION_IDS.length);
    for (const id of SECTION_IDS) {
      expect(statuses.has(id)).toBe(true);
    }
  });
});

describe("computeOverallProgress", () => {
  const TRACKABLE_COUNT = TRACKABLE_SECTIONS.size;

  it("counts only trackable completed sections", () => {
    const statuses = new Map<SetupSectionId, SectionStatus>();
    for (const id of SECTION_IDS) statuses.set(id, "not_started");
    statuses.set("gps", "complete");
    statuses.set("battery_monitor", "complete");
    statuses.set("calibration", "in_progress");

    expect(computeOverallProgress(statuses)).toEqual({
      completed: 2,
      total: TRACKABLE_COUNT,
      percentage: Math.round((2 / TRACKABLE_COUNT) * 100),
    });
  });
});
