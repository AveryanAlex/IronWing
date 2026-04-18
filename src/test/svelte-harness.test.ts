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
  const mockMarker = {
    setLngLat: vi.fn().mockReturnThis(),
    addTo: vi.fn().mockReturnThis(),
    setRotation: vi.fn().mockReturnThis(),
    remove: vi.fn(),
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

import App from "../App.svelte";
import { runtimeTestIds } from "../lib/stores/runtime";

beforeEach(() => {
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
});

test("mounts the active Svelte shell through the Vitest harness", () => {
  const { getByRole, getByTestId } = render(App);

  expect(document.title).toBe("IronWing");
  expect(getByTestId(runtimeTestIds.shell).dataset.runtimePhase).toBe("booting");
  expect(getByTestId(runtimeTestIds.runtimeMarker).textContent).toBe("IronWing runtime marker");
  expect(getByRole("heading", { name: "IronWing" })).toBeTruthy();
  expect(getByTestId(runtimeTestIds.framework).textContent).toBe("Svelte 5");
});
