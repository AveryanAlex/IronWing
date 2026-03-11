import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const SECTION_SRC = readFileSync(
  resolve(__dirname, "BatteryMonitorSection.tsx"),
  "utf-8",
);

// ---------------------------------------------------------------------------
// Shared chrome: SetupSectionIntro
// ---------------------------------------------------------------------------

describe("BatteryMonitorSection — SetupSectionIntro integration", () => {
  it("imports SetupSectionIntro from shared module", () => {
    expect(SECTION_SRC).toContain(
      'import { SetupSectionIntro } from "../shared/SetupSectionIntro"',
    );
  });

  it("renders SetupSectionIntro in JSX", () => {
    expect(SECTION_SRC).toContain("<SetupSectionIntro");
  });

  it("passes Battery icon to SetupSectionIntro", () => {
    expect(SECTION_SRC).toMatch(/SetupSectionIntro[\s\S]*?icon=\{Battery\}/);
  });

  it("uses 'Power Monitor' as the section title", () => {
    expect(SECTION_SRC).toContain('title="Power Monitor"');
  });

  it("provides a description about battery configuration", () => {
    expect(SECTION_SRC).toMatch(
      /SetupSectionIntro[\s\S]*?description="[^"]*battery[^"]*"/i,
    );
  });

  it("passes batteryDocsUrl from the docs registry", () => {
    expect(SECTION_SRC).toMatch(/docsUrl=\{batteryDocsUrl\}/);
  });

  it("sets docsLabel to 'Power Module Docs'", () => {
    expect(SECTION_SRC).toContain('docsLabel="Power Module Docs"');
  });
});

// ---------------------------------------------------------------------------
// Shared chrome: docs registry
// ---------------------------------------------------------------------------

describe("BatteryMonitorSection — docs registry integration", () => {
  it("imports resolveDocsUrl from ardupilot-docs", () => {
    expect(SECTION_SRC).toContain(
      'import { resolveDocsUrl } from "../../../data/ardupilot-docs"',
    );
  });

  it("resolves the power_module_config topic", () => {
    expect(SECTION_SRC).toContain(
      'resolveDocsUrl("power_module_config")',
    );
  });

  it("does not contain hardcoded ardupilot.org URLs", () => {
    expect(SECTION_SRC).not.toMatch(/https:\/\/ardupilot\.org/);
  });
});

// ---------------------------------------------------------------------------
// Shared chrome: SectionCardHeader
// ---------------------------------------------------------------------------

describe("BatteryMonitorSection — SectionCardHeader integration", () => {
  it("imports SectionCardHeader from shared module", () => {
    expect(SECTION_SRC).toContain(
      'import { SectionCardHeader } from "../shared/SectionCardHeader"',
    );
  });

  it("uses SectionCardHeader for Board Preset card", () => {
    expect(SECTION_SRC).toMatch(
      /SectionCardHeader[\s\S]*?title="Board Preset"/,
    );
  });

  it("uses SectionCardHeader for Sensor Preset card", () => {
    expect(SECTION_SRC).toMatch(
      /SectionCardHeader[\s\S]*?title="Sensor Preset"/,
    );
  });

  it("uses SectionCardHeader for Voltage Calibration card", () => {
    expect(SECTION_SRC).toMatch(
      /SectionCardHeader[\s\S]*?title="Voltage Calibration"/,
    );
  });

  it("uses SectionCardHeader for Current Calibration card", () => {
    expect(SECTION_SRC).toMatch(
      /SectionCardHeader[\s\S]*?title="Current Calibration"/,
    );
  });

  it("uses SectionCardHeader for Battery Settings card", () => {
    expect(SECTION_SRC).toMatch(
      /SectionCardHeader[\s\S]*?title="Battery Settings"/,
    );
  });

  it("uses SectionCardHeader for Live Battery Status card", () => {
    expect(SECTION_SRC).toMatch(
      /SectionCardHeader[\s\S]*?title="Live Battery Status"/,
    );
  });

  it("uses SectionCardHeader for Monitor Type card", () => {
    expect(SECTION_SRC).toMatch(
      /SectionCardHeader[\s\S]*?Monitor Type/,
    );
  });

  it("does not have old inline card headers with mb-3 pattern", () => {
    expect(SECTION_SRC).not.toMatch(
      /className="mb-3 flex items-center gap-2"/,
    );
  });
});

// ---------------------------------------------------------------------------
// Battery 2: collapsible behavior preserved
// ---------------------------------------------------------------------------

