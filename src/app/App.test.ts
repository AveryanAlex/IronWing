// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

// maplibre-gl requires WebGL which is unavailable in jsdom. Stub the entire
// module so OverviewMap (mounted inside the full App) does not crash.
vi.mock("maplibre-gl", () => {
  const mockMap = {
    addControl: vi.fn(),
    addSource: vi.fn(),
    addLayer: vi.fn(),
    getSource: vi.fn(() => null),
    removeLayer: vi.fn(),
    removeSource: vi.fn(),
    setCenter: vi.fn(),
    on: vi.fn(),
    remove: vi.fn(),
  };
  const markerElement = document.createElement("div");
  const mockMarker = {
    setLngLat: vi.fn().mockReturnThis(),
    addTo: vi.fn().mockReturnThis(),
    setRotation: vi.fn().mockReturnThis(),
    remove: vi.fn(),
    getElement: vi.fn(() => markerElement),
  };
  // Regular functions (not arrow functions) are required for `new` to work.
  function MockMap() { return mockMap; }
  function MockMarker() { return mockMarker; }
  function MockNavigationControl() { return {}; }
  return {
    default: {
      Map: MockMap,
      NavigationControl: MockNavigationControl,
      Marker: MockMarker,
    },
  };
});

import App from "./App.svelte";
import {
  markRuntimeReady,
  resetRuntimeState,
  runtimeTestIds,
} from "../lib/stores/runtime";
import { appShellTestIds } from "./shell/chrome-state";

beforeEach(() => {
  resetRuntimeState();
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(() => {
  cleanup();
  resetRuntimeState();
});

test("renders the product shell with stable runtime hooks", () => {
  markRuntimeReady("2026-04-03T12:34:56.000Z");

  const { getByRole, getByTestId } = render(App);

  expect(document.title).toBe("IronWing");
  expect(getByTestId(runtimeTestIds.shell).dataset.runtimePhase).toBe("ready");
  expect(getByRole("heading", { name: "IronWing" })).toBeTruthy();
  expect(getByTestId(runtimeTestIds.framework).textContent).toBe("Svelte 5");
  expect(getByTestId(runtimeTestIds.bootstrapState).textContent?.trim()).toBe("ready");
  expect(getByTestId(appShellTestIds.tier).textContent?.trim()).toBe("phone");
  expect(getByTestId(appShellTestIds.drawerState).textContent?.trim()).toBe("closed");
  expect(getByTestId(runtimeTestIds.bootedAt).textContent).toBe("2026-04-03T12:34:56.000Z");
  expect(getByTestId(runtimeTestIds.entrypoint).textContent).toBe("src/app/App.svelte");
});

test("surfaces booting runtime hooks before the bootstrap harness marks the runtime ready", () => {
  const { getByTestId } = render(App);

  expect(getByTestId(runtimeTestIds.shell).dataset.runtimePhase).toBe("booting");
  expect(getByTestId(runtimeTestIds.bootstrapState).textContent?.trim()).toBe("booting");
  expect(getByTestId(appShellTestIds.tier).textContent?.trim()).toBe("phone");
  expect(getByTestId(appShellTestIds.drawerState).textContent?.trim()).toBe("closed");
  expect(getByTestId(runtimeTestIds.bootedAt).textContent).toBe("Starting up");
});
