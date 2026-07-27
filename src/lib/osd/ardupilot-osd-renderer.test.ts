import { describe, expect, it } from "vitest";

import {
  KNOWN_ARDUPILOT_OSD_ITEM_KEYS,
  SNEAKY_FPV_ARDU_WS_ATLAS,
  createOsdRenderContext,
  osdFootprintsOverlap,
  renderArduPilotOsdItem,
  renderArduPilotOsdScreen,
} from "./ardupilot-osd-renderer";

describe("ardupilot-osd-renderer", () => {
  it("describes the supplied 1080p Walksnail atlas without using the 24px variant", () => {
    expect(SNEAKY_FPV_ARDU_WS_ATLAS).toEqual({
      src: "/osd/fonts/WS_ARDU_SNEAKY_FPV_36.png",
      glyphWidthPx: 36,
      glyphHeightPx: 54,
      glyphCount: 256,
    });
  });

  it("uses ArduPilot packed decimal glyphs and reports current versus maximum battery width", () => {
    const render = renderArduPilotOsdItem("BAT_VOLT", createOsdRenderContext({
      connected: true,
      telemetry: { battery_voltage_v: 12.3, battery_pct: 80 },
      paramValues: { OSD_OPTIONS: 1 },
    }));

    expect(render.glyphs.map((glyph) => glyph.glyph)).toEqual([
      0x91,
      "1".charCodeAt(0),
      "2".charCodeAt(0) + 0x90,
      "3".charCodeAt(0) + 0xa0,
      0x06,
    ]);
    expect(render.currentFootprint).toEqual({ minX: 0, minY: 0, width: 5, height: 1 });
    expect(render.maxFootprint).toEqual({ minX: 0, minY: 0, width: 6, height: 1 });
    expect(render.fidelity).toBe("live");
  });

  it("follows staged unit options for values and glyphs", () => {
    const metric = renderArduPilotOsdItem("ALTITUDE", createOsdRenderContext({
      telemetry: { altitude_m: 120 },
      homePosition: { latitude_deg: 0, longitude_deg: 0, altitude_m: 100 },
      paramValues: { OSD_UNITS: 0 },
    }));
    const imperial = renderArduPilotOsdItem("ALTITUDE", createOsdRenderContext({
      telemetry: { altitude_m: 120 },
      homePosition: { latitude_deg: 0, longitude_deg: 0, altitude_m: 100 },
      paramValues: { OSD_UNITS: 1 },
    }));

    expect(metric.glyphs.at(-1)?.glyph).toBe(0xb1);
    expect(imperial.glyphs.at(-1)?.glyph).toBe(0xb3);
    expect(String.fromCharCode(...metric.glyphs.slice(0, -1).map((glyph) => glyph.glyph))).toContain("20");
    expect(String.fromCharCode(...imperial.glyphs.slice(0, -1).map((glyph) => glyph.glyph))).toContain("66");
  });

  it("keeps center-anchored horizon and compass maximum footprints", () => {
    const context = createOsdRenderContext({ telemetry: { roll_deg: 12, pitch_deg: -3, heading_deg: 45 } });

    expect(renderArduPilotOsdItem("HORIZON", context).maxFootprint)
      .toEqual({ minX: -4, minY: -4, width: 9, height: 9 });
    expect(renderArduPilotOsdItem("COMPASS", context).maxFootprint)
      .toEqual({ minX: -4, minY: 0, width: 9, height: 1 });
  });

  it("provides a specialized non-empty renderer for every current ArduPilot panel", () => {
    const context = createOsdRenderContext({ nowMs: 1_000 });
    for (const key of KNOWN_ARDUPILOT_OSD_ITEM_KEYS) {
      const render = renderArduPilotOsdItem(key, context);
      expect(render.glyphs.length, key).toBeGreaterThan(0);
      expect(render.maxFootprint.width, key).toBeGreaterThan(0);
      expect(render.maxFootprint.height, key).toBeGreaterThan(0);
    }
  });

  it("clips glyphs at the selected grid and preserves ArduPilot draw-order overwrites", () => {
    const render = renderArduPilotOsdScreen({
      placements: [
        { key: "MESSAGE", x: 0, y: 0 },
        { key: "HEADING", x: 0, y: 0 },
        { key: "ALTITUDE", x: 0, y: 1 },
      ],
      grid: { columns: 5, rows: 2, label: "test" },
      context: createOsdRenderContext({
        statusMessage: "HELLO",
        telemetry: { heading_deg: 123, altitude_m: 5 },
        paramValues: { OSD_OPTIONS: 0 },
      }),
    });

    expect(render.glyphs.every((glyph) => glyph.x >= 0 && glyph.x < 5 && glyph.y >= 0 && glyph.y < 2)).toBe(true);
    expect(render.glyphs.find((glyph) => glyph.x === 0 && glyph.y === 0)?.ownerKey).toBe("HEADING");
    expect(render.glyphs.some((glyph) => glyph.ownerKey === "ALTITUDE" && glyph.x === 4)).toBe(true);
  });

  it("detects maximum-footprint overlap for automatic placement", () => {
    expect(osdFootprintsOverlap(
      { x: 2, y: 2, footprint: { minX: 0, minY: 0, width: 6, height: 1 } },
      { x: 7, y: 2, footprint: { minX: 0, minY: 0, width: 5, height: 1 } },
    )).toBe(true);
    expect(osdFootprintsOverlap(
      { x: 2, y: 2, footprint: { minX: 0, minY: 0, width: 6, height: 1 } },
      { x: 8, y: 2, footprint: { minX: 0, minY: 0, width: 5, height: 1 } },
    )).toBe(false);
  });
});
