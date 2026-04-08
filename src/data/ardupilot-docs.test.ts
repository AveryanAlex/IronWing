import { describe, it, expect } from "vitest";
import {
  resolveDocsUrl,
  isKnownTopic,
  commonTopics,
  vehicleSpecificTopics,
  type VehicleSlug,
} from "./ardupilot-docs";

describe("resolveDocsUrl", () => {
  describe("common topics", () => {
    it("resolves geofence to common URL regardless of vehicle", () => {
      const url = resolveDocsUrl("geofence");
      expect(url).toBe(
        "https://ardupilot.org/copter/docs/common-geofencing-landing-page.html",
      );
      expect(resolveDocsUrl("geofence", "copter")).toBe(url);
      expect(resolveDocsUrl("geofence", "plane")).toBe(url);
      expect(resolveDocsUrl("geofence", "rover")).toBe(url);
      expect(resolveDocsUrl("geofence", null)).toBe(url);
    });

    it("resolves all common topics without a vehicle slug", () => {
      for (const topic of commonTopics()) {
        const url = resolveDocsUrl(topic);
        expect(url).not.toBeNull();
        expect(url).toMatch(/^https:\/\/ardupilot\.org\/.+\.html$/);
      }
    });

    it("resolves serial_ports to the common serial options URL", () => {
      expect(resolveDocsUrl("serial_ports")).toBe(
        "https://ardupilot.org/copter/docs/common-serial-options.html",
      );
    });

    it("resolves servo_outputs to the common RC output mapping URL", () => {
      expect(resolveDocsUrl("servo_outputs")).toBe(
        "https://ardupilot.org/copter/docs/common-rcoutput-mapping.html",
      );
    });

    it("resolves flight_mode_configuration to the planner docs URL", () => {
      expect(resolveDocsUrl("flight_mode_configuration")).toBe(
        "https://ardupilot.org/planner/docs/common-rc-transmitter-flight-mode-configuration.html",
      );
    });

    it("keeps flight_mode_configuration on the planner domain", () => {
      expect(resolveDocsUrl("flight_mode_configuration")).not.toContain(
        "https://ardupilot.org/copter/docs/",
      );
    });

    it("resolves prearm_safety_checks to common URL", () => {
      expect(resolveDocsUrl("prearm_safety_checks")).toBe(
        "https://ardupilot.org/copter/docs/common-prearm-safety-checks.html",
      );
    });
  });

  describe("vehicle-specific topics", () => {
    it("resolves failsafe_battery to copter URL", () => {
      expect(resolveDocsUrl("failsafe_battery", "copter")).toBe(
        "https://ardupilot.org/copter/docs/failsafe-battery.html",
      );
    });

    it("resolves failsafe_battery to plane URL", () => {
      expect(resolveDocsUrl("failsafe_battery", "plane")).toBe(
        "https://ardupilot.org/plane/docs/apms-failsafe-function.html",
      );
    });

    it("resolves failsafe_battery to rover URL", () => {
      expect(resolveDocsUrl("failsafe_battery", "rover")).toBe(
        "https://ardupilot.org/rover/docs/rover-failsafes.html",
      );
    });

    it("resolves rtl_mode to plane URL", () => {
      expect(resolveDocsUrl("rtl_mode", "plane")).toBe(
        "https://ardupilot.org/plane/docs/rtl-mode.html",
      );
    });

    it("resolves rtl_mode to copter URL", () => {
      expect(resolveDocsUrl("rtl_mode", "copter")).toBe(
        "https://ardupilot.org/copter/docs/rtl-mode.html",
      );
    });

    it("resolves arming to copter URL", () => {
      expect(resolveDocsUrl("arming", "copter")).toBe(
        "https://ardupilot.org/copter/docs/arming_the_motors.html",
      );
    });

    it("resolves arming to plane URL", () => {
      expect(resolveDocsUrl("arming", "plane")).toBe(
        "https://ardupilot.org/plane/docs/arming-your-plane.html",
      );
    });

    it("resolves simple_super_simple_modes to copter URL", () => {
      expect(resolveDocsUrl("simple_super_simple_modes", "copter")).toBe(
        "https://ardupilot.org/copter/docs/simpleandsuper-simple-modes.html",
      );
    });

    it("resolves full_parameter_list for every vehicle family", () => {
      expect(resolveDocsUrl("full_parameter_list", "copter")).toBe(
        "https://ardupilot.org/copter/docs/parameters.html",
      );
      expect(resolveDocsUrl("full_parameter_list", "plane")).toBe(
        "https://ardupilot.org/plane/docs/parameters.html",
      );
      expect(resolveDocsUrl("full_parameter_list", "rover")).toBe(
        "https://ardupilot.org/rover/docs/parameters.html",
      );
    });

    it("returns null for full_parameter_list without a vehicle slug", () => {
      expect(resolveDocsUrl("full_parameter_list")).toBeNull();
      expect(resolveDocsUrl("full_parameter_list", null)).toBeNull();
    });

    it("returns null for simple_super_simple_modes on plane and rover", () => {
      expect(resolveDocsUrl("simple_super_simple_modes", "plane")).toBeNull();
      expect(resolveDocsUrl("simple_super_simple_modes", "rover")).toBeNull();
    });
  });

  describe("null safety for unknown vehicle", () => {
    it("returns null for vehicle-specific topic when slug is undefined", () => {
      expect(resolveDocsUrl("failsafe_battery")).toBeNull();
    });

    it("returns null for vehicle-specific topic when slug is null", () => {
      expect(resolveDocsUrl("failsafe_battery", null)).toBeNull();
    });

    it("returns null for all vehicle-specific topics with unknown vehicle", () => {
      for (const topic of vehicleSpecificTopics()) {
        expect(resolveDocsUrl(topic)).toBeNull();
        expect(resolveDocsUrl(topic, null)).toBeNull();
      }
    });
  });

  describe("null for missing vehicle-family pages", () => {
    it("returns null for failsafe_ekf on plane", () => {
      expect(resolveDocsUrl("failsafe_ekf", "plane")).toBeNull();
    });

    it("returns null for failsafe_ekf on rover", () => {
      expect(resolveDocsUrl("failsafe_ekf", "rover")).toBeNull();
    });

    it("returns null for failsafe_crash_check on plane", () => {
      expect(resolveDocsUrl("failsafe_crash_check", "plane")).toBeNull();
    });

    it("resolves frame_type on plane to the QuadPlane frame setup page", () => {
      expect(resolveDocsUrl("frame_type", "plane")).toBe(
        "https://ardupilot.org/plane/docs/quadplane-frame-setup.html",
      );
    });

    it("resolves motors_esc on plane to the QuadPlane ESC calibration page", () => {
      expect(resolveDocsUrl("motors_esc", "plane")).toBe(
        "https://ardupilot.org/plane/docs/quadplane-esc-calibration.html",
      );
    });

    it("returns null for motors_esc on rover", () => {
      expect(resolveDocsUrl("motors_esc", "rover")).toBeNull();
    });

    it("returns null for arming on rover", () => {
      expect(resolveDocsUrl("arming", "rover")).toBeNull();
    });
  });

  describe("unrecognized topics", () => {
    it("returns null for unknown topic key", () => {
      expect(resolveDocsUrl("nonexistent" as any)).toBeNull();
      expect(resolveDocsUrl("nonexistent" as any, "copter")).toBeNull();
    });
  });

  describe("URL correctness", () => {
    it("all resolved URLs are valid ardupilot.org links", () => {
      const vehicles: VehicleSlug[] = ["copter", "plane", "rover"];
      const allTopics = [
        ...commonTopics(),
        ...vehicleSpecificTopics(),
      ];

      for (const topic of allTopics) {
        for (const v of vehicles) {
          const url = resolveDocsUrl(topic, v);
          if (url !== null) {
            expect(url).toMatch(/^https:\/\/ardupilot\.org\//);
            expect(url).toMatch(/\.html$/);
          }
        }
      }
    });

    it("vehicle-specific URLs contain the correct vehicle slug", () => {
      const vehicles: VehicleSlug[] = ["copter", "plane", "rover"];
      for (const topic of vehicleSpecificTopics()) {
        for (const v of vehicles) {
          const url = resolveDocsUrl(topic, v);
          if (url !== null) {
            expect(url).toContain(`/${v}/docs/`);
          }
        }
      }
    });
  });
});

describe("isKnownTopic", () => {
  it("returns true for common topics", () => {
    expect(isKnownTopic("geofence")).toBe(true);
    expect(isKnownTopic("tuning")).toBe(true);
  });

  it("returns true for vehicle-specific topics", () => {
    expect(isKnownTopic("failsafe_battery")).toBe(true);
    expect(isKnownTopic("rtl_mode")).toBe(true);
  });

  it("returns false for unknown strings", () => {
    expect(isKnownTopic("nonexistent")).toBe(false);
    expect(isKnownTopic("")).toBe(false);
  });
});

describe("topic lists", () => {
  it("commonTopics returns 12 entries", () => {
    expect(commonTopics()).toHaveLength(12);
  });

  it("vehicleSpecificTopics returns 14 entries", () => {
    expect(vehicleSpecificTopics()).toHaveLength(14);
  });

  it("no overlap between common and vehicle-specific topics", () => {
    const common = new Set<string>(commonTopics());
    for (const t of vehicleSpecificTopics()) {
      expect(common.has(t)).toBe(false);
    }
  });
});
