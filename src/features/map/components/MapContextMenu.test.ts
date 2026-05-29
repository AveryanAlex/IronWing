// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import MapContextMenuCloseHarness from "./MapContextMenuCloseHarness.svelte";
import MapContextMenu from "./MapContextMenu.svelte";

describe("MapContextMenu", () => {
  afterEach(() => {
    cleanup();
  });

  it("always shows selected coordinates and invokes customizable actions", async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();

    render(MapContextMenu, {
      props: {
        x: 120,
        y: 80,
        lat: 47.4,
        lon: 8.55,
        testId: "test-map-context-menu",
        coordinatesTestId: "test-map-context-menu-coordinates",
        actions: [
          {
            id: "fly-here",
            label: "Fly here",
            testId: "test-map-context-menu-fly-here",
            onSelect,
          },
        ],
        onClose,
      },
    });

    expect(screen.getByTestId("test-map-context-menu")).toBeTruthy();
    expect(screen.getByTestId("test-map-context-menu-coordinates").textContent).toContain("47.400000, 8.550000");

    await fireEvent.click(screen.getByTestId("test-map-context-menu-fly-here"));

    expect(onSelect).toHaveBeenCalledWith({
      latitudeDeg: 47.4,
      longitudeDeg: 8.55,
      lat: 47.4,
      lon: 8.55,
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("still renders coordinates when no actions are available", () => {
    render(MapContextMenu, {
      props: {
        x: 10,
        y: 20,
        lat: 6,
        lon: 12,
        testId: "empty-map-context-menu",
        onClose: vi.fn(),
      },
    });

    expect(screen.getByTestId("empty-map-context-menu")).toBeTruthy();
    expect(screen.getByText("6.000000, 12.000000")).toBeTruthy();
  });

  it("allows a menu action to synchronously close the parent-owned menu", async () => {
    render(MapContextMenuCloseHarness);

    expect(screen.getByTestId("test-map-context-menu")).toBeTruthy();

    await fireEvent.click(screen.getByTestId("test-map-context-menu-close-sync"));

    await waitFor(() => {
      expect(screen.queryByTestId("test-map-context-menu")).toBeNull();
    });
  });
});
