// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SvsMap from "./SvsMap.svelte";

const maplibreState = vi.hoisted(() => {
  const handlers = new Map<string, () => void>();
  const sources = new Map<string, unknown>();
  const layers = new Set<string>();
  const markers: Array<{
    element: HTMLElement;
    setLngLat: ReturnType<typeof vi.fn>;
    addTo: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    getElement: ReturnType<typeof vi.fn>;
  }> = [];
  const missionSource = { setData: vi.fn() };
  const mockMap = {
    addLayer: vi.fn((layer: { id: string }) => layers.add(layer.id)),
    addSource: vi.fn((id: string, source: unknown) => sources.set(id, source)),
    getLayer: vi.fn((id: string) => layers.has(id) ? { id } : null),
    getSource: vi.fn((id: string) => id === "overview-mission-path" && sources.has(id) ? missionSource : sources.get(id) ?? null),
    jumpTo: vi.fn(),
    on: vi.fn((event: string, handler: () => void) => handlers.set(event, handler)),
    remove: vi.fn(),
    setLayoutProperty: vi.fn(),
    setSky: vi.fn(),
    setTerrain: vi.fn(),
  };

  return { handlers, layers, markers, missionSource, mockMap, sources };
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

function waypoint(lat: number, lon: number) {
  return {
    command: {
      Nav: {
        Waypoint: {
          position: {
            RelHome: {
              latitude_deg: lat,
              longitude_deg: lon,
              relative_alt_m: 25,
            },
          },
          hold_time_s: 0,
          acceptance_radius_m: 1,
          pass_radius_m: 0,
          yaw_deg: 0,
        },
      },
    },
    current: false,
    autocontinue: true,
  };
}

describe("SvsMap", () => {
  beforeEach(() => {
    maplibreState.handlers.clear();
    maplibreState.layers.clear();
    maplibreState.markers.length = 0;
    maplibreState.sources.clear();
    maplibreState.missionSource.setData.mockReset();
    Object.values(maplibreState.mockMap).forEach((value) => {
      if (typeof value === "function" && "mockClear" in value) {
        value.mockClear();
      }
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("builds SVS terrain and shared mission overlays", async () => {
    render(SvsMap, {
      latitude_deg: 47.397742,
      longitude_deg: 8.545594,
      heading_deg: 90,
      pitch_deg: 5,
      roll_deg: 2,
      altitude_m: 60,
      homeLatitude: 47.397742,
      homeLongitude: 8.545594,
      missionPlan: { items: [waypoint(47.398, 8.546)] },
      currentMissionIndex: 0,
    });

    maplibreState.handlers.get("style.load")?.();
    await tick();

    expect(maplibreState.mockMap.setTerrain).toHaveBeenCalledWith({ source: "terrainSource", exaggeration: 1.5 });
    expect(maplibreState.missionSource.setData).toHaveBeenCalled();
    expect(maplibreState.markers.some((marker) => marker.element.className.includes("mission-pin"))).toBe(true);
  });
});