describe("BatteryMonitorSection — Battery 2 collapsible behavior", () => {
  it("retains Batt2Panel component", () => {
    expect(SECTION_SRC).toMatch(/function Batt2Panel\(/);
  });

  it("retains expanded state toggle", () => {
    expect(SECTION_SRC).toMatch(/useState\(false\)/);
    expect(SECTION_SRC).toMatch(/setExpanded\(!expanded\)/);
  });

  it("retains BATT2_MONITOR param check", () => {
    expect(SECTION_SRC).toContain("BATT2_MONITOR");
  });

  it("retains enabled/disabled badge in Battery 2 header", () => {
    expect(SECTION_SRC).toContain("bg-success/15");
    expect(SECTION_SRC).toContain("Enabled");
    expect(SECTION_SRC).toContain("Disabled");
  });

  it("retains rotating ChevronDown in Battery 2 toggle", () => {
    expect(SECTION_SRC).toContain("rotate-180");
  });

  it("retains 'Battery 2' label text", () => {
    expect(SECTION_SRC).toContain("Battery 2");
  });

  it("retains 'Configure a secondary battery monitor' description", () => {
    expect(SECTION_SRC).toContain("Configure a secondary battery monitor");
  });
});

// ---------------------------------------------------------------------------
// Preserved content: calculations and thresholds
// ---------------------------------------------------------------------------

describe("BatteryMonitorSection — content preserved", () => {
  it("retains MONITOR_OPTIONS enum", () => {
    expect(SECTION_SRC).toContain("MONITOR_OPTIONS");
    expect(SECTION_SRC).toContain("Analog Voltage and Current");
    expect(SECTION_SRC).toContain("SMBus");
    expect(SECTION_SRC).toContain("DroneCAN");
  });

  it("retains isAnalogMonitor helper", () => {
    expect(SECTION_SRC).toMatch(/function isAnalogMonitor\(/);
  });

  it("retains hasCurrentSensing helper", () => {
    expect(SECTION_SRC).toMatch(/function hasCurrentSensing\(/);
  });

  it("retains isMonitorEnabled helper", () => {
    expect(SECTION_SRC).toMatch(/function isMonitorEnabled\(/);
  });

  it("retains battery-presets import for calibration presets", () => {
    expect(SECTION_SRC).toContain("BOARD_PRESETS");
    expect(SECTION_SRC).toContain("SENSOR_PRESETS");
    expect(SECTION_SRC).toContain("BATTERY_CHEMISTRIES");
  });

  it("retains voltage threshold calculation helpers", () => {
    expect(SECTION_SRC).toContain("calcBattArmVolt");
    expect(SECTION_SRC).toContain("calcBattLowVolt");
    expect(SECTION_SRC).toContain("calcBattCrtVolt");
  });

  it("retains cross-validation warning for LOW > CRT", () => {
    expect(SECTION_SRC).toContain("crossValidationWarning");
    expect(SECTION_SRC).toContain("Low voltage");
    expect(SECTION_SRC).toContain("critical");
  });

  it("retains voltage calibration instruction", () => {
    expect(SECTION_SRC).toContain("Measure actual voltage with a multimeter");
  });
});

// ---------------------------------------------------------------------------
// Preserved content: live telemetry displays
// ---------------------------------------------------------------------------

describe("BatteryMonitorSection — live telemetry preserved", () => {
  it("retains LiveBatteryStatus component", () => {
    expect(SECTION_SRC).toMatch(/function LiveBatteryStatus\(/);
  });

  it("retains battery voltage display", () => {
    expect(SECTION_SRC).toContain("battery_voltage_v");
  });

  it("retains battery current display", () => {
    expect(SECTION_SRC).toContain("battery_current_a");
  });

  it("retains battery percentage display", () => {
    expect(SECTION_SRC).toContain("battery_pct");
  });

  it("retains energy consumed display", () => {
    expect(SECTION_SRC).toContain("energy_consumed_wh");
  });

  it("retains cell voltage display", () => {
    expect(SECTION_SRC).toContain("battery_voltage_cells");
  });

  it("retains no-telemetry fallback message", () => {
    expect(SECTION_SRC).toContain("No battery telemetry available");
  });
});

// ---------------------------------------------------------------------------
// Structural: no hardcoded docs URLs
// ---------------------------------------------------------------------------

describe("BatteryMonitorSection — no hardcoded docs URLs", () => {
  it("does not contain any hardcoded ArduPilot wiki URLs", () => {
    expect(SECTION_SRC).not.toMatch(/ardupilot\.org/);
  });

  it("does not export any docs URL constants", () => {
    expect(SECTION_SRC).not.toMatch(/export const.*DOCS_URL/);
    expect(SECTION_SRC).not.toMatch(/export const.*_URL/);
  });
});
