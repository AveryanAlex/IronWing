// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OsdScreenRender } from "../../../../lib/osd/ardupilot-osd-renderer";
import OsdGlyphCanvas from "./OsdGlyphCanvas.svelte";

const originalImage = globalThis.Image;
const originalGetContext = HTMLCanvasElement.prototype.getContext;
const drawImage = vi.fn();
const clearRect = vi.fn();

class ValidAtlasImage {
  naturalWidth = 36;
  naturalHeight = 13_824;
  decoding = "auto";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

const frame: OsdScreenRender = {
  glyphs: [{ x: 2, y: 3, glyph: 65, ownerKey: "MESSAGE" }],
  items: new Map(),
  partialItemKeys: [],
};

beforeEach(() => {
  drawImage.mockReset();
  clearRect.mockReset();
  Object.defineProperty(globalThis, "Image", { configurable: true, value: ValidAtlasImage });
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: vi.fn(() => ({ drawImage, clearRect, imageSmoothingEnabled: true })),
  });
});

afterEach(() => {
  cleanup();
  Object.defineProperty(globalThis, "Image", { configurable: true, value: originalImage });
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", { configurable: true, value: originalGetContext });
});

describe("OsdGlyphCanvas", () => {
  it("draws the requested 36×54 glyph crop at its native character-grid position", async () => {
    const onAtlasError = vi.fn();
    const { container } = render(OsdGlyphCanvas, {
      props: {
        grid: { columns: 50, rows: 18, label: "HD 50 x 18" },
        render: frame,
        onAtlasError,
      },
    });

    const canvas = container.querySelector("canvas");
    expect(canvas?.width).toBe(1_800);
    expect(canvas?.height).toBe(972);
    await waitFor(() => expect(drawImage).toHaveBeenCalledTimes(1));
    expect(drawImage.mock.calls[0]?.slice(1)).toEqual([
      0,
      65 * 54,
      36,
      54,
      2 * 36,
      3 * 54,
      36,
      54,
    ]);
    expect(onAtlasError).toHaveBeenLastCalledWith(null);
  });

  it("reports invalid atlas dimensions instead of drawing corrupted glyphs", async () => {
    class InvalidAtlasImage extends ValidAtlasImage {
      naturalHeight = 54;
    }
    Object.defineProperty(globalThis, "Image", { configurable: true, value: InvalidAtlasImage });
    const onAtlasError = vi.fn();

    render(OsdGlyphCanvas, {
      props: {
        grid: { columns: 30, rows: 16, label: "SD 30 x 16" },
        render: frame,
        onAtlasError,
      },
    });

    await waitFor(() => expect(onAtlasError).toHaveBeenCalledWith(expect.stringContaining("expected 36×13824")));
    expect(drawImage).not.toHaveBeenCalled();
  });
});
