import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  vehicleTypeToPreset,
  getActiveSlotIndex,
  modeNameForValue,
  isCopterVehicle,
  getBitmaskBit,
  toggleBitmaskBit,
  buildPresetPreview,
  buildPresetPreviewRows,
} from "./FlightModesSection";
import type { ParamInputParams } from "../primitives/param-helpers";
import type { ParamStore } from "../../../params";
import type { FlightModeEntry, Telemetry } from "../../../telemetry";

const SECTION_SRC = readFileSync(resolve(__dirname, "FlightModesSection.tsx"), "utf-8");

function makeStore(entries: Record<string, number>): ParamStore {
  const params: ParamStore["params"] = {};
  let i = 0;
  for (const [name, value] of Object.entries(entries)) {
    params[name] = { name, value, param_type: "real32", index: i++ };
  }
  return { params, expected_count: i };
}

function makeParams(overrides: Partial<ParamInputParams> = {}): ParamInputParams {
  return {
    store: null,
    staged: new Map(),
    metadata: null,
    stage: () => {},
    ...overrides,
  };
}

const COPTER_MODES: FlightModeEntry[] = [
  { custom_mode: 0, name: "Stabilize" },
  { custom_mode: 2, name: "AltHold" },
  { custom_mode: 3, name: "Auto" },
  { custom_mode: 5, name: "Loiter" },
  { custom_mode: 6, name: "RTL" },
  { custom_mode: 9, name: "Land" },
];

describe("vehicleTypeToPreset", () => {
  it("detects copter variants", () => {
    expect(vehicleTypeToPreset("Quadrotor")).toBe("copter");
    expect(vehicleTypeToPreset("Helicopter")).toBe("copter");
    expect(vehicleTypeToPreset("Hexarotor")).toBe("copter");
  });

  it("detects plane", () => {
    expect(vehicleTypeToPreset("Fixed_Wing")).toBe("plane");
    expect(vehicleTypeToPreset("Plane")).toBe("plane");
  });

  it("detects rover", () => {
    expect(vehicleTypeToPreset("Ground_Rover")).toBe("rover");
    expect(vehicleTypeToPreset("Boat")).toBe("rover");
  });

  it("returns null for unknown or undefined", () => {
    expect(vehicleTypeToPreset(undefined)).toBeNull();
    expect(vehicleTypeToPreset("Submarine")).toBeNull();
  });
});

describe("getActiveSlotIndex", () => {
  it("returns correct slot for PWM in range", () => {
    const tel = { rc_channels: [0, 0, 0, 0, 1100] } as unknown as Telemetry;
    expect(getActiveSlotIndex(tel, 5)).toBe(0);
  });

  it("returns slot 5 for PWM >= 1750", () => {
    const tel = { rc_channels: [0, 0, 0, 0, 1800] } as unknown as Telemetry;
    expect(getActiveSlotIndex(tel, 5)).toBe(5);
  });

  it("returns null for null telemetry", () => {
    expect(getActiveSlotIndex(null, 5)).toBeNull();
  });

  it("returns null for missing rc_channels", () => {
    expect(getActiveSlotIndex({} as Telemetry, 5)).toBeNull();
  });

  it("returns null for invalid PWM values (0 and 65535)", () => {
    const tel0 = { rc_channels: [0, 0, 0, 0, 0] } as unknown as Telemetry;
    expect(getActiveSlotIndex(tel0, 5)).toBeNull();
    const telMax = { rc_channels: [0, 0, 0, 0, 65535] } as unknown as Telemetry;
    expect(getActiveSlotIndex(telMax, 5)).toBeNull();
  });
});

describe("modeNameForValue", () => {
  it("returns mode name from availableModes", () => {
    expect(modeNameForValue(5, COPTER_MODES)).toBe("Loiter");
  });

  it("falls back to provided fallback", () => {
    expect(modeNameForValue(999, COPTER_MODES, "FBW-A")).toBe("FBW-A");
  });

  it("falls back to Mode N when no match and no fallback", () => {
    expect(modeNameForValue(999, COPTER_MODES)).toBe("Mode 999");
  });
});

