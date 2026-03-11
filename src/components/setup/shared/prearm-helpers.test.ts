import { describe, it, expect } from "vitest";
import {
  PREARM_PATTERNS,
  classifyPrearm,
  categoryIcon,
  type PrearmBlocker,
} from "./prearm-helpers";

describe("PREARM_PATTERNS", () => {
  it("covers key sensor categories", () => {
    const categories = PREARM_PATTERNS.map((p) => p.category);
    expect(categories).toContain("GPS");
    expect(categories).toContain("EKF");
    expect(categories).toContain("Compass");
    expect(categories).toContain("IMU");
    expect(categories).toContain("RC");
    expect(categories).toContain("Battery");
    expect(categories).toContain("Safety");
    expect(categories).toContain("Baro");
    expect(categories).toContain("Hardware");
    expect(categories).toContain("Logging");
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

describe("classifyPrearm", () => {
  it("classifies GPS-related text", () => {
    const result = classifyPrearm("PreArm: GPS not healthy", 100);
    expect(result.category).toBe("GPS");
    expect(result.id).toBe("GPS-100");
    expect(result.rawText).toBe("PreArm: GPS not healthy");
  });

  it("classifies EKF-related text", () => {
    const result = classifyPrearm("PreArm: EKF not converged", 200);
    expect(result.category).toBe("EKF");
  });

  it("classifies AHRS as EKF", () => {
    const result = classifyPrearm("PreArm: AHRS not healthy", 200);
    expect(result.category).toBe("EKF");
  });

  it("classifies compass text", () => {
    const result = classifyPrearm("PreArm: compass not calibrated", 300);
    expect(result.category).toBe("Compass");
  });

  it("classifies mag as Compass", () => {
    const result = classifyPrearm("PreArm: mag field too high", 300);
    expect(result.category).toBe("Compass");
  });

  it("classifies accelerometer text as IMU", () => {
    const result = classifyPrearm("PreArm: accel not calibrated", 400);
    expect(result.category).toBe("IMU");
  });

  it("classifies INS as IMU", () => {
    const result = classifyPrearm("PreArm: INS not ready", 400);
    expect(result.category).toBe("IMU");
  });

  it("classifies RC text", () => {
    const result = classifyPrearm("PreArm: RC not calibrated", 500);
    expect(result.category).toBe("RC");
  });

  it("classifies throttle as RC", () => {
    const result = classifyPrearm("PreArm: throttle too high", 500);
    expect(result.category).toBe("RC");
  });

  it("classifies battery text", () => {
    const result = classifyPrearm("PreArm: batt voltage low", 600);
    expect(result.category).toBe("Battery");
  });

  it("classifies safety text", () => {
    const result = classifyPrearm("PreArm: safety switch", 700);
    expect(result.category).toBe("Safety");
  });

  it("classifies baro text", () => {
    const result = classifyPrearm("PreArm: baro not healthy", 800);
    expect(result.category).toBe("Baro");
  });

  it("classifies board text as Hardware", () => {
    const result = classifyPrearm("PreArm: board voltage", 900);
    expect(result.category).toBe("Hardware");
  });

  it("classifies internal as Hardware", () => {
    const result = classifyPrearm("PreArm: internal error", 900);
    expect(result.category).toBe("Hardware");
  });

  it("classifies logging text", () => {
    const result = classifyPrearm("PreArm: logging failed", 1000);
    expect(result.category).toBe("Logging");
  });

  it("returns Other for unmatched text", () => {
    const result = classifyPrearm("PreArm: something unknown", 1100);
    expect(result.category).toBe("Other");
    expect(result.id).toBe("unknown-1100");
    expect(result.guidance).toContain("ArduPilot documentation");
  });

  it("strips PreArm: prefix before matching", () => {
    const result = classifyPrearm("Pre-arm: GPS fix lost", 100);
    expect(result.category).toBe("GPS");
  });

  it("handles text without PreArm prefix", () => {
    const result = classifyPrearm("GPS not healthy", 100);
    expect(result.category).toBe("GPS");
  });

  it("preserves original text in rawText", () => {
    const original = "PreArm: GPS not healthy";
    const result = classifyPrearm(original, 100);
    expect(result.rawText).toBe(original);
  });

  it("uses timestamp in id", () => {
    const result = classifyPrearm("PreArm: GPS fix", 42);
    expect(result.id).toBe("GPS-42");
  });
});

describe("categoryIcon", () => {
  it("returns distinct icons for known categories", () => {
    const known = ["GPS", "EKF", "Compass", "IMU", "RC", "Battery", "Safety", "Baro", "Hardware", "Logging"];
    const icons = known.map(categoryIcon);
    const unique = new Set(icons);
    expect(unique.size).toBe(known.length);
  });

  it("returns warning icon for unknown category", () => {
    expect(categoryIcon("SomethingElse")).toBe("\u26A0\uFE0F");
  });

  it("returns warning icon for Other", () => {
    expect(categoryIcon("Other")).toBe("\u26A0\uFE0F");
  });

  it("returns warning icon for empty string", () => {
    expect(categoryIcon("")).toBe("\u26A0\uFE0F");
  });
});
