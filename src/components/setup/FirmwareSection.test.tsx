import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const WIZARD_SRC = readFileSync(
  resolve(__dirname, "FirmwareFlashWizard.tsx"),
  "utf-8",
);

const SECTION_SRC = readFileSync(
  resolve(__dirname, "sections", "FirmwareSection.tsx"),
  "utf-8",
);

const PANEL_SRC = readFileSync(
  resolve(__dirname, "SetupSectionPanel.tsx"),
  "utf-8",
);

describe("FirmwareSection setup registration", () => {
  it("firmware section is registered in SetupSectionPanel", () => {
    expect(PANEL_SRC).toContain('"firmware"');
  });

  it("firmware appears in SETUP_SECTIONS metadata", () => {
    expect(PANEL_SRC).toMatch(/id:\s*"firmware"/);
  });

  it("firmware section imports FirmwareSection component", () => {
    expect(PANEL_SRC).toMatch(
      /import.*FirmwareSection.*from.*sections\/FirmwareSection/,
    );
  });

  it("firmware has a switch case in section content", () => {
    expect(PANEL_SRC).toMatch(/case\s*"firmware"/);
  });

  it("firmware is in the peripherals_advanced group", () => {
    const groupsStart = PANEL_SRC.indexOf("SECTION_GROUPS");
    const groupBlock = PANEL_SRC.slice(groupsStart);
    const advancedGroupMatch = groupBlock.slice(
      groupBlock.indexOf('"peripherals_advanced"'),
      groupBlock.indexOf('"peripherals_advanced"') + 500,
    );
    expect(advancedGroupMatch).toContain('"firmware"');
  });

  it("connected gate exempts firmware section", () => {
    expect(PANEL_SRC).toMatch(/!connected.*activeSection\s*!==\s*"firmware"/);
  });
});

describe("Serial flow is the default primary UI", () => {
  it("serial panel appears before DFU panel in source order", () => {
    const serialIdx = WIZARD_SRC.indexOf('data-testid="firmware-serial-panel"');
    const dfuIdx = WIZARD_SRC.indexOf('data-testid="firmware-dfu-recovery-panel"');
    expect(serialIdx).toBeGreaterThan(-1);
    expect(dfuIdx).toBeGreaterThan(-1);
    expect(serialIdx).toBeLessThan(dfuIdx);
  });

  it("serial panel uses accent color for visual prominence", () => {
    const serialPanel = WIZARD_SRC.slice(
      WIZARD_SRC.indexOf('data-testid="firmware-serial-panel"'),
      WIZARD_SRC.indexOf('data-testid="firmware-dfu-recovery-panel"'),
    );
    expect(serialPanel).toContain("bg-accent");
    expect(serialPanel).toContain("text-accent");
  });

  it("serial panel has the primary Flash Firmware button", () => {
    expect(WIZARD_SRC).toContain('data-testid="firmware-start-serial"');
    expect(WIZARD_SRC).toContain("Flash Firmware");
  });

  it("serial panel includes official catalog source option", () => {
    expect(WIZARD_SRC).toContain('data-testid="firmware-source-catalog"');
  });

  it("serial panel includes local APJ source option", () => {
    expect(WIZARD_SRC).toContain('data-testid="firmware-source-local-apj"');
  });

  it("serial panel labels source as Official Catalog and Local File", () => {
    expect(WIZARD_SRC).toContain("Official Catalog");
    expect(WIZARD_SRC).toContain("Local File (.apj)");
  });
});

