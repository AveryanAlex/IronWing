import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const SECTION_SRC = readFileSync(
  resolve(__dirname, "ServoOutputsSection.tsx"),
  "utf-8",
);

describe("ServoOutputsSection shell language", () => {
  it("imports SetupSectionIntro from shared module", () => {
    expect(SECTION_SRC).toMatch(
      /import\s*\{[^}]*SetupSectionIntro[^}]*\}\s*from\s*["']\.\.\/shared\/SetupSectionIntro["']/,
    );
  });

  it("renders SetupSectionIntro at the section level", () => {
    expect(SECTION_SRC).toMatch(/<SetupSectionIntro/);
  });

  it("section intro includes servo-related title", () => {
    expect(SECTION_SRC).toMatch(/title="Servo Outputs"/);
  });

  it("does NOT pass a docsUrl to SetupSectionIntro", () => {
    const introBlock = SECTION_SRC.slice(
      SECTION_SRC.indexOf("<SetupSectionIntro"),
      SECTION_SRC.indexOf("/>", SECTION_SRC.indexOf("<SetupSectionIntro")) + 2,
    );
    expect(introBlock).not.toMatch(/docsUrl/);
  });

  it("does NOT import resolveDocsUrl (no docs link needed)", () => {
    expect(SECTION_SRC).not.toMatch(/resolveDocsUrl/);
  });

  it("does NOT render any ExternalLink placeholder", () => {
    expect(SECTION_SRC).not.toMatch(/ExternalLink/);
  });
});

describe("ServoOutputsSection preserved content", () => {
  it("preserves motor assignment banner", () => {
    expect(SECTION_SRC).toMatch(/MotorAssignmentBanner/);
    expect(SECTION_SRC).toMatch(/Motor assignments are automatic/);
  });

  it("preserves plane guidance banner", () => {
    expect(SECTION_SRC).toMatch(/PlaneGuidanceBanner/);
    expect(SECTION_SRC).toMatch(/Fixed-wing servo setup/);
  });

  it("preserves servo row with function/min/max/trim params", () => {
    expect(SECTION_SRC).toMatch(/SERVO\$\{index\}/);
    expect(SECTION_SRC).toMatch(/\$\{prefix\}_FUNCTION/);
    expect(SECTION_SRC).toMatch(/\$\{prefix\}_MIN/);
    expect(SECTION_SRC).toMatch(/\$\{prefix\}_MAX/);
    expect(SECTION_SRC).toMatch(/\$\{prefix\}_TRIM/);
  });

  it("preserves reversed toggle per servo", () => {
    expect(SECTION_SRC).toMatch(/REVERSED/);
    expect(SECTION_SRC).toMatch(/<ParamToggle/);
  });

  it("preserves dynamic servo detection", () => {
    expect(SECTION_SRC).toMatch(/detectServoIndices/);
  });

  it("preserves no-params fallback message", () => {
    expect(SECTION_SRC).toMatch(
      /Servo output parameters not available/,
    );
  });
});