describe("isCopterVehicle", () => {
  it("returns true for copter types", () => {
    expect(isCopterVehicle("Quadrotor")).toBe(true);
    expect(isCopterVehicle("Tricopter")).toBe(true);
  });

  it("returns false for non-copter types", () => {
    expect(isCopterVehicle("Plane")).toBe(false);
    expect(isCopterVehicle(undefined)).toBe(false);
  });
});

describe("getBitmaskBit", () => {
  it("returns true when bit is set", () => {
    const params = makeParams({ staged: new Map([["SIMPLE", 0b000101]]) });
    expect(getBitmaskBit(params, "SIMPLE", 0)).toBe(true);
    expect(getBitmaskBit(params, "SIMPLE", 2)).toBe(true);
  });

  it("returns false when bit is not set", () => {
    const params = makeParams({ staged: new Map([["SIMPLE", 0b000101]]) });
    expect(getBitmaskBit(params, "SIMPLE", 1)).toBe(false);
  });

  it("returns false when param is null", () => {
    const params = makeParams();
    expect(getBitmaskBit(params, "SIMPLE", 0)).toBe(false);
  });
});

describe("toggleBitmaskBit", () => {
  it("toggles a bit on", () => {
    const stage = vi.fn();
    const params = makeParams({ staged: new Map([["SIMPLE", 0b000000]]), stage });
    toggleBitmaskBit(params, "SIMPLE", 2);
    expect(stage).toHaveBeenCalledWith("SIMPLE", 0b000100);
  });

  it("toggles a bit off", () => {
    const stage = vi.fn();
    const params = makeParams({ staged: new Map([["SIMPLE", 0b000100]]), stage });
    toggleBitmaskBit(params, "SIMPLE", 2);
    expect(stage).toHaveBeenCalledWith("SIMPLE", 0b000000);
  });

  it("defaults to 0 when param is null", () => {
    const stage = vi.fn();
    const params = makeParams({ stage });
    toggleBitmaskBit(params, "SUPER_SIMPLE", 3);
    expect(stage).toHaveBeenCalledWith("SUPER_SIMPLE", 0b001000);
  });
});

describe("buildPresetPreview", () => {
  it("returns 6 entries for copter preset", () => {
    const preview = buildPresetPreview("copter", COPTER_MODES);
    expect(preview).toHaveLength(6);
  });

  it("uses mode names from availableModes when found", () => {
    const preview = buildPresetPreview("copter", COPTER_MODES);
    expect(preview[0]).toEqual({ slot: 1, paramName: "FLTMODE1", modeName: "Stabilize" });
    expect(preview[2]).toEqual({ slot: 3, paramName: "FLTMODE3", modeName: "Loiter" });
    expect(preview[3]).toEqual({ slot: 4, paramName: "FLTMODE4", modeName: "RTL" });
  });

  it("falls back to preset labels for unknown modes", () => {
    const preview = buildPresetPreview("copter", []);
    expect(preview[0].modeName).toBe("Stabilize");
    expect(preview[5].modeName).toBe("Auto");
  });

  it("generates correct param names for each slot", () => {
    const preview = buildPresetPreview("plane", []);
    expect(preview.map((e) => e.paramName)).toEqual([
      "FLTMODE1", "FLTMODE2", "FLTMODE3", "FLTMODE4", "FLTMODE5", "FLTMODE6",
    ]);
  });
});

