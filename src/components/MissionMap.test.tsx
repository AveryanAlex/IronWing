// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TypedDraftItem } from "../lib/mission-draft-typed";

const {
  mockContainerSize,
  resizeObserverCallbacks,
  fitBoundsSpy,
  resizeSpy,
  setLastMapInstance,
  getLastMapInstance,
  MockMap,
  MockMarker,
  MockLngLatBounds,
  MockNavigationControl,
  MockGlobeControl,
  MockTerrainControl,
} = vi.hoisted(() => {
  const mockContainerSize = { width: 0, height: 0 };
  const resizeObserverCallbacks: Array<() => void> = [];
  const fitBoundsSpy = vi.fn();
  const resizeSpy = vi.fn();
  type EventHandler = (...args: unknown[]) => void;
  let lastMapInstance: unknown = null;

  class MockGeoJSONSource {
    setData = vi.fn();
  }

  class MockMap {
    private readonly container: HTMLDivElement;
    private readonly handlers = new Map<string, Set<EventHandler>>();
    private readonly layers = new Map<string, { id: string }>();
    private readonly sources = new Map<string, MockGeoJSONSource>();
    private readonly canvas = document.createElement("canvas");
    private styleLoaded = false;

    constructor(options: { container: HTMLDivElement }) {
      this.container = options.container;
      Object.defineProperty(this.container, "clientWidth", {
        configurable: true,
        get: () => mockContainerSize.width,
      });
      Object.defineProperty(this.container, "clientHeight", {
        configurable: true,
        get: () => mockContainerSize.height,
      });
      lastMapInstance = this;
    }

    setStyle() {
      setTimeout(() => {
        this.styleLoaded = true;
        this.emit("style.load");
      }, 0);
    }

    addControl() {}

    on(event: string, handler: EventHandler) {
      let bucket = this.handlers.get(event);
      if (!bucket) {
        bucket = new Set<EventHandler>();
        this.handlers.set(event, bucket);
      }
      bucket.add(handler);
    }

    off(event: string, handler: EventHandler) {
      this.handlers.get(event)?.delete(handler);
    }

    private emit(event: string, ...args: unknown[]) {
      this.handlers.get(event)?.forEach((handler) => handler(...args));
    }

    addSource(id: string) {
      this.sources.set(id, new MockGeoJSONSource());
    }

    getSource(id: string) {
      return this.sources.get(id);
    }

    removeSource(id: string) {
      this.sources.delete(id);
    }

    addLayer(layer: { id: string }) {
      this.layers.set(layer.id, layer);
    }

    removeLayer(id: string) {
      this.layers.delete(id);
    }

    getLayer(id: string) {
      return this.layers.get(id);
    }

    getStyle() {
      return { layers: Array.from(this.layers.values()) };
    }

    isStyleLoaded() {
      return this.styleLoaded;
    }

    getContainer() {
      return this.container;
    }

    resize() {
      resizeSpy();
    }

    fitBounds() {
      fitBoundsSpy();
    }

    remove() {}

    setLayoutProperty() {}

    setTerrain() {}

    setSky() {}

    getCanvas() {
      return this.canvas;
    }

    project() {
      return { x: 0, y: 0 };
    }

    unproject() {
      return { lat: 0, lng: 0 };
    }

    easeTo() {}

    flyTo() {}

    jumpTo() {}

    getZoom() {
      return 13;
    }
  }

  class MockMarker {
    private readonly element: HTMLElement;
    private draggable: boolean;
    private lngLat = { lng: 0, lat: 0 };

    constructor(options?: { element?: HTMLElement; draggable?: boolean }) {
      this.element = options?.element ?? document.createElement("div");
      this.draggable = options?.draggable ?? false;
    }

    setLngLat(lngLat: [number, number]) {
      this.lngLat = { lng: lngLat[0], lat: lngLat[1] };
      return this;
    }

    addTo() {
      return this;
    }

    remove() {}

    setDraggable(draggable: boolean) {
      this.draggable = draggable;
      return this;
    }

    isDraggable() {
      return this.draggable;
    }

    on() {
      return this;
    }

    getElement() {
      return this.element;
    }

    getLngLat() {
      return this.lngLat;
    }
  }

  class MockLngLatBounds {
    extend() {
      return this;
    }
  }

  class MockNavigationControl {}
  class MockGlobeControl {}
  class MockTerrainControl {}

  return {
    mockContainerSize,
    resizeObserverCallbacks,
    fitBoundsSpy,
    resizeSpy,
    setLastMapInstance: (value: unknown) => {
      lastMapInstance = value;
    },
    getLastMapInstance: () => lastMapInstance,
    MockMap,
    MockMarker,
    MockLngLatBounds,
    MockNavigationControl,
    MockGlobeControl,
    MockTerrainControl,
  };
});

vi.mock("maplibre-gl", () => ({
  default: {
    Map: MockMap,
    Marker: MockMarker,
    LngLatBounds: MockLngLatBounds,
    NavigationControl: MockNavigationControl,
    GlobeControl: MockGlobeControl,
    TerrainControl: MockTerrainControl,
  },
}));

import { MissionMap } from "./MissionMap";

class MockResizeObserver {
  private readonly callback: () => void;

  constructor(callback: () => void) {
    this.callback = callback;
  }

  observe() {
    resizeObserverCallbacks.push(this.callback);
  }

  disconnect() {}
}

function makeMissionItem(index: number, latitude_deg: number, longitude_deg: number): TypedDraftItem {
  return {
    index,
    document: {
      sequence: index,
      frame: "global_relative_alt",
      command: "navigate_to_waypoint",
      params: [0, 0, 0, 0, latitude_deg, longitude_deg, 30],
      autocontinue: true,
    },
    preview: {
      latitude_deg,
      longitude_deg,
      altitude_m: 30,
      frame: "global_relative_alt",
    },
    errors: [],
    warnings: [],
    readOnly: false,
  } as unknown as TypedDraftItem;
}

describe("MissionMap", () => {
  beforeEach(() => {
    cleanup();
    fitBoundsSpy.mockClear();
    resizeSpy.mockClear();
    resizeObserverCallbacks.length = 0;
    mockContainerSize.width = 0;
    mockContainerSize.height = 0;
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    setLastMapInstance(null);
  });

  it("waits for non-zero container size before initial fitBounds", async () => {
    render(
      <MissionMap
        missionItems={[makeMissionItem(0, 47.4, 8.55)]}
        homePosition={{ latitude_deg: 47.397742, longitude_deg: 8.545594, altitude_m: 0 }}
        selectedIndex={null}
      />,
    );

    await waitFor(() => {
      expect(getLastMapInstance()).not.toBeNull();
      expect(resizeSpy).toHaveBeenCalled();
    });

    expect(fitBoundsSpy).not.toHaveBeenCalled();

    mockContainerSize.width = 920;
    mockContainerSize.height = 640;
    resizeObserverCallbacks.forEach((callback) => callback());

    await waitFor(() => {
      expect(fitBoundsSpy).toHaveBeenCalledTimes(1);
    });
  });
});
