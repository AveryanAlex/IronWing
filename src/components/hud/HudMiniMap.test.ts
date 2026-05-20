// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VEHICLE_MARKER_MOTION_MS } from "../../lib/map-marker-motion";
import HudMiniMap from "./HudMiniMap.svelte";

const maplibreState = vi.hoisted(() => {
  const markers: Array<{
    element: HTMLElement;
    setLngLat: ReturnType<typeof vi.fn>;
    addTo: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    getElement: ReturnType<typeof vi.fn>;
  }> = [];
  const mockMap = {
    easeTo: vi.fn(),
    remove: vi.fn(),
  };

  return {
    markers,
    mockMap,
  };
});

vi.mock("maplibre-gl", () => {
  function MockMap() {
    return maplibreState.mockMap;
  }

  function MockMarker(options?: { element?: HTMLElement }) {
    const element = options?.element ?? document.createElement("div");
    const marker = {
      setLngLat: vi.fn().mockReturnThis(),
      addTo: vi.fn().mockReturnThis(),
      remove: vi.fn(),
      getElement: vi.fn(() => element),
    };
    maplibreState.markers.push({ element, ...marker });
    return marker;
  }

  return {
    default: {
      Map: MockMap,
      Marker: MockMarker,
    },
  };
});

describe("HudMiniMap", () => {
  beforeEach(() => {
    maplibreState.markers.length = 0;
    maplibreState.mockMap.easeTo.mockReset();
    maplibreState.mockMap.remove.mockReset();
    vi.useRealTimers();
  });

  afterEach(() => {
    cleanup();
  });

  it("smoothly recenters the map in sync with vehicle marker motion", async () => {
    const { rerender } = render(HudMiniMap, {
      latitude: 47.397742,
      longitude: 8.545594,
      heading: 0,
    });
    await tick();
    maplibreState.mockMap.easeTo.mockClear();

    await rerender({
      latitude: 47.3982,
      longitude: 8.5461,
      heading: 12,
    });
    await tick();

    expect(maplibreState.mockMap.easeTo).toHaveBeenCalledWith({
      center: [8.5461, 47.3982],
      duration: VEHICLE_MARKER_MOTION_MS,
      easing: expect.any(Function),
    });
    const calls = maplibreState.mockMap.easeTo.mock.calls;
    const easing = calls[calls.length - 1]?.[0]?.easing as ((progress: number) => number) | undefined;
    expect(easing?.(0.42)).toBe(0.42);
  });
});
