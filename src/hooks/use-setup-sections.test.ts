import { describe, it, expect } from "vitest";
import {
  computeSectionStatuses,
  computeOverallProgress,
  SECTION_IDS,
  TRACKABLE_SECTIONS,
  type SetupSectionId,
  type SectionStatus,
} from "./use-setup-sections";

type ParamMap = Record<string, { value: number }>;

function makeParams(entries: Record<string, number>): ParamMap {
  const map: ParamMap = {};
  for (const [name, value] of Object.entries(entries)) {
    map[name] = { value };
  }
  return map;
}

describe("computeSectionStatuses", () => {
  describe("frame_orientation", () => {
    it('returns "complete" when FRAME_CLASS > 0 (copter)', () => {
      const statuses = computeSectionStatuses(
        makeParams({ FRAME_CLASS: 1 }),
        null,
        "quadrotor",
        {},
      );
      expect(statuses.get("frame_orientation")).toBe("complete");
    });

    it('returns "complete" always for plane vehicle type', () => {
      const statuses = computeSectionStatuses(
        makeParams({ FRAME_CLASS: 0 }),
        null,
        "fixed_wing",
        {},
      );
      expect(statuses.get("frame_orientation")).toBe("complete");
    });

    it('returns "not_started" when FRAME_CLASS is 0 for copter', () => {
      const statuses = computeSectionStatuses(
        makeParams({ FRAME_CLASS: 0 }),
        null,
        "quadrotor",
        {},
      );
      expect(statuses.get("frame_orientation")).toBe("not_started");
    });
  });

  describe("calibration", () => {
    it('returns "complete" when accel, compass, and RC are all calibrated', () => {
      const statuses = computeSectionStatuses(
        makeParams({
          INS_ACCOFFS_X: 0.5,
          COMPASS_OFS_X: 10,
          RC1_MIN: 1000,
          RC1_MAX: 2000,
        }),
        null,
        null,
        {},
      );
      expect(statuses.get("calibration")).toBe("complete");
    });

    it('returns "in_progress" when only accel is calibrated', () => {
      const statuses = computeSectionStatuses(
        makeParams({ INS_ACCOFFS_X: 0.5 }),
        null,
        null,
        {},
      );
      expect(statuses.get("calibration")).toBe("in_progress");
    });

    it('returns "not_started" when nothing is calibrated', () => {
      const statuses = computeSectionStatuses(
        makeParams({}),
        null,
        null,
        {},
      );
      expect(statuses.get("calibration")).toBe("not_started");
    });
  });

  describe("gps", () => {
    it('returns "complete" when GPS1_TYPE > 0', () => {
      const statuses = computeSectionStatuses(
        makeParams({ GPS1_TYPE: 1 }),
        null,
        null,
        {},
      );
      expect(statuses.get("gps")).toBe("complete");
    });

    it('returns "complete" when GPS_TYPE > 0 (older firmware)', () => {
      const statuses = computeSectionStatuses(
        makeParams({ GPS_TYPE: 2 }),
        null,
        null,
        {},
      );
      expect(statuses.get("gps")).toBe("complete");
    });

    it('returns "not_started" when GPS1_TYPE === 0', () => {
      const statuses = computeSectionStatuses(
        makeParams({ GPS1_TYPE: 0 }),
        null,
        null,
        {},
      );
      expect(statuses.get("gps")).toBe("not_started");
    });

    it('returns "not_started" when no GPS params present', () => {
      const statuses = computeSectionStatuses(
        makeParams({}),
        null,
        null,
        {},
      );
      expect(statuses.get("gps")).toBe("not_started");
    });
  });

  describe("battery_monitor", () => {
    it('returns "complete" when BATT_MONITOR > 0', () => {
      const statuses = computeSectionStatuses(
        makeParams({ BATT_MONITOR: 3 }),
        null,
        null,
        {},
      );
      expect(statuses.get("battery_monitor")).toBe("complete");
    });

    it('returns "not_started" when BATT_MONITOR is 0', () => {
      const statuses = computeSectionStatuses(
        makeParams({ BATT_MONITOR: 0 }),
        null,
        null,
        {},
      );
      expect(statuses.get("battery_monitor")).toBe("not_started");
    });
  });

  describe("motors_esc", () => {
    it('returns "complete" when FRAME_CLASS > 0', () => {
      const statuses = computeSectionStatuses(
        makeParams({ FRAME_CLASS: 2 }),
        null,
        null,
        {},
      );
      expect(statuses.get("motors_esc")).toBe("complete");
    });

    it('returns "not_started" when FRAME_CLASS is 0', () => {
      const statuses = computeSectionStatuses(
        makeParams({ FRAME_CLASS: 0 }),
        null,
        null,
        {},
      );
      expect(statuses.get("motors_esc")).toBe("not_started");
    });
  });

  describe("rc_receiver", () => {
    it('returns "complete" when RC1_MIN !== 1100 (calibrated)', () => {
      const statuses = computeSectionStatuses(
        makeParams({ RC1_MIN: 1000 }),
        null,
        null,
        {},
      );
      expect(statuses.get("rc_receiver")).toBe("complete");
    });

    it('returns "not_started" when RC1_MIN is default 1100', () => {
      const statuses = computeSectionStatuses(
        makeParams({ RC1_MIN: 1100 }),
        null,
        null,
        {},
      );
      expect(statuses.get("rc_receiver")).toBe("not_started");
    });
  });

  describe("user-confirmed sections", () => {
    it('returns "complete" for flight_modes when confirmed', () => {
      const statuses = computeSectionStatuses(
        makeParams({}),
        null,
        null,
        { flight_modes: true },
      );
      expect(statuses.get("flight_modes")).toBe("complete");
    });

    it('returns "not_started" for flight_modes when not confirmed', () => {
      const statuses = computeSectionStatuses(
        makeParams({}),
        null,
        null,
        {},
      );
      expect(statuses.get("flight_modes")).toBe("not_started");
    });

    it('returns "complete" for failsafe when confirmed', () => {
      const statuses = computeSectionStatuses(
        makeParams({}),
        null,
        null,
        { failsafe: true },
      );
      expect(statuses.get("failsafe")).toBe("complete");
    });
  });

  describe("arming (sensorHealth-driven)", () => {
    it('returns "complete" when pre_arm_good is true', () => {
      const statuses = computeSectionStatuses(
        makeParams({}),
        { sensors: [], pre_arm_good: true },
        null,
        {},
      );
      expect(statuses.get("arming")).toBe("complete");
    });

    it('returns "in_progress" when sensorHealth exists but pre_arm_good is false', () => {
      const statuses = computeSectionStatuses(
        makeParams({}),
        { sensors: [], pre_arm_good: false },
        null,
        {},
      );
      expect(statuses.get("arming")).toBe("in_progress");
    });

    it('returns "not_started" when sensorHealth is null', () => {
      const statuses = computeSectionStatuses(makeParams({}), null, null, {});
      expect(statuses.get("arming")).toBe("not_started");
    });
  });

  describe("sections without heuristics", () => {
    it('returns "not_started" for sections without param-derived heuristics', () => {
      const noHeuristicSections: SetupSectionId[] = [
        "overview",
        "servo_outputs",
        "serial_ports",
        "rtl_return",
        "geofence",
        "initial_params",
        "pid_tuning",
        "peripherals",
        "full_parameters",
      ];
      const statuses = computeSectionStatuses(makeParams({}), null, null, {});
      for (const id of noHeuristicSections) {
        expect(statuses.get(id)).toBe("not_started");
      }
    });
  });

  it("returns a status for every section", () => {
    const statuses = computeSectionStatuses(makeParams({}), null, null, {});
    expect(statuses.size).toBe(SECTION_IDS.length);
    for (const id of SECTION_IDS) {
      expect(statuses.has(id)).toBe(true);
    }
  });

  it("handles null params gracefully", () => {
    const statuses = computeSectionStatuses(null, null, null, {});
    expect(statuses.size).toBe(SECTION_IDS.length);
  });
});

