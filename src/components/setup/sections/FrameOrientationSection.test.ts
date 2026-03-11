import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const SECTION_SRC = readFileSync(
  resolve(__dirname, "FrameOrientationSection.tsx"),
  "utf-8",
);

// ---------------------------------------------------------------------------
// Structural contract: shared shell language
// ---------------------------------------------------------------------------

describe("FrameOrientationSection shell language", () => {
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

  it("section intro includes frame-related title", () => {
    expect(SECTION_SRC).toMatch(/title="Frame & Orientation"/);
  });

  it("resolves frame_type docs topic for vehicle-specific link", () => {
    expect(SECTION_SRC).toMatch(/resolveDocsUrl\("frame_type"/);
  });

  it("uses SectionCardHeader for card headers", () => {
    const matches = SECTION_SRC.match(/<SectionCardHeader/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Structural contract: preserved content
// ---------------------------------------------------------------------------

describe("FrameOrientationSection preserved content", () => {
  it("preserves frame class change warning", () => {
    expect(SECTION_SRC).toMatch(/Frame class change requires a vehicle reboot/);
  });

  it("preserves MotorDiagram", () => {
    expect(SECTION_SRC).toMatch(/<MotorDiagram/);
  });

  it("preserves QuadPlane frame detection", () => {
    expect(SECTION_SRC).toMatch(/Q_FRAME_CLASS/);
    expect(SECTION_SRC).toMatch(/hasQuadPlaneParams/);
  });

  it("preserves board orientation AHRS_ORIENTATION param", () => {
    expect(SECTION_SRC).toMatch(/AHRS_ORIENTATION/);
  });

  it("preserves fixed-wing guidance text", () => {
    expect(SECTION_SRC).toMatch(/Fixed-wing aircraft do not use frame class/);
  });

  it("root wrapper includes p-4 padding", () => {
    const rootReturn = SECTION_SRC.match(
      /return\s*\(\s*<div className="([^"]+)">\s*<SetupSectionIntro/,
    );
    expect(rootReturn).not.toBeNull();
    expect(rootReturn![1]).toContain("p-4");
  });
});
