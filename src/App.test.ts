import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("App panel framing architecture", () => {
  const src = readFileSync(resolve(__dirname, "App.tsx"), "utf-8");

  it("does not apply p-2 or p-3 padding directly to <main>", () => {
    const mainTag = src.match(/<main[^>]*>/s);
    expect(mainTag).not.toBeNull();
    expect(mainTag![0]).not.toContain("p-2");
    expect(mainTag![0]).not.toContain("p-3");
  });

  it("imports and uses InsetPanelFrame for non-setup tabs", () => {
    expect(src).toContain('import { InsetPanelFrame } from "./components/InsetPanelFrame"');
    expect(src).toContain("<InsetPanelFrame>");
  });

  it("renders SetupSectionPanel outside of InsetPanelFrame (setup is the if-branch)", () => {
    const setupIdx = src.indexOf("<SetupSectionPanel");
    const frameIdx = src.indexOf("<InsetPanelFrame>");
    expect(setupIdx).toBeGreaterThan(-1);
    expect(frameIdx).toBeGreaterThan(-1);
    expect(setupIdx).toBeLessThan(frameIdx);
  });

  it("uses InsetPanelFrame exactly once (single wrapper, not per-tab)", () => {
    const matches = src.match(/<InsetPanelFrame>/g);
    expect(matches).toHaveLength(1);
  });

  it("preserves mobile safe-area paddingTop for all tabs", () => {
    expect(src).toMatch(/paddingTop.*isMobile.*safe-area-top/s);
    expect(src).not.toMatch(/paddingTop.*activeTab/);
  });
});
