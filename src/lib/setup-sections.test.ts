import { describe, expect, it } from "vitest";

import {
  SECTION_IDS,
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
      ["beginner_wizard", "/setup/beginner-wizard"],
      ["frame_orientation", "/setup/frame-orientation"],
      ["calibration", "/setup/calibration"],
      ["navigation", "/setup/navigation"],
      ["battery_monitor", "/setup/battery-monitor"],
      ["motors_esc", "/setup/motors-esc"],
      ["servo_outputs", "/setup/servo-outputs"],
      ["serial_ports", "/setup/serial-ports"],
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