describe("DFU recovery requires extra confirmation", () => {
  it("DFU panel is labeled Recovery / Advanced", () => {
    expect(WIZARD_SRC).toContain("Recovery / Advanced");
  });

  it("DFU panel starts collapsed (dfuExpanded defaults to false)", () => {
    expect(WIZARD_SRC).toMatch(/useState\(false\)/);
    expect(WIZARD_SRC).toContain("dfuExpanded");
  });

  it("DFU panel has explicit confirmation checkbox", () => {
    const dfuSection = WIZARD_SRC.slice(
      WIZARD_SRC.indexOf('data-testid="firmware-dfu-recovery-panel"'),
    );
    expect(dfuSection).toContain('type="checkbox"');
    expect(dfuSection).toContain("dfuConfirmed");
  });

  it("DFU start button requires confirmation to be enabled", () => {
    expect(WIZARD_SRC).toMatch(/canStartDfu\s*=\s*dfuConfirmed/);
  });

  it("DFU panel shows warning about bypassing safety checks", () => {
    const dfuSection = WIZARD_SRC.slice(
      WIZARD_SRC.indexOf('data-testid="firmware-dfu-recovery-panel"'),
    );
    expect(dfuSection).toContain("caution");
    expect(dfuSection).toContain("bypasses");
  });

  it("DFU start button uses warning styling (not accent)", () => {
    expect(WIZARD_SRC).toContain('data-testid="firmware-start-dfu"');
    expect(WIZARD_SRC).toContain("Start Recovery Flash");
    const dfuPanel = WIZARD_SRC.slice(
      WIZARD_SRC.indexOf('data-testid="firmware-dfu-recovery-panel"'),
    );
    expect(dfuPanel).toContain("warning");
  });

  it("DFU panel uses visually muted header compared to serial", () => {
    const dfuHeader = WIZARD_SRC.slice(
      WIZARD_SRC.indexOf('data-testid="firmware-dfu-recovery-panel"'),
      WIZARD_SRC.indexOf('data-testid="firmware-dfu-recovery-panel"') + 500,
    );
    expect(dfuHeader).toContain("text-text-secondary");
    expect(dfuHeader).toContain("text-warning/70");
  });
});

describe("Stable selectors", () => {
  const required = [
    "firmware-serial-panel",
    "firmware-source-catalog",
    "firmware-source-local-apj",
    "firmware-dfu-recovery-panel",
    "firmware-start-serial",
    "firmware-start-dfu",
    "firmware-progress-bar",
    "firmware-driver-guidance",
  ];

  for (const selector of required) {
    it(`has stable selector: ${selector}`, () => {
      expect(WIZARD_SRC).toContain(`"${selector}"`);
    });
  }
});

describe("Driver guidance", () => {
  it("renders driver guidance panel in DFU section", () => {
    expect(WIZARD_SRC).toContain('data-testid="firmware-driver-guidance"');
  });

  it("mentions WinUSB and Zadig for Windows", () => {
    expect(WIZARD_SRC).toContain("WinUSB");
    expect(WIZARD_SRC).toContain("Zadig");
  });

  it("mentions udev rules for Linux", () => {
    expect(WIZARD_SRC).toContain("udev");
  });

  it("driver guidance appears inside DFU panel only", () => {
    const serialPanel = WIZARD_SRC.slice(
      WIZARD_SRC.indexOf('data-testid="firmware-serial-panel"'),
      WIZARD_SRC.indexOf('data-testid="firmware-dfu-recovery-panel"'),
    );
    expect(serialPanel).not.toContain("firmware-driver-guidance");

    const dfuPanel = WIZARD_SRC.slice(
      WIZARD_SRC.indexOf('data-testid="firmware-dfu-recovery-panel"'),
    );
    expect(dfuPanel).toContain("firmware-driver-guidance");
  });
});

describe("Parameter backup before flash", () => {
  it("wizard accepts onSaveParams prop", () => {
    expect(WIZARD_SRC).toContain("onSaveParams");
  });

  it("param backup section has stable selector", () => {
    expect(WIZARD_SRC).toContain('data-testid="firmware-param-backup"');
  });

  it("save params button has stable selector", () => {
    expect(WIZARD_SRC).toContain('data-testid="firmware-save-params"');
  });

  it("param backup appears only when connected", () => {
    const backupIdx = WIZARD_SRC.indexOf('data-testid="firmware-param-backup"');
    const nearbyCode = WIZARD_SRC.slice(Math.max(0, backupIdx - 200), backupIdx);
    expect(nearbyCode).toContain("connected");
  });

  it("save button shows confirmation state after saving", () => {
    expect(WIZARD_SRC).toContain("Parameters Saved");
    expect(WIZARD_SRC).toContain("paramsSaved");
  });
});

describe("Catalog source selection", () => {
  it("catalog select dropdown has stable selector", () => {
    expect(WIZARD_SRC).toContain('data-testid="firmware-catalog-select"');
  });

  it("catalog is driven by detected board identity from preflight", () => {
    expect(WIZARD_SRC).toContain("detectedBoardId");
    expect(WIZARD_SRC).toContain("fetchCatalog");
    expect(WIZARD_SRC).not.toContain("manualBoardId");
  });

  it("catalog auto-fetches when detectedBoardId changes", () => {
    expect(WIZARD_SRC).toMatch(/useEffect.*detectedBoardId.*fetchCatalog/s);
  });

  it("catalog entry displays version and platform", () => {
    expect(WIZARD_SRC).toContain("entry.vehicle_type");
    expect(WIZARD_SRC).toContain("entry.version");
    expect(WIZARD_SRC).toContain("entry.platform");
  });

  it("no manual board ID input exists", () => {
    expect(WIZARD_SRC).not.toContain("catalogBoardId");
    expect(WIZARD_SRC).not.toContain("setCatalogBoardId");
  });
});

