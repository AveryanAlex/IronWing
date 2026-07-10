import { describe, expect, it } from "vitest";

import { captureOsdGrabOffset, osdDropToGrid, osdPointerToGrid } from "./osd-placement";

const bounds = { left: 0, top: 0, width: 300, height: 160 };
const grid = { columns: 30, rows: 16 };

describe("osd placement", () => {
  it("preserves the cell under the chip when pointer drag begins", () => {
    const grab = captureOsdGrabOffset({
      clientX: 140,
      clientY: 90,
      bounds,
      grid,
      item: { x: 10, y: 5 },
    });

    expect(grab).toEqual({ xCells: 4, yCells: 4 });
    expect(osdPointerToGrid({ clientX: 140, clientY: 90, bounds, grid, grab: grab! })).toEqual({ x: 10, y: 5 });
  });

  it("preserves a non-zero pointer-to-chip offset while moving", () => {
    const grab = captureOsdGrabOffset({
      clientX: 125,
      clientY: 55,
      bounds,
      grid,
      item: { x: 10, y: 5 },
    });

    expect(grab).toEqual({ xCells: 2.5, yCells: 0.5 });
    expect(osdPointerToGrid({ clientX: 175, clientY: 95, bounds, grid, grab: grab! })).toEqual({ x: 15, y: 9 });
  });

  it("maps a native grid-chip drop with its captured grab offset", () => {
    const grab = captureOsdGrabOffset({
      clientX: 140,
      clientY: 90,
      bounds,
      grid,
      item: { x: 10, y: 5 },
    });

    expect(osdPointerToGrid({ clientX: 240, clientY: 120, bounds, grid, grab: grab! })).toEqual({ x: 20, y: 8 });
  });

  it("maps a library drop to the containing grid cell", () => {
    expect(osdDropToGrid({ clientX: 299, clientY: 159, bounds, grid })).toEqual({ x: 29, y: 15 });
  });

  it("clamps negative, right, and bottom drop coordinates", () => {
    expect(osdDropToGrid({ clientX: -1, clientY: -1, bounds, grid })).toEqual({ x: 0, y: 0 });
    expect(osdDropToGrid({ clientX: 300, clientY: 160, bounds, grid })).toEqual({ x: 29, y: 15 });
  });

  it("returns null for invalid grid bounds", () => {
    expect(osdDropToGrid({ clientX: 20, clientY: 20, bounds: { ...bounds, width: 0 }, grid })).toBeNull();
    expect(osdDropToGrid({ clientX: 20, clientY: 20, bounds: { ...bounds, height: 0 }, grid })).toBeNull();
  });
});