// ---------------------------------------------------------------------------
// Regression: sensorHealth must NOT be ignored in computeSectionStatuses
// ---------------------------------------------------------------------------

describe("regression: sensorHealth parameter is used (not prefixed with _)", () => {
  it("computeSectionStatuses uses sensorHealth for arming status", () => {
    // If sensorHealth were ignored (underscore-prefixed param), arming would
    // always return "not_started" regardless of pre_arm_good value.
    const withGood = computeSectionStatuses(
      makeParams({}),
      { sensors: [], pre_arm_good: true },
      null,
      {},
    );
    const withBad = computeSectionStatuses(
      makeParams({}),
      { sensors: [], pre_arm_good: false },
      null,
      {},
    );
    const withNull = computeSectionStatuses(makeParams({}), null, null, {});

    // These would all be "not_started" if the parameter were ignored
    expect(withGood.get("arming")).toBe("complete");
    expect(withBad.get("arming")).toBe("in_progress");
    expect(withNull.get("arming")).toBe("not_started");

    // At least one must differ from "not_started" — proves sensorHealth is read
    expect(
      withGood.get("arming") !== "not_started" ||
      withBad.get("arming") !== "not_started",
    ).toBe(true);
  });
});

describe("computeOverallProgress", () => {
  const TRACKABLE_COUNT = TRACKABLE_SECTIONS.size;

  it("total equals TRACKABLE_SECTIONS.size, not SECTION_IDS.length", () => {
    const statuses = new Map<SetupSectionId, SectionStatus>();
    for (const id of SECTION_IDS) {
      statuses.set(id, "not_started");
    }
    const progress = computeOverallProgress(statuses);
    expect(progress.total).toBe(TRACKABLE_COUNT);
    expect(progress.total).toBeLessThan(SECTION_IDS.length);
  });

  it('returns { completed: 0, total: 9, percentage: 0 } when all sections are "not_started"', () => {
    const statuses = new Map<SetupSectionId, SectionStatus>();
    for (const id of SECTION_IDS) {
      statuses.set(id, "not_started");
    }
    const progress = computeOverallProgress(statuses);
    expect(progress).toEqual({ completed: 0, total: TRACKABLE_COUNT, percentage: 0 });
  });

  it("returns correct percentage when some trackable sections are complete", () => {
    const statuses = new Map<SetupSectionId, SectionStatus>();
    for (const id of SECTION_IDS) {
      statuses.set(id, "not_started");
    }
    statuses.set("gps", "complete");
    statuses.set("battery_monitor", "complete");
    statuses.set("rc_receiver", "complete");

    const progress = computeOverallProgress(statuses);
    expect(progress.completed).toBe(3);
    expect(progress.total).toBe(TRACKABLE_COUNT);
    expect(progress.percentage).toBe(Math.round((3 / TRACKABLE_COUNT) * 100));
  });

  it('counts "in_progress" as not yet complete', () => {
    const statuses = new Map<SetupSectionId, SectionStatus>();
    for (const id of SECTION_IDS) {
      statuses.set(id, "not_started");
    }
    statuses.set("calibration", "in_progress");
    statuses.set("gps", "complete");

    const progress = computeOverallProgress(statuses);
    expect(progress.completed).toBe(1);
    expect(progress.total).toBe(TRACKABLE_COUNT);
  });

  it("returns 100% when all trackable sections are complete", () => {
    const statuses = new Map<SetupSectionId, SectionStatus>();
    for (const id of SECTION_IDS) {
      statuses.set(id, "complete");
    }
    const progress = computeOverallProgress(statuses);
    expect(progress).toEqual({
      completed: TRACKABLE_COUNT,
      total: TRACKABLE_COUNT,
      percentage: 100,
    });
  });

  it("ignores non-trackable sections even when marked complete", () => {
    const statuses = new Map<SetupSectionId, SectionStatus>();
    for (const id of SECTION_IDS) {
      statuses.set(id, "not_started");
    }
    // Mark only non-trackable sections as complete
    const nonTrackable: SetupSectionId[] = [
      "overview",
      "servo_outputs",
      "serial_ports",
      "rtl_return",
      "geofence",
      "initial_params",
      "pid_tuning",
      "peripherals",
      "full_parameters",
    ];
    for (const id of nonTrackable) {
      statuses.set(id, "complete");
    }
    const progress = computeOverallProgress(statuses);
    expect(progress.completed).toBe(0);
    expect(progress.total).toBe(TRACKABLE_COUNT);
    expect(progress.percentage).toBe(0);
  });

  it("TRACKABLE_SECTIONS is a strict subset of SECTION_IDS", () => {
    for (const id of TRACKABLE_SECTIONS) {
      expect(SECTION_IDS).toContain(id);
    }
    expect(TRACKABLE_SECTIONS.size).toBeLessThan(SECTION_IDS.length);
  });

  it("every section with completion logic is in TRACKABLE_SECTIONS", () => {
    // Sections that have a switch case or USER_CONFIRMED entry
    const expectedTrackable: SetupSectionId[] = [
      "frame_orientation",
      "calibration",
      "rc_receiver",
      "gps",
      "battery_monitor",
      "motors_esc",
      "flight_modes",
      "failsafe",
      "arming",
    ];
    expect(TRACKABLE_SECTIONS.size).toBe(expectedTrackable.length);
    for (const id of expectedTrackable) {
      expect(TRACKABLE_SECTIONS.has(id)).toBe(true);
    }
  });
});
