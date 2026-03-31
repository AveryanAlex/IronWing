// @vitest-environment jsdom

import { cleanup, render, waitFor, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TypedDraftItem } from "../lib/mission-draft-typed";
import {
  commandPosition,
  defaultGeoPoint3d,
  geoPoint3dAltitude,
  geoPoint3dLatLon,
  type MissionCommand,
  type MissionItem,
} from "../lib/mavkit-types";
import { latLonFromBearingDistance } from "../lib/mission-coordinates";
import { MISSION_PATH_SOURCE_ID } from "./mission/MissionPathOverlay";

const {
  mockContainerSize,
  resizeObserverCallbacks,
  fitBoundsSpy,
  resizeSpy,
  buildMissionRenderFeaturesSpy,
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
  const buildMissionRenderFeaturesSpy = vi.fn();
  type EventHandler = (...args: unknown[]) => void;
  let lastMapInstance: unknown = null;

  class MockGeoJSONSource {
    setData = vi.fn();
  }

  class MockMap {
    private readonly container: HTMLDivElement;
    private readonly handlers = new Map<string, Set<EventHandler>>();
    private readonly layers = new Map<string, { id: string; layout?: Record<string, unknown> }>();
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

    addControl() { }

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

    trigger(event: string, ...args: unknown[]) {
      this.emit(event, ...args);
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

    addLayer(layer: { id: string; layout?: Record<string, unknown> }) {
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

    remove() { }

    setLayoutProperty(id: string, name: string, value: unknown) {
      const layer = this.layers.get(id);
      if (!layer) return;
      layer.layout = { ...(layer.layout ?? {}), [name]: value };
    }

    setTerrain() { }

    setSky() { }

    getCanvas() {
      return this.canvas;
    }

    project() {
      return { x: 0, y: 0 };
    }

    unproject() {
      return { lat: 0, lng: 0 };
    }

    easeTo() { }

    flyTo() { }

    jumpTo() { }

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

    remove() { }

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

  class MockNavigationControl { }
  class MockGlobeControl { }
  class MockTerrainControl { }

  return {
    mockContainerSize,
    resizeObserverCallbacks,
    fitBoundsSpy,
    resizeSpy,
    buildMissionRenderFeaturesSpy,
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

vi.mock("../lib/mission-path-render", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/mission-path-render")>();
  buildMissionRenderFeaturesSpy.mockImplementation(actual.buildMissionRenderFeatures);
  return {
    ...actual,
    buildMissionRenderFeatures: buildMissionRenderFeaturesSpy,
  };
});

import { MissionMap } from "./MissionMap";

class MockResizeObserver {
  private readonly callback: () => void;

  constructor(callback: () => void) {
    this.callback = callback;
  }

  observe() {
    resizeObserverCallbacks.push(this.callback);
  }

  disconnect() { }
}

function makeMissionItem(command: MissionCommand): MissionItem {
  return {
    command,
    current: false,
    autocontinue: true,
  };
}

function makeDraftItem(index: number, command: MissionCommand): TypedDraftItem {
  const position = commandPosition(command);
  const preview = position
    ? (() => {
      const { latitude_deg, longitude_deg } = geoPoint3dLatLon(position);
      const { value: altitude_m } = geoPoint3dAltitude(position);
      return { latitude_deg, longitude_deg, altitude_m };
    })()
    : {
      latitude_deg: null,
      longitude_deg: null,
      altitude_m: null,
    };

  return {
    uiId: index + 1,
    index,
    document: makeMissionItem(command),
    preview,
    readOnly: false,
  } satisfies TypedDraftItem;
}

function waypoint(index: number, latitude_deg: number, longitude_deg: number): TypedDraftItem {
  return makeDraftItem(index, {
    Nav: {
      Waypoint: {
        position: defaultGeoPoint3d(latitude_deg, longitude_deg, 30),
        hold_time_s: 0,
        acceptance_radius_m: 1,
        pass_radius_m: 0,
        yaw_deg: 0,
      },
    },
  });
}

function splineWaypoint(index: number, latitude_deg: number, longitude_deg: number): TypedDraftItem {
  return makeDraftItem(index, {
    Nav: {
      SplineWaypoint: {
        position: defaultGeoPoint3d(latitude_deg, longitude_deg, 30),
        hold_time_s: 0,
      },
    },
  });
}

function arcWaypoint(
  index: number,
  latitude_deg: number,
  longitude_deg: number,
  arc_angle_deg: number,
  direction: "Clockwise" | "CounterClockwise",
): TypedDraftItem {
  return makeDraftItem(index, {
    Nav: {
      ArcWaypoint: {
        position: defaultGeoPoint3d(latitude_deg, longitude_deg, 30),
        arc_angle_deg,
        direction,
      },
    },
  });
}

function loiterTurns(
  index: number,
  latitude_deg: number,
  longitude_deg: number,
  radius_m: number,
  direction: "Clockwise" | "CounterClockwise" = "Clockwise",
): TypedDraftItem {
  return makeDraftItem(index, {
    Nav: {
      LoiterTurns: {
        position: defaultGeoPoint3d(latitude_deg, longitude_deg, 30),
        turns: 1,
        radius_m,
        direction,
        exit_xtrack: false,
      },
    },
  });
}

function offsetPoint(
  reference: { latitude_deg: number; longitude_deg: number },
  bearing_deg: number,
  distance_m: number,
): { lat: number; lon: number } {
  return latLonFromBearingDistance(reference, bearing_deg, distance_m);
}

describe("MissionMap", () => {
  beforeEach(() => {
    cleanup();
    fitBoundsSpy.mockClear();
    resizeSpy.mockClear();
    buildMissionRenderFeaturesSpy.mockClear();
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
        missionItems={[waypoint(0, 47.4, 8.55)]}
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

  it("calls onBlankMapClick for plain map clicks and suppresses it during polygon drawing", async () => {
    const onBlankMapClick = vi.fn();
    const onPolygonClick = vi.fn();

    const { rerender } = render(
      <MissionMap
        missionItems={[waypoint(0, 47.4, 8.55)]}
        homePosition={{ latitude_deg: 47.397742, longitude_deg: 8.545594, altitude_m: 0 }}
        selectedIndex={null}
        onBlankMapClick={onBlankMapClick}
      />,
    );

    await waitFor(() => {
      expect(getLastMapInstance()).not.toBeNull();
    });

    act(() => {
      (getLastMapInstance() as InstanceType<typeof MockMap>).trigger("click", {
        point: { x: 24, y: 16 },
        lngLat: { lat: 47.41, lng: 8.56 },
        originalEvent: { altKey: false },
      });
    });

    expect(onBlankMapClick).toHaveBeenCalledWith(47.41, 8.56, { altKey: false });

    rerender(
      <MissionMap
        missionItems={[waypoint(0, 47.4, 8.55)]}
        homePosition={{ latitude_deg: 47.397742, longitude_deg: 8.545594, altitude_m: 0 }}
        selectedIndex={null}
        onBlankMapClick={onBlankMapClick}
        isDrawingPolygon
        polygonVertices={[]}
        onPolygonClick={onPolygonClick}
      />,
    );

    act(() => {
      (getLastMapInstance() as InstanceType<typeof MockMap>).trigger("click", {
        point: { x: 12, y: 8 },
        lngLat: { lat: 47.42, lng: 8.57 },
        originalEvent: { altKey: false },
      });
    });

    expect(onBlankMapClick).toHaveBeenCalledTimes(1);
    expect(onPolygonClick).toHaveBeenCalledWith(47.42, 8.57);
  });

  it("pushes mixed spline, arc, loiter, and label features into the mission path overlay", async () => {
    const homePosition = {
      latitude_deg: 47.397742,
      longitude_deg: 8.545594,
      altitude_m: 488,
    };
    const wp1 = offsetPoint(homePosition, 90, 100);
    const spline1 = offsetPoint(homePosition, 60, 220);
    const arcTarget = offsetPoint(homePosition, 45, 320);
    const loiterPoint = offsetPoint(homePosition, 90, 430);
    const wp2 = offsetPoint(homePosition, 120, 560);
    const missionItems = [
      waypoint(0, wp1.lat, wp1.lon),
      splineWaypoint(1, spline1.lat, spline1.lon),
      arcWaypoint(2, arcTarget.lat, arcTarget.lon, 60, "CounterClockwise"),
      loiterTurns(3, loiterPoint.lat, loiterPoint.lon, 80),
      waypoint(4, wp2.lat, wp2.lon),
    ];

    render(
      <MissionMap
        missionItems={missionItems}
        homePosition={homePosition}
        selectedIndex={null}
      />,
    );

    await waitFor(() => {
      const map = getLastMapInstance() as InstanceType<typeof MockMap> | null;
      expect(map).not.toBeNull();
      expect(map?.getSource(MISSION_PATH_SOURCE_ID)?.setData).toHaveBeenCalled();
    });

    expect(buildMissionRenderFeaturesSpy).toHaveBeenCalledWith(homePosition, missionItems, { currentSeq: undefined });

    const map = getLastMapInstance() as InstanceType<typeof MockMap>;
    const source = map.getSource(MISSION_PATH_SOURCE_ID);
    const calls = source?.setData.mock.calls ?? [];
    const payload = calls[calls.length - 1]?.[0];

    expect(payload?.type).toBe("FeatureCollection");
    expect(payload?.features).toHaveLength(11);
    expect(payload?.features.filter((feature: { properties?: { kind?: string } }) => feature.properties?.kind === "loiter")).toHaveLength(1);
    expect(payload?.features.filter((feature: { properties?: { kind?: string } }) => feature.properties?.kind === "label")).toHaveLength(5);
    expect(
      payload?.features.filter((feature: { properties?: { kind?: string } }) =>
        ["straight", "spline", "arc"].includes(feature.properties?.kind ?? ""),
      ),
    ).toHaveLength(5);
    expect(payload?.features.some((feature: { properties?: { kind?: string } }) => feature.properties?.kind === "spline")).toBe(true);
    expect(payload?.features.some((feature: { properties?: { kind?: string } }) => feature.properties?.kind === "arc")).toBe(true);
  });
});
