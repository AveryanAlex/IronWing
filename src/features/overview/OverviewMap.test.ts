// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const maplibreState = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const markers: Array<{
    element: HTMLElement;
    setLngLat: ReturnType<typeof vi.fn>;
    addTo: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    getElement: ReturnType<typeof vi.fn>;
  }> = [];
  const missionPathSource = { setData: vi.fn() };
  const mockMap = {
    addControl: vi.fn(),
    addSource: vi.fn(),
    addLayer: vi.fn(),
    addImage: vi.fn(),
    hasImage: vi.fn(() => false),
    getSource: vi.fn((id: string) => (id === "overview-mission-path" ? missionPathSource : null)),
    getLayer: vi.fn((_id?: string): unknown => null),
    getStyle: vi.fn(() => ({
      layers: [
        { id: "background", type: "background" },
        { id: "land", type: "fill" },
        { id: "roads", type: "line" },
        { id: "labels", type: "symbol" },
      ],
    })),
    setLayoutProperty: vi.fn(),
    setTerrain: vi.fn(),
    flyTo: vi.fn(),
    easeTo: vi.fn(),
    unproject: vi.fn(([x, y]: [number, number]) => ({ lat: y / 10, lng: x / 10 })),
    getZoom: vi.fn(() => 12),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers.set(event, handler);
    }),
    remove: vi.fn(),
  };

  return {
    handlers,
    markers,
    missionPathSource,
    mockMap,
  };
});

const guidedState = vi.hoisted(() => ({
  startGuidedSession: vi.fn(),
  updateGuidedSession: vi.fn(),
}));

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

  function MockNavigationControl() {
    return {};
  }

  return {
    Map: MockMap,
    Marker: MockMarker,
    NavigationControl: MockNavigationControl,
    setWorkerUrl: vi.fn(),
  };
});

vi.mock("svelte-sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("../../guided", () => ({
  startGuidedSession: guidedState.startGuidedSession,
  updateGuidedSession: guidedState.updateGuidedSession,
}));

import OverviewMap from "./components/OverviewMap.svelte";
import { startGuidedSession } from "../../guided";
import { toast } from "svelte-sonner";

const originalGeolocationDescriptor = Object.getOwnPropertyDescriptor(window.navigator, "geolocation");

function setNavigatorGeolocation(value: Geolocation | undefined) {
  Object.defineProperty(window.navigator, "geolocation", {
    configurable: true,
    value,
  });
}

function createGeolocationMock(): Geolocation {
  return {
    clearWatch: vi.fn(),
    getCurrentPosition: vi.fn(),
    watchPosition: vi.fn(() => 1),
  } as unknown as Geolocation;
}

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

