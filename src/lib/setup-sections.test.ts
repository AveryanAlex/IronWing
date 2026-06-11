import { describe, expect, it } from "vitest";

import {
  SECTION_IDS,
  SETUP_SECTION_CATALOG,
  groupSetupSectionNavigation,
  setupSectionForPath,
  setupSectionForRouteId,
  setupSectionIdFromSlug,
  setupSectionPath,
  setupSectionSlug,
} from "./setup-sections";

describe("setup section routes", () => {
  it("maps every setup section to a stable URL", () => {
    expect(SECTION_IDS.map((sectionId) => [sectionId, setupSectionPath(sectionId)])).toEqual([
      ["overview", "/setup"],
      ["frame_orientation", "/setup/frame-orientation"],
      ["calibration", "/setup/calibration"],
      ["navigation", "/setup/navigation"],
      ["battery_monitor", "/setup/battery-monitor"],
      ["motors_esc", "/setup/motors-esc"],
      ["servo_outputs", "/setup/servo-outputs"],
      ["serial_ports", "/setup/serial-ports"],
      ["osd", "/setup/osd"],
      ["rc_receiver", "/setup/rc-receiver"],
      ["flight_modes", "/setup/flight-modes"],
      ["failsafe", "/setup/failsafe"],
      ["rtl_return", "/setup/rtl-return"],
      ["geofence", "/setup/geofence"],
      ["arming", "/setup/arming"],
      ["initial_params", "/setup/initial-params"],
      ["pid_tuning", "/setup/pid-tuning"],
      ["peripherals", "/setup/peripherals"],
      ["full_parameters", "/setup/full-parameters"],
    ]);
  });

  it("derives route paths from catalog metadata", () => {
    for (const section of SETUP_SECTION_CATALOG) {
      expect(setupSectionPath(section.id)).toBe(section.path);
      expect(setupSectionForPath(section.path)).toBe(section.id);
    }
  });

  it("round-trips section slugs and paths", () => {
    expect(setupSectionSlug("frame_orientation")).toBe("frame-orientation");
    expect(setupSectionIdFromSlug("frame-orientation")).toBe("frame_orientation");
    expect(setupSectionForPath("/setup/frame-orientation")).toBe("frame_orientation");
    expect(setupSectionForPath("/setup/frame-orientation/")).toBe("frame_orientation");
    expect(setupSectionForPath("/setup/overview")).toBeNull();
    expect(setupSectionForPath("/setup/unknown")).toBeNull();
    expect(setupSectionForPath("/mission")).toBeNull();
  });

  it("resolves SvelteKit route IDs without deployment base path coupling", () => {
    expect(setupSectionForRouteId("/(app)/setup/frame-orientation")).toBe("frame_orientation");
    expect(setupSectionForRouteId("/(app)/setup")).toBe("overview");
    expect(setupSectionForRouteId("/(app)/telemetry")).toBeNull();
    expect(setupSectionForRouteId(null)).toBeNull();
  });
});

describe("setup section navigation", () => {
  it("keeps every implemented catalog section in derived navigation exactly once", () => {
    const navGroups = groupSetupSectionNavigation(SETUP_SECTION_CATALOG.filter((section) => section.implemented));
    const implementedIds = SETUP_SECTION_CATALOG.filter((section) => section.implemented).map((section) => section.id);
    const navIds = navGroups.flatMap((group) => group.sections.map((section) => section.id));

    expect(new Set(navIds).size).toBe(navIds.length);
    expect([...navIds].sort()).toEqual([...implementedIds].sort());
  });

  it("preserves the current setup rail grouping and order", () => {
    const navGroups = groupSetupSectionNavigation(SETUP_SECTION_CATALOG.filter((section) => section.implemented));

    expect(navGroups.map((group) => [group.title, group.sections.map((section) => section.id)])).toEqual([
      ["Essential Setup", ["overview", "frame_orientation", "calibration", "rc_receiver", "flight_modes"]],
      ["Hardware", ["navigation", "battery_monitor", "motors_esc", "servo_outputs", "serial_ports", "osd"]],
      ["Safety", ["failsafe", "rtl_return", "geofence", "arming"]],
      ["Tuning", ["initial_params", "pid_tuning"]],
      ["Peripherals", ["peripherals", "full_parameters"]],
    ]);
  });
});
