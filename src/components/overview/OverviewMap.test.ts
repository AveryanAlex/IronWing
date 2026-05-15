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
    default: {
      Map: MockMap,
      Marker: MockMarker,
      NavigationControl: MockNavigationControl,
    },
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

import OverviewMap from "./OverviewMap.svelte";
import { startGuidedSession, updateGuidedSession, type GuidedDomain } from "../../guided";
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

function createControllableGeolocationMock() {
  const state: {
    success: PositionCallback | null;
    error: PositionErrorCallback | null;
    geolocation: Geolocation;
  } = {
    success: null,
    error: null,
    geolocation: {
      clearWatch: vi.fn(),
      getCurrentPosition: vi.fn(),
      watchPosition: vi.fn((success: PositionCallback, error?: PositionErrorCallback | null) => {
        state.success = success;
        state.error = error ?? null;
        return 1;
      }),
    } as unknown as Geolocation,
  };

  return state;
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

function guidedGoto(latitude_deg: number, longitude_deg: number, altitude_m = 30): GuidedDomain {
  return {
    available: true,
    complete: true,
    provenance: "stream",
    value: {
      status: "active",
      session: { kind: "goto", latitude_deg, longitude_deg, altitude_m },
      entered_at_unix_msec: 1,
      blocking_reason: null,
      termination: null,
      last_command: null,
      actions: {
        start: { allowed: true, blocking_reason: null },
        update: { allowed: true, blocking_reason: null },
        stop: { allowed: true, blocking_reason: null },
      },
    },
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

  it("rotates the vehicle marker through north without a full spin", async () => {
    setNavigatorGeolocation(createGeolocationMock());

    const { rerender } = render(OverviewMap, {
      props: {
        vehicleLat: 47.397742,
        vehicleLon: 8.545594,
        vehicleHeading: 359,
        homeLat: 47.397742,
        homeLon: 8.545594,
      },
    });
    await tick();

    const vehicleSvg = maplibreState.markers[0]?.element.querySelector("svg") as SVGSVGElement | null;
    expect(vehicleSvg?.style.transform).toBe("rotate(359deg)");

    await rerender({
      vehicleLat: 47.397742,
      vehicleLon: 8.545594,
      vehicleHeading: 0,
      homeLat: 47.397742,
      homeLon: 8.545594,
    });
    await tick();
    expect(vehicleSvg?.style.transform).toBe("rotate(360deg)");

    await rerender({
      vehicleLat: 47.397742,
      vehicleLon: 8.545594,
      vehicleHeading: 1,
      homeLat: 47.397742,
      homeLon: 8.545594,
    });
    await tick();
    expect(vehicleSvg?.style.transform).toBe("rotate(361deg)");
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

  it("toggles satellite layers and 3D terrain once the style is ready", async () => {
    setNavigatorGeolocation(createGeolocationMock());

    render(OverviewMap, {
      vehicleLat: 47.397742,
      vehicleLon: 8.545594,
      homeLat: 47.397742,
      homeLon: 8.545594,
      missionPath: [
        { lat: 47.397742, lon: 8.545594 },
        { lat: 47.3982, lon: 8.5461 },
      ],
    });

    maplibreState.handlers.get("style.load")?.();
    await tick();
    maplibreState.mockMap.getLayer.mockImplementation((id?: string) => ({ id }));

    await fireEvent.click(screen.getByTestId("overview-map-layer-satellite"));

    await waitFor(() => {
      expect(maplibreState.mockMap.setLayoutProperty).toHaveBeenCalledWith(
        "overview-satellite",
        "visibility",
        "visible",
      );
      expect(maplibreState.mockMap.setLayoutProperty).toHaveBeenCalledWith(
        "roads",
        "visibility",
        "none",
      );
    });

    const terrainButton = screen.getByTestId("overview-map-toggle-3d");
    await fireEvent.click(terrainButton);

    await waitFor(() => {
      expect(terrainButton.getAttribute("aria-pressed")).toBe("true");
      expect(maplibreState.mockMap.setTerrain).toHaveBeenLastCalledWith({
        source: "overview-terrain-source",
        exaggeration: 1.5,
      });
    });
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
        session: { kind: "goto", latitude_deg: 47.4, longitude_deg: 8.55, altitude_m: 42 },
      });
      expect(toast.success).toHaveBeenCalledWith("Guided target sent");
    });
    expect(updateGuidedSession).not.toHaveBeenCalled();
    expect(screen.queryByTestId("overview-map-context-menu")).toBeNull();
  });

  it("updates an active guided goto from the context menu using fallback altitude", async () => {
    setNavigatorGeolocation(createGeolocationMock());

    render(OverviewMap, {
      vehicleLat: 47.397742,
      vehicleLon: 8.545594,
      guided: {
        available: true,
        complete: true,
        provenance: "stream",
        value: {
          status: "active",
          session: { kind: "goto", latitude_deg: 47, longitude_deg: 8, altitude_m: 30 },
          entered_at_unix_msec: 1,
          blocking_reason: null,
          termination: null,
          last_command: null,
          actions: {
            start: { allowed: true, blocking_reason: null },
            update: { allowed: true, blocking_reason: null },
            stop: { allowed: true, blocking_reason: null },
          },
        },
      },
      currentAltitudeM: Number.NaN,
    });

    const preventDefault = vi.fn();
    maplibreState.handlers.get("contextmenu")?.({
      preventDefault,
      originalEvent: { preventDefault, clientX: 60, clientY: 40 },
      lngLat: { lat: 47.41, lng: 8.56 },
    });
    await tick();

    await fireEvent.click(screen.getByTestId("overview-map-fly-here"));

    await waitFor(() => {
      expect(updateGuidedSession).toHaveBeenCalledWith({
        session: { kind: "goto", latitude_deg: 47.41, longitude_deg: 8.56, altitude_m: 25 },
      });
    });
    expect(startGuidedSession).not.toHaveBeenCalled();
  });

  it("shows and clears the active guided goto target marker", async () => {
    setNavigatorGeolocation(createGeolocationMock());

    const { rerender } = render(OverviewMap, {
      guided: guidedGoto(47.41, 8.56, 35),
    });
    await tick();

    const marker = maplibreState.markers.find((item) => item.element.className.includes("guided-target-marker"));
    expect(marker?.element.getAttribute("aria-label")).toBe("Guided target at 35 m");
    expect(marker?.setLngLat).toHaveBeenCalledWith([8.56, 47.41]);
    expect(marker?.addTo).toHaveBeenCalledWith(maplibreState.mockMap);

    await rerender({ guided: null });
    await tick();

    expect(marker?.remove).toHaveBeenCalled();
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

  it("provides a transparent fallback for missing base style icons", async () => {
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

  it("does not let a pending device recenter override a later home selection", async () => {
    const geolocation = createControllableGeolocationMock();
    setNavigatorGeolocation(geolocation.geolocation);

    render(OverviewMap, {
      vehicleLat: 47.397742,
      vehicleLon: 8.545594,
      homeLat: 47.3982,
      homeLon: 8.5461,
    });

    const deviceButton = screen.getByTestId("overview-map-target-device");
    const homeButton = screen.getByTestId("overview-map-target-home");

    deviceButton.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    deviceButton.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    await tick();

    homeButton.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    homeButton.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    await tick();

    geolocation.success?.({
      coords: {
        accuracy: 4,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        latitude: 47.4,
        longitude: 8.55,
        speed: null,
        toJSON: () => ({}),
      },
      timestamp: Date.now(),
      toJSON: () => ({}),
    } as GeolocationPosition);
    await tick();

    expect(deviceButton.getAttribute("aria-pressed")).toBe("false");
    expect(homeButton.getAttribute("aria-pressed")).toBe("false");
    expect(maplibreState.mockMap.flyTo).toHaveBeenCalledWith({
      center: [8.5461, 47.3982],
      zoom: 15,
      duration: 800,
    });
  });

  it("keeps the my-location control visible after a transient position-unavailable error", async () => {
    const geolocation = createControllableGeolocationMock();
    setNavigatorGeolocation(geolocation.geolocation);

    render(OverviewMap, {
      vehicleLat: 47.397742,
      vehicleLon: 8.545594,
      homeLat: 47.3982,
      homeLon: 8.5461,
    });

    const deviceButton = screen.getByTestId("overview-map-target-device");
    deviceButton.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    deviceButton.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    await tick();

    geolocation.error?.({
      code: 2,
      message: "position unavailable",
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    } as GeolocationPositionError);
    await tick();

    expect(screen.getByTestId("overview-map-target-device")).toBeTruthy();
  });
});
