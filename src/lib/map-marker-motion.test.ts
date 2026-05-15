import { describe, expect, it, vi } from "vitest";

import { createMarkerMotion, unwrapAngleDeg } from "./map-marker-motion";

describe("unwrapAngleDeg", () => {
  it("keeps clockwise heading changes continuous across north", () => {
    expect(unwrapAngleDeg(359, 0)).toBe(360);
    expect(unwrapAngleDeg(360, 1)).toBe(361);
  });

  it("keeps counter-clockwise heading changes continuous across north", () => {
    expect(unwrapAngleDeg(1, 359)).toBe(-1);
    expect(unwrapAngleDeg(-1, 358)).toBe(-2);
  });
});

describe("createMarkerMotion", () => {
  it("interpolates marker position instead of jumping to the next coordinate", () => {
    let timeMs = 1_000;
    const queuedFrames: FrameRequestCallback[] = [];
    const marker = { setLngLat: vi.fn() };
    const motion = createMarkerMotion({
      durationMs: 100,
      now: () => timeMs,
      requestFrame: (callback) => {
        queuedFrames.push(callback);
        return queuedFrames.length;
      },
      cancelFrame: vi.fn(),
    });

    motion.setInstant(marker, [8, 47]);
    marker.setLngLat.mockClear();

    motion.animateTo(marker, [10, 49]);

    expect(marker.setLngLat).not.toHaveBeenCalledWith([10, 49]);
    expect(queuedFrames).toHaveLength(1);

    timeMs = 1_050;
    queuedFrames.shift()?.(timeMs);
    expect(marker.setLngLat).toHaveBeenLastCalledWith([9, 48]);

    timeMs = 1_100;
    queuedFrames.shift()?.(timeMs);
    expect(marker.setLngLat).toHaveBeenLastCalledWith([10, 49]);
  });
});
