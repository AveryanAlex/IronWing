import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const SECTION_SRC = readFileSync(
  resolve(__dirname, "CalibrationSection.tsx"),
  "utf-8",
);

describe("CalibrationSection shell language", () => {
  it("imports SetupSectionIntro from shared module", () => {
    expect(SECTION_SRC).toMatch(
      /import\s*\{[^}]*SetupSectionIntro[^}]*\}\s*from\s*["']\.\.\/shared\/SetupSectionIntro["']/,
    );
  });

  it("imports DocsLink from shared module", () => {
    expect(SECTION_SRC).toMatch(
      /import\s*\{[^}]*DocsLink[^}]*\}\s*from\s*["']\.\.\/shared\/DocsLink["']/,
    );
  });

  it("imports resolveDocsUrl from docs registry", () => {
    expect(SECTION_SRC).toMatch(
      /import\s*\{[^}]*resolveDocsUrl[^}]*\}\s*from\s*["']\.\.\/\.\.\/\.\.\/data\/ardupilot-docs["']/,
    );
  });

  it("renders SetupSectionIntro at the section level", () => {
    expect(SECTION_SRC).toMatch(/<SetupSectionIntro/);
  });

  it("section intro includes calibration-related title", () => {
    expect(SECTION_SRC).toMatch(/title="Sensor Calibration"/);
  });

  it("resolves per-card docs for accelerometer", () => {
    expect(SECTION_SRC).toMatch(/resolveDocsUrl\("accelerometer_calibration"\)/);
  });

  it("resolves per-card docs for compass", () => {
    expect(SECTION_SRC).toMatch(/resolveDocsUrl\("compass_calibration"\)/);
  });

  it("resolves per-card docs for radio", () => {
    expect(SECTION_SRC).toMatch(/resolveDocsUrl\("radio_calibration"\)/);
  });

  it("CalibrationCard accepts docsUrl prop", () => {
    expect(SECTION_SRC).toMatch(/docsUrl\?:\s*string\s*\|\s*null/);
  });
});

describe("CalibrationSection preserved content", () => {
  it("preserves AccelCalibWizard", () => {
    expect(SECTION_SRC).toMatch(/<AccelCalibWizard/);
  });

  it("preserves CompassCalibWizard", () => {
    expect(SECTION_SRC).toMatch(/<CompassCalibWizard/);
  });

  it("preserves RadioCalibWizard", () => {
    expect(SECTION_SRC).toMatch(/<RadioCalibWizard/);
  });

  it("preserves gyroscope quick calibration", () => {
    expect(SECTION_SRC).toMatch(/calibrateGyro/);
  });

  it("preserves StatusBadge in calibration cards", () => {
    expect(SECTION_SRC).toMatch(/StatusBadge/);
  });

  it("preserves expand/collapse behavior", () => {
    expect(SECTION_SRC).toMatch(/ChevronDown/);
    expect(SECTION_SRC).toMatch(/rotate-180/);
  });

  it("preserves ParamDisplay for calibration offsets", () => {
    expect(SECTION_SRC).toMatch(/INS_ACCOFFS_X/);
    expect(SECTION_SRC).toMatch(/COMPASS_OFS_X/);
  });
});
