// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import App from "./App.svelte";
import {
  markRuntimeReady,
  resetRuntimeState,
  runtimeTestIds,
} from "../lib/stores/runtime";

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

test("renders the minimal runtime shell with stable diagnostics markers", () => {
  markRuntimeReady("2026-04-03T12:34:56.000Z");

  const { getByRole, getByTestId } = render(App);

  expect(document.title).toBe("IronWing");
  expect(getByTestId(runtimeTestIds.shell).dataset.runtimePhase).toBe("ready");
  expect(getByRole("heading", { name: "Svelte runtime online" })).toBeTruthy();
  expect(getByTestId(runtimeTestIds.framework).textContent).toBe("Svelte 5");
  expect(getByTestId(runtimeTestIds.bootstrapState).textContent?.trim()).toBe("ready");
  expect(getByTestId(runtimeTestIds.bootedAt).textContent).toBe("2026-04-03T12:34:56.000Z");
  expect(getByTestId(runtimeTestIds.entrypoint).textContent).toBe("src/app/App.svelte");
  expect(getByTestId(runtimeTestIds.quarantineBoundary).textContent).toBe("src-old/runtime");
});

test("surfaces booting diagnostics before the bootstrap harness marks the runtime ready", () => {
  const { getByTestId } = render(App);

  expect(getByTestId(runtimeTestIds.shell).dataset.runtimePhase).toBe("booting");
  expect(getByTestId(runtimeTestIds.bootstrapState).textContent?.trim()).toBe("booting");
  expect(getByTestId(runtimeTestIds.bootedAt).textContent).toBe("Awaiting bootstrap completion");
});