describe("FlightModesSection structural contract", () => {
  it("does not immediately call applyPreset on button click (no one-click staging)", () => {
    const presetStart = SECTION_SRC.indexOf("Recommended Preset");
    const presetEnd = SECTION_SRC.indexOf("Mode channel selector");
    const presetButtonBlock = SECTION_SRC.slice(presetStart, presetEnd);
    expect(presetButtonBlock).not.toMatch(/onClick=\{[^}]*applyPreset/);
    expect(presetButtonBlock).toMatch(/setPresetPreviewOpen/);
  });

  it("renders a PreviewStagePanel when preview is open", () => {
    expect(SECTION_SRC).toMatch(/PreviewStagePanel/);
    expect(SECTION_SRC).toMatch(/presetPreviewOpen/);
  });

  it("PreviewStagePanel has Stage and Cancel actions", () => {
    expect(SECTION_SRC).toMatch(/Stage These Modes/);
    expect(SECTION_SRC).toMatch(/Cancel/);
  });

  it("PreviewStagePanel calls buildPresetPreview for slot-to-mode mapping", () => {
    expect(SECTION_SRC).toMatch(/buildPresetPreview\(/);
  });

  it("uses SimpleToggleChip instead of raw checkbox inputs for Simple/Super Simple", () => {
    const slotRow = SECTION_SRC.slice(
      SECTION_SRC.indexOf("function ModeSlotRow("),
      SECTION_SRC.indexOf("export function FlightModesSection("),
    );
    expect(slotRow).not.toMatch(/<input[\s\S]*?type="checkbox"/);
    expect(slotRow).toMatch(/SimpleToggleChip/);
  });

  it("SimpleToggleChip renders readable labels not bare S/SS", () => {
    const chipBlock = SECTION_SRC.slice(
      SECTION_SRC.indexOf("function SimpleToggleChip("),
      SECTION_SRC.indexOf("function ModeSlotRow("),
    );
    expect(chipBlock).toMatch(/\{label\}/);
    const slotRow = SECTION_SRC.slice(
      SECTION_SRC.indexOf("function ModeSlotRow("),
      SECTION_SRC.indexOf("export function FlightModesSection("),
    );
    expect(slotRow).toMatch(/label="Simple"/);
    expect(slotRow).toMatch(/label="Super"/);
  });

  it("includes compact explanatory note for Simple vs Super Simple (copter-only)", () => {
    expect(SECTION_SRC).toMatch(/relative.*heading.*arm.*compass/i);
    expect(SECTION_SRC).toMatch(/relative.*home.*direction.*GPS.*required/i);
  });

  it("resolves Simple/Super Simple docs via the centralized registry", () => {
    expect(SECTION_SRC).toContain('resolveDocsUrl("simple_super_simple_modes"');
    expect(SECTION_SRC).toContain("<DocsLink");
    expect(SECTION_SRC).not.toMatch(/const SIMPLE_DOCS_URL/);
  });

  it("docs note is gated behind copter check", () => {
    const mainFnBody = SECTION_SRC.slice(
      SECTION_SRC.indexOf("export function FlightModesSection("),
    );
    const docsLinkIdx = mainFnBody.indexOf("Simple & Super Simple Docs");
    const docsBlock = mainFnBody.slice(Math.max(0, docsLinkIdx - 1000), docsLinkIdx + 50);
    expect(docsBlock).toMatch(/copter/);
  });

  it("preserves copter-only gating for Simple/Super Simple column headers", () => {
    const mainFn = SECTION_SRC.slice(
      SECTION_SRC.indexOf("export function FlightModesSection("),
    );
    expect(mainFn).toMatch(/copter.*Simple.*Super Simple/s);
  });
});

// ---------------------------------------------------------------------------
// buildPresetPreviewRows — PreviewRow[] with willChange
// ---------------------------------------------------------------------------

describe("buildPresetPreviewRows", () => {
  it("returns 6 PreviewRow entries for copter preset", () => {
    const rows = buildPresetPreviewRows("copter", COPTER_MODES, makeParams());
    expect(rows).toHaveLength(6);
  });

  it("each row has key, label, paramName, and willChange", () => {
    const rows = buildPresetPreviewRows("copter", COPTER_MODES, makeParams());
    for (const row of rows) {
      expect(row).toHaveProperty("key");
      expect(row).toHaveProperty("label");
      expect(row).toHaveProperty("paramName");
      expect(row).toHaveProperty("willChange");
    }
  });

  it("willChange is true when current value differs from preset", () => {
    const store = makeStore({ FLTMODE1: 999, FLTMODE2: 999 });
    const params = makeParams({ store });
    const rows = buildPresetPreviewRows("copter", COPTER_MODES, params);
    expect(rows[0].willChange).toBe(true);
    expect(rows[1].willChange).toBe(true);
  });

  it("willChange is false when current value matches preset", () => {
    // Copter preset slot 1 = mode 0 (Stabilize)
    const store = makeStore({ FLTMODE1: 0 });
    const params = makeParams({ store });
    const rows = buildPresetPreviewRows("copter", COPTER_MODES, params);
    expect(rows[0].willChange).toBe(false);
  });

  it("willChange is true when param is null (not yet loaded)", () => {
    const rows = buildPresetPreviewRows("copter", COPTER_MODES, makeParams());
    // null !== modeNum → true
    expect(rows[0].willChange).toBe(true);
  });

  it("label is the slot identifier without mode name", () => {
    const rows = buildPresetPreviewRows("copter", COPTER_MODES, makeParams());
    expect(rows[0].label).toBe("Slot 1");
    expect(rows[2].label).toBe("Slot 3");
  });

  it("detail shows proposed mode name when current value is null", () => {
    const rows = buildPresetPreviewRows("copter", COPTER_MODES, makeParams());
    expect(rows[0].detail).toBe("Stabilize");
  });

  it("detail shows current → proposed delta when value differs", () => {
    const store = makeStore({ FLTMODE1: 5 });
    const params = makeParams({ store });
    const rows = buildPresetPreviewRows("copter", COPTER_MODES, params);
    expect(rows[0].detail).toBe("Loiter → Stabilize");
  });

  it("detail shows mode name without arrow when already set", () => {
    const store = makeStore({ FLTMODE1: 0 });
    const params = makeParams({ store });
    const rows = buildPresetPreviewRows("copter", COPTER_MODES, params);
    expect(rows[0].detail).toBe("Stabilize");
    expect(rows[0].willChange).toBe(false);
  });

  it("paramName matches FLTMODE{N} pattern", () => {
    const rows = buildPresetPreviewRows("plane", [], makeParams());
    expect(rows.map((r) => r.paramName)).toEqual([
      "FLTMODE1", "FLTMODE2", "FLTMODE3", "FLTMODE4", "FLTMODE5", "FLTMODE6",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Structural contract: shared primitives
// ---------------------------------------------------------------------------

describe("FlightModesSection structural — shared primitives", () => {
  it("imports SetupSectionIntro from shared", () => {
    expect(SECTION_SRC).toMatch(/import.*SetupSectionIntro.*from.*shared\/SetupSectionIntro/);
  });

  it("imports SectionCardHeader from shared", () => {
    expect(SECTION_SRC).toMatch(/import.*SectionCardHeader.*from.*shared\/SectionCardHeader/);
  });

  it("imports PreviewStagePanel from shared", () => {
    expect(SECTION_SRC).toMatch(/import.*PreviewStagePanel.*from.*shared\/PreviewStagePanel/);
  });

  it("uses SetupSectionIntro component", () => {
    expect(SECTION_SRC).toContain("<SetupSectionIntro");
  });

  it("uses SectionCardHeader for card headers", () => {
    expect(SECTION_SRC).toContain("<SectionCardHeader");
  });

  it("uses PreviewStagePanel instead of local PresetPreviewPanel", () => {
    expect(SECTION_SRC).toContain("<PreviewStagePanel");
    expect(SECTION_SRC).not.toMatch(/function PresetPreviewPanel/);
  });

  it("accepts navigateToParam prop", () => {
    expect(SECTION_SRC).toMatch(/navigateToParam\?.*=>.*void/);
  });

  it("wires onRowClick to navigateToParam", () => {
    expect(SECTION_SRC).toMatch(/onRowClick/);
    expect(SECTION_SRC).toMatch(/navigateToParam/);
  });

  it("has a section-level intro with 'Flight Modes' title (not just the preset intro)", () => {
    expect(SECTION_SRC).toContain('title="Flight Modes"');
  });

  it("section-level intro appears before the Current Flight Mode card", () => {
    const sectionIntroIdx = SECTION_SRC.indexOf('title="Flight Modes"');
    const currentModeIdx = SECTION_SRC.indexOf('title="Current Flight Mode"');
    expect(sectionIntroIdx).toBeGreaterThan(-1);
    expect(currentModeIdx).toBeGreaterThan(-1);
    expect(sectionIntroIdx).toBeLessThan(currentModeIdx);
  });

  it("section-level intro does not hardcode a docs URL (no flight_modes topic in registry)", () => {
    const introBlock = SECTION_SRC.slice(
      SECTION_SRC.indexOf('title="Flight Modes"') - 200,
      SECTION_SRC.indexOf('title="Flight Modes"') + 50,
    );
    expect(introBlock).not.toMatch(/docsUrl=/);
  });
});
