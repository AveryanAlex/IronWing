import { describe, expect, it } from "vitest";

import { createSharedBaseMapOptions } from "./base-map";

describe("shared base map options", () => {
  it("binds the supplied container and enables antialiasing", () => {
    const container = {} as HTMLElement;

    expect(createSharedBaseMapOptions({ style: "map-style" }, container)).toEqual({
      style: "map-style",
      container,
      canvasContextAttributes: {
        antialias: true,
      },
    });
  });

  it("preserves canvas context preferences while enforcing antialiasing", () => {
    const container = {} as HTMLElement;

    expect(createSharedBaseMapOptions({
      canvasContextAttributes: {
        antialias: false,
        powerPreference: "high-performance",
      },
    }, container)).toEqual({
      container,
      canvasContextAttributes: {
        antialias: true,
        powerPreference: "high-performance",
      },
    });
  });
});