describe("OverviewMap", () => {
  beforeEach(() => {
    maplibreState.handlers.clear();
    maplibreState.markers.length = 0;
    maplibreState.missionPathSource.setData.mockReset();
    maplibreState.mockMap.addControl.mockReset();
    maplibreState.mockMap.addSource.mockReset();
    maplibreState.mockMap.addLayer.mockReset();
    maplibreState.mockMap.addImage.mockReset();
    maplibreState.mockMap.hasImage.mockReset();
    maplibreState.mockMap.hasImage.mockReturnValue(false);
    maplibreState.mockMap.getSource.mockClear();
    maplibreState.mockMap.getLayer.mockReset();
    maplibreState.mockMap.getLayer.mockReturnValue(null);
    maplibreState.mockMap.getStyle.mockClear();
    maplibreState.mockMap.setLayoutProperty.mockReset();
    maplibreState.mockMap.setTerrain.mockReset();
    maplibreState.mockMap.flyTo.mockReset();
    maplibreState.mockMap.easeTo.mockReset();
    maplibreState.mockMap.unproject.mockReset();
    maplibreState.mockMap.unproject.mockImplementation(([x, y]: [number, number]) => ({ lat: y / 10, lng: x / 10 }));
    maplibreState.mockMap.getZoom.mockReset();
    maplibreState.mockMap.getZoom.mockReturnValue(12);
    maplibreState.mockMap.on.mockClear();
    maplibreState.mockMap.remove.mockReset();
    guidedState.startGuidedSession.mockReset();
    guidedState.updateGuidedSession.mockReset();
    guidedState.startGuidedSession.mockResolvedValue({ result: "accepted", state: null });
    guidedState.updateGuidedSession.mockResolvedValue({ result: "accepted", state: null });
    vi.mocked(toast.error).mockReset();
    vi.mocked(toast.success).mockReset();
    vi.useRealTimers();
  });

  afterEach(() => {
    cleanup();
    if (originalGeolocationDescriptor) {
      Object.defineProperty(window.navigator, "geolocation", originalGeolocationDescriptor);
    } else {
      delete (window.navigator as { geolocation?: Geolocation }).geolocation;
    }
  });

  it("hides my-location control when geolocation is unsupported", () => {
    setNavigatorGeolocation(undefined);

    render(OverviewMap, {
      vehicleLat: 47.397742,
      vehicleLon: 8.545594,
      homeLat: 47.397742,
      homeLon: 8.545594,
    });

    expect(screen.queryByTestId("overview-map-target-device")).toBeNull();
    expect(screen.getByTestId("overview-map-target-home")).toBeTruthy();
    expect(screen.getByTestId("overview-map-target-vehicle")).toBeTruthy();
  });

  it("enters vehicle follow mode on hold and cancels it after a manual move", async () => {
    setNavigatorGeolocation(createGeolocationMock());

    render(OverviewMap, {
      vehicleLat: 47.397742,
      vehicleLon: 8.545594,
      vehicleHeading: 182,
      homeLat: 47.397742,
      homeLon: 8.545594,
    });

    const vehicleButton = screen.getByTestId("overview-map-target-vehicle");

    vehicleButton.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 550));
    await tick();

    expect(vehicleButton.getAttribute("aria-pressed")).toBe("true");
    expect(maplibreState.mockMap.easeTo).toHaveBeenCalledWith({
      center: [8.545594, 47.397742],
      duration: 500,
    });

    maplibreState.handlers.get("movestart")?.();
    await tick();
    expect(vehicleButton.getAttribute("aria-pressed")).toBe("true");

    maplibreState.handlers.get("movestart")?.();
    await tick();
    expect(vehicleButton.getAttribute("aria-pressed")).toBe("false");
  });

  it("opens a context menu and starts guided goto at the clicked coordinate", async () => {
    setNavigatorGeolocation(createGeolocationMock());

    render(OverviewMap, {
      vehicleLat: 47.397742,
      vehicleLon: 8.545594,
      homeLat: 47.397742,
      homeLon: 8.545594,
      currentAltitudeM: 42,
    });

    const preventDefault = vi.fn();
    maplibreState.handlers.get("contextmenu")?.({
      preventDefault,
      originalEvent: { preventDefault, clientX: 120, clientY: 80 },
      lngLat: { lat: 47.4, lng: 8.55 },
    });
    await tick();

    expect(screen.getByTestId("overview-map-context-menu")).toBeTruthy();
    await fireEvent.click(screen.getByTestId("overview-map-fly-here"));

    await waitFor(() => {
      expect(startGuidedSession).toHaveBeenCalledWith({
        session: { kind: "goto", latitude_deg: 47.4, longitude_deg: 8.55, altitude_msl_m: 42 },
      });
      expect(toast.success).toHaveBeenCalledWith("Guided target sent");
    });
    expect(screen.queryByTestId("overview-map-context-menu")).toBeNull();
  });

  it("renders mission markers and an active mission path segment", async () => {
    setNavigatorGeolocation(createGeolocationMock());

    render(OverviewMap, {
      homeLat: 47.397742,
      homeLon: 8.545594,
      homeAltitude: 488,
      missionPlan: {
        items: [
          waypoint(47.398, 8.546),
          waypoint(47.399, 8.547),
        ],
      },
      currentMissionIndex: 1,
    });

    maplibreState.handlers.get("style.load")?.();
    await tick();

    const markerOne = maplibreState.markers.find((marker) => marker.element.textContent === "1")?.element;
    const markerTwo = maplibreState.markers.find((marker) => marker.element.textContent === "2")?.element;
    const markerOneHandle = maplibreState.markers.find((marker) => marker.element.textContent === "1");
    expect(markerOne?.className).toContain("mission-pin");
    expect(markerOne?.className).not.toContain("is-current");
    expect(markerTwo?.className).toContain("is-current");
    expect(markerOneHandle).toBeDefined();
    const setLngLatOrder = markerOneHandle?.setLngLat.mock.invocationCallOrder[0] ?? 0;
    const addToOrder = markerOneHandle?.addTo.mock.invocationCallOrder[0] ?? 0;
    expect(setLngLatOrder).toBeLessThan(addToOrder);

    const calls = maplibreState.missionPathSource.setData.mock.calls;
    const lastData = calls[calls.length - 1]?.[0] as GeoJSON.FeatureCollection;
    expect(lastData.features.some((feature) => feature.properties?.segmentStatus === "active")).toBe(true);
  });

  it("provides a transparent fallback for missing base style icons", () => {
    setNavigatorGeolocation(createGeolocationMock());

    render(OverviewMap, {
      vehicleLat: 47.397742,
      vehicleLon: 8.545594,
    });

    maplibreState.handlers.get("styleimagemissing")?.({ type: "styleimagemissing", id: "gymnastics" });

    expect(maplibreState.mockMap.addImage).toHaveBeenCalledWith("gymnastics", {
      width: 1,
      height: 1,
      data: expect.any(Uint8Array),
    });
  });
});
