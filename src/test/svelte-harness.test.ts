// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

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
  expect(getByTestId(runtimeTestIds.runtimeMarker).textContent).toBe("IronWing active runtime");
  expect(getByRole("heading", { name: "Svelte runtime online" })).toBeTruthy();
  expect(getByTestId(runtimeTestIds.framework).textContent).toBe("Svelte 5");
});
