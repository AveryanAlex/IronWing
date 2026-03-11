import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const SECTION_SRC = readFileSync(
  resolve(__dirname, "GpsSection.tsx"),
  "utf-8",
);

// ---------------------------------------------------------------------------
// Shared chrome: SetupSectionIntro
// ---------------------------------------------------------------------------

describe("GpsSection — SetupSectionIntro integration", () => {
  it("imports SetupSectionIntro from shared module", () => {
    expect(SECTION_SRC).toContain(
      'import { SetupSectionIntro } from "../shared/SetupSectionIntro"',
    );
  });

  it("renders SetupSectionIntro in JSX", () => {
    expect(SECTION_SRC).toContain("<SetupSectionIntro");
  });

  it("passes Satellite icon to SetupSectionIntro", () => {
    expect(SECTION_SRC).toMatch(/SetupSectionIntro[\s\S]*?icon=\{Satellite\}/);
  });

  it("uses 'GPS / Positioning' as the section title", () => {
    expect(SECTION_SRC).toContain('title="GPS / Positioning"');
  });

  it("provides a description about GPS configuration", () => {
    expect(SECTION_SRC).toMatch(
      /SetupSectionIntro[\s\S]*?description="[^"]*GPS[^"]*"/,
    );
  });

  it("passes gpsDocsUrl from the docs registry", () => {
    expect(SECTION_SRC).toMatch(/docsUrl=\{gpsDocsUrl\}/);
  });

  it("sets docsLabel to 'GPS & Compass Docs'", () => {
    expect(SECTION_SRC).toContain('docsLabel="GPS & Compass Docs"');
  });
});

// ---------------------------------------------------------------------------
// Shared chrome: docs registry
// ---------------------------------------------------------------------------

describe("GpsSection — docs registry integration", () => {
  it("imports resolveDocsUrl from ardupilot-docs", () => {
    expect(SECTION_SRC).toContain(
      'import { resolveDocsUrl } from "../../../data/ardupilot-docs"',
    );
  });

  it("resolves the positioning_gps_compass topic", () => {
    expect(SECTION_SRC).toContain(
      'resolveDocsUrl("positioning_gps_compass")',
    );
  });

  it("does not contain hardcoded ardupilot.org URLs", () => {
    expect(SECTION_SRC).not.toMatch(/https:\/\/ardupilot\.org/);
  });
});

// ---------------------------------------------------------------------------
// Shared chrome: SectionCardHeader
// ---------------------------------------------------------------------------

describe("GpsSection — SectionCardHeader integration", () => {
  it("imports SectionCardHeader from shared module", () => {
    expect(SECTION_SRC).toContain(
      'import { SectionCardHeader } from "../shared/SectionCardHeader"',
    );
  });

  it("uses SectionCardHeader for GPS 1 panel", () => {
    expect(SECTION_SRC).toMatch(
      /SectionCardHeader[\s\S]*?title="GPS 1"/,
    );
  });

  it("does not have old inline card headers with mb-3 pattern", () => {
    expect(SECTION_SRC).not.toMatch(
      /mb-3 flex items-center gap-2[\s\S]*?GPS 1/,
    );
  });
});

// ---------------------------------------------------------------------------
// GPS 2 collapsible: preserved behavior + rotating chevron
// ---------------------------------------------------------------------------

describe("GpsSection — GPS 2 collapsible behavior", () => {
  it("retains Gps2Panel component", () => {
    expect(SECTION_SRC).toMatch(/function Gps2Panel\(/);
  });

  it("retains GPS2_TYPE param check", () => {
    expect(SECTION_SRC).toContain("GPS2_TYPE");
  });

  it("retains GPS_AUTO_SWITCH param inside GPS 2", () => {
    expect(SECTION_SRC).toContain("GPS_AUTO_SWITCH");
  });

  it("retains expanded state toggle", () => {
    expect(SECTION_SRC).toMatch(/useState\(false\)/);
    expect(SECTION_SRC).toMatch(/setExpanded\(!expanded\)/);
  });

  it("uses rotating ChevronDown instead of ChevronDown/ChevronRight swap", () => {
    expect(SECTION_SRC).not.toContain("ChevronRight");
    expect(SECTION_SRC).toMatch(/rotate-180/);
  });

  it("uses transition-transform duration-200 for chevron animation", () => {
    expect(SECTION_SRC).toContain("transition-transform duration-200");
  });

  it("has aria-expanded on the toggle button", () => {
    expect(SECTION_SRC).toContain("aria-expanded={expanded}");
  });

  it("retains enabled badge for GPS 2 when enabled", () => {
    expect(SECTION_SRC).toMatch(/enabled/);
    expect(SECTION_SRC).toContain("bg-accent/10");
  });
});

// ---------------------------------------------------------------------------
// Live GPS Status: preserved telemetry surfaces
// ---------------------------------------------------------------------------

describe("GpsSection — Live GPS Status preserved", () => {
  it("retains GpsStatusPanel component", () => {
    expect(SECTION_SRC).toMatch(/function GpsStatusPanel\(/);
  });

  it("retains fix type formatting", () => {
    expect(SECTION_SRC).toMatch(/function formatFixType\(/);
  });

  it("retains fix type color coding", () => {
    expect(SECTION_SRC).toMatch(/function fixTypeColor\(/);
  });

  it("retains satellite count display", () => {
    expect(SECTION_SRC).toContain("gps_satellites");
  });

  it("retains HDOP display", () => {
    expect(SECTION_SRC).toContain("gps_hdop");
  });

  it("retains coordinate display", () => {
    expect(SECTION_SRC).toContain("latitude_deg");
    expect(SECTION_SRC).toContain("longitude_deg");
  });

  it("retains fix type badge in status panel header area", () => {
    expect(SECTION_SRC).toMatch(/bg-success\/10 text-success/);
    expect(SECTION_SRC).toMatch(/bg-warning\/10 text-warning/);
    expect(SECTION_SRC).toMatch(/bg-danger\/10 text-danger/);
  });
});

// ---------------------------------------------------------------------------
// GPS 1: preserved content
// ---------------------------------------------------------------------------

describe("GpsSection — GPS 1 content preserved", () => {
  it("retains GPS type param select", () => {
    expect(SECTION_SRC).toMatch(/resolveGps1TypeParam/);
  });

  it("retains serial port warning when no GPS serial configured", () => {
    expect(SECTION_SRC).toContain("No serial port configured for GPS");
  });

  it("retains auto-configure toggle", () => {
    expect(SECTION_SRC).toContain("GPS_AUTO_CONFIG");
  });

  it("retains GNSS constellation bitmask input", () => {
    expect(SECTION_SRC).toContain("GPS_GNSS_MODE");
  });

  it("retains serial port detection helper", () => {
    expect(SECTION_SRC).toMatch(/function findGpsSerialPorts\(/);
  });
});

// ---------------------------------------------------------------------------
// Structural: no hardcoded docs URLs
// ---------------------------------------------------------------------------

describe("GpsSection — no hardcoded docs URLs", () => {
  it("does not contain any hardcoded ArduPilot wiki URLs", () => {
    expect(SECTION_SRC).not.toMatch(/ardupilot\.org/);
  });

  it("does not export any docs URL constants", () => {
    expect(SECTION_SRC).not.toMatch(/export const.*DOCS_URL/);
    expect(SECTION_SRC).not.toMatch(/export const.*_URL/);
  });
});
