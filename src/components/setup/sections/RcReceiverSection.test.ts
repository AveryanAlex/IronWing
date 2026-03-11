import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const SECTION_SRC = readFileSync(
  resolve(__dirname, "RcReceiverSection.tsx"),
  "utf-8",
);

describe("RcReceiverSection shell language", () => {
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

  it("renders SetupSectionIntro at the section level", () => {
    expect(SECTION_SRC).toMatch(/<SetupSectionIntro/);
  });

  it("section intro includes RC-related title", () => {
    expect(SECTION_SRC).toMatch(/title="RC Receiver"/);
  });

  it("resolves radio_calibration docs topic", () => {
    expect(SECTION_SRC).toMatch(/resolveDocsUrl\("radio_calibration"\)/);
  });

  it("uses SectionCardHeader for simple card headers", () => {
    const matches = SECTION_SRC.match(/<SectionCardHeader/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });
});

describe("RcReceiverSection preserved content", () => {
  it("preserves RC_PROTOCOLS bitmask input", () => {
    expect(SECTION_SRC).toMatch(/RC_PROTOCOLS/);
    expect(SECTION_SRC).toMatch(/<ParamBitmaskInput/);
  });

  it("preserves channel mapping presets", () => {
    expect(SECTION_SRC).toMatch(/MAPPING_PRESETS/);
    expect(SECTION_SRC).toMatch(/Mode 2.*AETR/);
  });

  it("preserves RCMAP parameter selects", () => {
    expect(SECTION_SRC).toMatch(/RCMAP_ROLL/);
    expect(SECTION_SRC).toMatch(/RCMAP_PITCH/);
    expect(SECTION_SRC).toMatch(/RCMAP_THROTTLE/);
    expect(SECTION_SRC).toMatch(/RCMAP_YAW/);
  });

  it("preserves RSSI configuration", () => {
    expect(SECTION_SRC).toMatch(/RSSI_TYPE/);
  });

  it("preserves live RC channel bars", () => {
    expect(SECTION_SRC).toMatch(/telemetry:\/\/tick/);
    expect(SECTION_SRC).toMatch(/rc_channels/);
  });

  it("preserves serial RC port detection", () => {
    expect(SECTION_SRC).toMatch(/RC_SERIAL_PROTOCOL/);
    expect(SECTION_SRC).toMatch(/findRcSerialPorts/);
  });
});
