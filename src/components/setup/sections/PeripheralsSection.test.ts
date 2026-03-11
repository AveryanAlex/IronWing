import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const src = readFileSync(resolve(__dirname, "PeripheralsSection.tsx"), "utf-8");

describe("PeripheralsSection shared shell chrome", () => {
  it("imports SetupSectionIntro from shared module", () => {
    expect(src).toContain('import { SetupSectionIntro } from "../shared/SetupSectionIntro"');
  });

  it("imports resolveDocsUrl from ardupilot-docs registry", () => {
    expect(src).toContain('import { resolveDocsUrl } from "../../../data/ardupilot-docs"');
  });

  it("renders SetupSectionIntro with Peripherals title", () => {
    expect(src).toContain("<SetupSectionIntro");
    expect(src).toContain('title="Peripherals"');
  });

  it("resolves optional_hardware docs from the central registry", () => {
    expect(src).toContain('resolveDocsUrl("optional_hardware")');
  });

  it("passes peripherals docs URL to the intro", () => {
    expect(src).toContain("docsUrl={peripheralsDocsUrl}");
  });

  it("does not use hardcoded docs URLs", () => {
    expect(src).not.toMatch(/https?:\/\/ardupilot\.org/);
  });

  it("uses the actionSlot for the configured-only filter toggle", () => {
    expect(src).toContain("actionSlot={");
    expect(src).toContain("showConfiguredOnly");
  });
});

describe("PeripheralsSection preserves core behavior", () => {
  it("renders known peripheral groups", () => {
    expect(src).toContain("KNOWN_PERIPHERAL_GROUPS");
    expect(src).toContain("PeripheralGroup");
  });

  it("discovers additional peripheral groups dynamically", () => {
    expect(src).toContain("additionalGroups");
    expect(src).toContain("discoveredPrefixes");
  });

  it("supports configured-only filtering", () => {
    expect(src).toContain("showConfiguredOnly");
    expect(src).toContain("isGroupConfigured");
  });

  it("renders collapsible peripheral cards", () => {
    expect(src).toContain("setExpanded");
    expect(src).toContain("ChevronDown");
    expect(src).toContain("ChevronRight");
  });

  it("chooses controls automatically based on metadata", () => {
    expect(src).toContain("chooseControl");
    expect(src).toContain("ParamBitmaskInput");
    expect(src).toContain("ParamToggle");
    expect(src).toContain("ParamSelect");
    expect(src).toContain("ParamNumberInput");
  });

  it("renders empty state when no groups are visible", () => {
    expect(src).toContain("No peripheral parameters found");
    expect(src).toContain("No configured peripherals found");
  });
});