describe("Connected serial flow invokes reboot-to-bootloader", () => {
  it("handleStartSerial calls rebootToBootloader when connected", () => {
    expect(WIZARD_SRC).toContain("rebootToBootloader");
  });

  it("rebootToBootloader is destructured from firmware hook", () => {
    expect(WIZARD_SRC).toMatch(/rebootToBootloader[\s\S]*?=\s*firmware/s);
  });

  it("reboot is called before flashSerial in the handler", () => {
    const rebootIdx = WIZARD_SRC.indexOf("await rebootToBootloader()");
    const flashIdx = WIZARD_SRC.indexOf("await flashSerial(");
    expect(rebootIdx).toBeGreaterThan(-1);
    expect(flashIdx).toBeGreaterThan(-1);
    expect(rebootIdx).toBeLessThan(flashIdx);
  });

  it("reboot is gated on connected prop", () => {
    const handler = WIZARD_SRC.slice(
      WIZARD_SRC.indexOf("handleStartSerial"),
      WIZARD_SRC.indexOf("handleStartSerial") + 600,
    );
    expect(handler).toContain("if (connected)");
    expect(handler).toContain("rebootToBootloader");
  });

  it("reboot failure aborts the flash and shows error toast", () => {
    const handler = WIZARD_SRC.slice(
      WIZARD_SRC.indexOf("handleStartSerial"),
      WIZARD_SRC.indexOf("handleStartSerial") + 600,
    );
    expect(handler).toContain("reboot flight controller into bootloader");
    expect(handler).toContain("return");
  });
});

describe("recovery-needed or unsupported outcomes in UI", () => {
  it("serial verified outcome shows success banner", () => {
    expect(WIZARD_SRC).toContain("verified successfully");
    expect(WIZARD_SRC).toContain('"success"');
  });

  it("serial flashed_but_unverified outcome shows warning banner", () => {
    expect(WIZARD_SRC).toContain("could not be verified");
    expect(WIZARD_SRC).toContain("Power-cycle");
  });

  it("serial failed outcome shows error banner", () => {
    expect(WIZARD_SRC).toContain("Flash failed");
  });

  it("dfu unsupported_recovery_path outcome renders guidance text", () => {
    const dfuSection = WIZARD_SRC.slice(
      WIZARD_SRC.indexOf('data-testid="firmware-dfu-recovery-panel"'),
    );
    expect(dfuSection).toContain("unsupported_recovery_path");
    expect(dfuSection).toContain("driverGuidance");
  });

  it("verified and flashed_but_unverified use different banner kinds", () => {
    const completedSection = WIZARD_SRC.slice(
      WIZARD_SRC.indexOf("serialCompleted && serialOutcome"),
    );
    expect(completedSection).toContain('kind="success"');
    expect(completedSection).toContain('kind="warning"');
    expect(completedSection).toContain('kind="error"');
  });
});

describe("FirmwareSection wrapper", () => {
  it("imports SetupSectionIntro from shared module", () => {
    expect(SECTION_SRC).toMatch(
      /import.*SetupSectionIntro.*from.*shared\/SetupSectionIntro/,
    );
  });

  it("imports FirmwareFlashWizard", () => {
    expect(SECTION_SRC).toMatch(
      /import.*FirmwareFlashWizard.*from.*FirmwareFlashWizard/,
    );
  });

  it("renders SetupSectionIntro with firmware title", () => {
    expect(SECTION_SRC).toContain("<SetupSectionIntro");
    expect(SECTION_SRC).toContain('title="Firmware"');
  });

  it("renders FirmwareFlashWizard", () => {
    expect(SECTION_SRC).toContain("<FirmwareFlashWizard");
  });

  it("passes firmware and connected props to wizard", () => {
    expect(SECTION_SRC).toContain("firmware={firmware}");
    expect(SECTION_SRC).toContain("connected={connected}");
  });

  it("passes onSaveParams prop to wizard", () => {
    expect(SECTION_SRC).toContain("onSaveParams={onSaveParams}");
  });
});
