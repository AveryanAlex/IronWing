// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import {
  OSD_DISPLAY_GRID_OPTIONS,
  OSD_DISPLAY_TARGET_PRESETS,
  OSD_DISPLAY_TARGET_STORAGE_KEY,
  createManualOsdDisplayTarget,
  loadOsdDisplayTargetSelection,
  osdDisplayTargetPreset,
  saveOsdDisplayTargetSelection,
} from "./osd-display-target";

afterEach(() => localStorage.clear());

describe("osd-display-target", () => {
  it("keeps device-specific grids even when presets transmit the same mode", () => {
    expect(osdDisplayTargetPreset("walksnail_avatar")).toMatchObject({
      txtResMode: 3,
      columns: 53,
      rows: 20,
    });
    expect(osdDisplayTargetPreset("dji_wtfos")).toMatchObject({
      txtResMode: 3,
      columns: 60,
      rows: 22,
    });
    expect(osdDisplayTargetPreset("hdzero")).toMatchObject({
      txtResMode: 1,
      columns: 50,
      rows: 18,
    });
  });

  it("round-trips every preset and supported manual target", () => {
    const selections = [
      ...OSD_DISPLAY_TARGET_PRESETS,
      ...OSD_DISPLAY_GRID_OPTIONS.flatMap((grid) => [0, 1, 2, 3].map((mode) => (
        createManualOsdDisplayTarget(mode as 0 | 1 | 2 | 3, grid)
      ))),
    ];

    for (const selection of selections) {
      saveOsdDisplayTargetSelection(selection);
      expect(loadOsdDisplayTargetSelection()).toEqual({
        targetId: selection.targetId,
        txtResMode: selection.txtResMode,
        columns: selection.columns,
        rows: selection.rows,
        source: selection.source,
      });
    }
  });

  it("clears corrupt, unknown, and tampered preferences", () => {
    const invalidValues = [
      "not json",
      JSON.stringify({ targetId: "unknown", txtResMode: 3, columns: 53, rows: 20, source: "preset" }),
      JSON.stringify({ targetId: "walksnail_avatar", txtResMode: 3, columns: 60, rows: 22, source: "preset" }),
      JSON.stringify({ targetId: "generic", txtResMode: 7, columns: 30, rows: 16, source: "manual" }),
    ];

    for (const invalid of invalidValues) {
      localStorage.setItem(OSD_DISPLAY_TARGET_STORAGE_KEY, invalid);
      expect(loadOsdDisplayTargetSelection()).toBeNull();
      expect(localStorage.getItem(OSD_DISPLAY_TARGET_STORAGE_KEY)).toBeNull();
    }
  });
});
