import { describe, it, expect } from "vitest";
import {
  ARMING_REQUIRE_OPTIONS,
  PREARM_PATTERNS,
} from "./ArmingSection";
import { resolveDocsUrl } from "../../../data/ardupilot-docs";

const PREARM_DOCS_URL = resolveDocsUrl("prearm_safety_checks")!;
const ARMING_DOCS_URL = resolveDocsUrl("arming", "copter")!;

describe("ArmingSection docs URLs", () => {
  it("pre-arm docs URL points to the correct ArduPilot page", () => {
    expect(PREARM_DOCS_URL).toBe(
      "https://ardupilot.org/copter/docs/common-prearm-safety-checks.html",
    );
  });

  it("arming docs URL points to the correct ArduPilot page", () => {
    expect(ARMING_DOCS_URL).toBe(
      "https://ardupilot.org/copter/docs/arming_the_motors.html",
    );
  });
});

describe("ARMING_REQUIRE_OPTIONS", () => {
  it("includes disabled, rudder, and switch options", () => {
    const values = ARMING_REQUIRE_OPTIONS.map((o) => o.value);
    expect(values).toEqual([0, 1, 2]);
  });

  it("all options have non-empty labels", () => {
    for (const opt of ARMING_REQUIRE_OPTIONS) {
      expect(opt.label.length).toBeGreaterThan(0);
    }
  });
});

describe("PREARM_PATTERNS", () => {
  it("covers key sensor categories", () => {
    const categories = PREARM_PATTERNS.map((p) => p.category);
    expect(categories).toContain("GPS");
    expect(categories).toContain("EKF");
    expect(categories).toContain("Compass");
    expect(categories).toContain("IMU");
    expect(categories).toContain("RC");
    expect(categories).toContain("Battery");
  });

  it("all patterns have non-empty guidance", () => {
    for (const p of PREARM_PATTERNS) {
      expect(p.guidance.length).toBeGreaterThan(0);
    }
  });

  it("GPS pattern matches expected text", () => {
    const gps = PREARM_PATTERNS.find((p) => p.category === "GPS")!;
    expect(gps.pattern.test("GPS: No fix")).toBe(true);
    expect(gps.pattern.test("compass not calibrated")).toBe(false);
  });
});
