import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const SECTION_SRC = readFileSync(
  resolve(__dirname, "MotorsEscSection.tsx"),
  "utf-8",
);

describe("MotorsEscSection shell language", () => {
  it("imports SetupSectionIntro from shared module", () => {
    expect(SECTION_SRC).toMatch(
      /import\s*\{[^}]*SetupSectionIntro[^}]*\}\s*from\s*["']\.\.\/shared\/SetupSectionIntro["']/,
    );
  });

  it("imports SectionCardHeader from shared module", () => {
    expect(SECTION_SRC).toMatch(
      /import\s*\{[^}]*SectionCardHeader[^}]*\}\s*from\s*["']\.\.\/shared\/SectionCardHeader["']/,
    );
  });

  it("imports resolveDocsUrl from docs registry", () => {
    expect(SECTION_SRC).toMatch(
      /import\s*\{[^}]*resolveDocsUrl[^}]*\}\s*from\s*["']\.\.\/\.\.\/\.\.\/data\/ardupilot-docs["']/,
    );
  });

  it("imports getVehicleSlug from shared vehicle helpers", () => {
    expect(SECTION_SRC).toMatch(/getVehicleSlug/);
  });

  it("renders SetupSectionIntro at the section level", () => {
    expect(SECTION_SRC).toMatch(/<SetupSectionIntro/);
  });

  it("section intro includes motors-related title", () => {
    expect(SECTION_SRC).toMatch(/title="Motors & ESC"/);
  });

  it("resolves motors_esc docs topic with vehicle slug", () => {
    expect(SECTION_SRC).toMatch(/resolveDocsUrl\("motors_esc"/);
  });

  it("resolves esc_calibration docs topic for ESC Calibration cards", () => {
    expect(SECTION_SRC).toMatch(/resolveDocsUrl\("esc_calibration"/);
  });

  it("passes escCalDocsUrl to EscCalibrationCard", () => {
    expect(SECTION_SRC).toMatch(/escCalDocsUrl=\{escCalDocsUrl\}/);
  });

  it("ESC Calibration card headers include docsUrl prop", () => {
    const escCalBlock = SECTION_SRC.slice(
      SECTION_SRC.indexOf("function EscCalibrationCard"),
      SECTION_SRC.indexOf("function MotorRangeCard"),
    );
    const headerMatches = escCalBlock.match(/<SectionCardHeader[^>]*docsUrl/g);
    expect(headerMatches).not.toBeNull();
    expect(headerMatches!.length).toBe(2);
  });

  it("uses SectionCardHeader for card headers", () => {
    const matches = SECTION_SRC.match(/<SectionCardHeader/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(4);
  });
});

describe("MotorsEscSection preserved content", () => {
  it("preserves motor test safety dialog", () => {
    expect(SECTION_SRC).toMatch(/PropRemovalDialog/);
    expect(SECTION_SRC).toMatch(/Remove.*ALL propellers/);
  });

  it("preserves motor test command integration", () => {
    expect(SECTION_SRC).toMatch(/motorTest\(/);
  });

  it("preserves ESC calibration workflow", () => {
    expect(SECTION_SRC).toMatch(/ESC_CALIBRATION/);
    expect(SECTION_SRC).toMatch(/Semi-Automatic Calibration/);
  });

  it("preserves DShot detection and no-calibration message", () => {
    expect(SECTION_SRC).toMatch(/isDshot/);
    expect(SECTION_SRC).toMatch(/No ESC calibration needed/);
  });

  it("preserves motor range parameters", () => {
    expect(SECTION_SRC).toMatch(/MOT_PWM_MIN/);
    expect(SECTION_SRC).toMatch(/MOT_SPIN_ARM/);
    expect(SECTION_SRC).toMatch(/MOT_SPIN_MIN/);
  });

  it("preserves non-copter fallback message", () => {
    expect(SECTION_SRC).toMatch(/Motor \/ Servo Verification/);
  });

  it("preserves plane throttle configuration", () => {
    expect(SECTION_SRC).toMatch(/THR_MAX/);
    expect(SECTION_SRC).toMatch(/PlaneThrottleCard/);
  });

  it("preserves MotorDiagram", () => {
    expect(SECTION_SRC).toMatch(/<MotorDiagram/);
  });

  it("preserves safety toggle for motor test", () => {
    expect(SECTION_SRC).toMatch(/Enable Motor Test/);
    expect(SECTION_SRC).toMatch(/role="switch"/);
  });
});
