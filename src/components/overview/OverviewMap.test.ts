// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const maplibreState = vi.hoisted(() => {
  const handlers = new Map<string, () => void>();
  const missionPathSource = { setData: vi.fn() };
  const mockMap = {
    addControl: vi.fn(),
    addSource: vi.fn(),
    addLayer: vi.fn(),
    getSource: vi.fn((id: string) => (id === "overview-mission-path" ? missionPathSource : null)),
    getLayer: vi.fn(() => null),
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
    on: vi.fn((event: string, handler: () => void) => {
      handlers.set(event, handler);
    }),
    remove: vi.fn(),
  };

  return {
    handlers,
    missionPathSource,
    mockMap,
  };
});

vi.mock("maplibre-gl", () => {
  function MockMap() {
    return maplibreState.mockMap;
  }

  function MockMarker() {
    return {
      setLngLat: vi.fn().mockReturnThis(),
      addTo: vi.fn().mockReturnThis(),
      remove: vi.fn(),
    };
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

import OverviewMap from "./OverviewMap.svelte";

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

describe("OverviewMap", () => {
  beforeEach(() => {
    maplibreState.handlers.clear();
    maplibreState.missionPathSource.setData.mockReset();
    maplibreState.mockMap.addControl.mockReset();
    maplibreState.mockMap.addSource.mockReset();
    maplibreState.mockMap.addLayer.mockReset();
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
    vi.useRealTimers();
  });

  afterEach(() => {
    cleanup();
    if (originalGeolocationDescriptor) {
      Object.defineProperty(window.navigator, "geolocation", originalGeolocationDescriptor);
    } else {
      delete (window.navigator as Navigator & { geolocation?: Geolocation }).geolocation;
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
