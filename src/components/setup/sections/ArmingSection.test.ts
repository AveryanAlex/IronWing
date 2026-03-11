import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  ARMING_REQUIRE_OPTIONS,
  PREARM_PATTERNS,
} from "./ArmingSection";
import { resolveDocsUrl } from "../../../data/ardupilot-docs";

const PREARM_DOCS_URL = resolveDocsUrl("prearm_safety_checks")!;
const ARMING_DOCS_URL = resolveDocsUrl("arming", "copter")!;

const SECTION_SRC = readFileSync(resolve(__dirname, "ArmingSection.tsx"), "utf-8");

// ---------------------------------------------------------------------------
// Exported constants
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Structural contract: root layout
// ---------------------------------------------------------------------------

describe("ArmingSection structural contract — layout", () => {
  it("root wrapper includes p-4 padding matching sibling sections", () => {
    const rootDiv = SECTION_SRC.match(
      /return\s*\(\s*<div className="([^"]+)">/,
    );
    expect(rootDiv).not.toBeNull();
    expect(rootDiv![1]).toContain("p-4");
  });

  it("root wrapper uses flex column layout with gap", () => {
    const rootDiv = SECTION_SRC.match(
      /return\s*\(\s*<div className="([^"]+)">/,
    );
    expect(rootDiv).not.toBeNull();
    expect(rootDiv![1]).toContain("flex flex-col");
    expect(rootDiv![1]).toMatch(/gap-\d/);
  });
});

// ---------------------------------------------------------------------------
// Structural contract: docs links
// ---------------------------------------------------------------------------

describe("ArmingSection structural contract — docs links", () => {
  it("renders the pre-arm docs link via DocsLink", () => {
    expect(SECTION_SRC).toContain('resolveDocsUrl("prearm_safety_checks"');
    expect(SECTION_SRC).toContain("Pre-Arm Checks");
  });

  it("renders the arming docs link via DocsLink", () => {
    expect(SECTION_SRC).toContain('resolveDocsUrl("arming"');
    expect(SECTION_SRC).toContain("Arming the Motors");
  });

  it("uses DocsLink component for docs links", () => {
    expect(SECTION_SRC).toContain('<DocsLink');
    expect(SECTION_SRC).toContain('import { DocsLink }');
  });

  it("uses shared SectionCardHeader for card headers", () => {
    expect(SECTION_SRC).toContain('<SectionCardHeader');
    expect(SECTION_SRC).toContain('import { SectionCardHeader }');
  });
});

// ---------------------------------------------------------------------------
// Structural contract: safety banners
// ---------------------------------------------------------------------------

describe("ArmingSection structural contract — safety", () => {
  it("shows danger banner when arming checks are disabled", () => {
    expect(SECTION_SRC).toContain("Arming Checks Disabled");
    expect(SECTION_SRC).toMatch(/checksDisabled/);
  });

  it("shows warning banner for partial arming checks", () => {
    expect(SECTION_SRC).toContain("Partial Arming Checks");
    expect(SECTION_SRC).toMatch(/checksNotAll/);
  });

  it("shows warning when arming requirement is disabled", () => {
    expect(SECTION_SRC).toMatch(/armingDisabled/);
    expect(SECTION_SRC).toContain("arm unexpectedly");
  });

  it("armed state shows safety notice about motors", () => {
    expect(SECTION_SRC).toContain("Motors are live");
    expect(SECTION_SRC).toContain("Keep clear of propellers");
  });
});
