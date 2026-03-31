// @vitest-environment jsdom

import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

const { desktopSpy, mobileSpy } = vi.hoisted(() => ({
  desktopSpy: vi.fn(),
  mobileSpy: vi.fn(),
}));

vi.mock("./mission/MissionWorkspace", () => ({
  MissionWorkspace: (props: unknown) => {
    desktopSpy(props);
    return <div>Desktop workspace</div>;
  },
}));

vi.mock("./mission/MissionMobileDrawer", () => ({
  MissionMobileDrawer: (props: unknown) => {
    mobileSpy(props);
    return <div>Mobile drawer</div>;
  },
}));

import { MissionPanel } from "./MissionPanel";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  desktopSpy.mockClear();
  mobileSpy.mockClear();
});

function createMission(overrides?: {
  current?: Partial<{
    canUndo: boolean;
    canRedo: boolean;
    undo: ReturnType<typeof vi.fn>;
    redo: ReturnType<typeof vi.fn>;
    selectedCount: number;
    selectedIndex: number | null;
    displayTotal: number;
    bulkDelete: ReturnType<typeof vi.fn>;
    deselectAll: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
  }>;
}) {
  return {
    id: "mission",
    current: {
      canUndo: false,
      canRedo: false,
      undo: vi.fn(),
      redo: vi.fn(),
      selectedCount: 0,
      selectedIndex: null,
      displayTotal: 0,
      bulkDelete: vi.fn(),
      deselectAll: vi.fn(),
      select: vi.fn(),
      ...overrides?.current,
    },
  };
}

describe("MissionPanel", () => {
  it("renders the desktop workspace when isMobile is false", () => {
    const vehicle = { id: "vehicle" };
    const mission = createMission();
    const deviceLocation = { id: "location" };

    render(
      <MissionPanel
        vehicle={vehicle as never}
        mission={mission as never}
        deviceLocation={deviceLocation as never}
        isMobile={false}
      />,
    );

    expect(screen.getByText("Desktop workspace")).toBeTruthy();
    expect(screen.queryByText("Mobile drawer")).toBeNull();
    expect(desktopSpy).toHaveBeenCalledTimes(1);
    expect(desktopSpy.mock.calls[0][0]).toMatchObject({ vehicle, mission, deviceLocation });
    expect(mobileSpy).not.toHaveBeenCalled();
  });

  it("renders the mobile drawer when isMobile is true", () => {
    const vehicle = { id: "vehicle" };
    const mission = createMission();
    const deviceLocation = { id: "location" };

    render(
      <MissionPanel
        vehicle={vehicle as never}
        mission={mission as never}
        deviceLocation={deviceLocation as never}
        isMobile={true}
      />,
    );

    expect(screen.getByText("Mobile drawer")).toBeTruthy();
    expect(screen.queryByText("Desktop workspace")).toBeNull();
    expect(mobileSpy).toHaveBeenCalledTimes(1);
    expect(mobileSpy.mock.calls[0][0]).toMatchObject({ vehicle, mission, deviceLocation });
    expect(desktopSpy).not.toHaveBeenCalled();
  });

  it("routes cmd/ctrl+z shortcuts to mission undo and redo", () => {
    const undo = vi.fn();
    const redo = vi.fn();
    const mission = createMission({
      current: {
        canUndo: true,
        canRedo: true,
        undo,
        redo,
      },
    });

    render(
      <MissionPanel
        vehicle={{ id: "vehicle" } as never}
        mission={mission as never}
        deviceLocation={{ id: "location" } as never}
        isMobile={false}
      />,
    );

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    fireEvent.keyDown(window, { key: "Z", metaKey: true, shiftKey: true });

    expect(undo).toHaveBeenCalledTimes(1);
    expect(redo).toHaveBeenCalledTimes(1);
  });

  it("skips global mission shortcuts while an editable field is focused", () => {
    const undo = vi.fn();
    const redo = vi.fn();
    const mission = createMission({
      current: {
        canUndo: true,
        canRedo: true,
        undo,
        redo,
      },
    });

    render(
      <>
        <input aria-label="Mission notes" />
        <MissionPanel
          vehicle={{ id: "vehicle" } as never}
          mission={mission as never}
          deviceLocation={{ id: "location" } as never}
          isMobile={false}
        />
      </>,
    );

    const input = screen.getByLabelText("Mission notes");
    input.focus();

    fireEvent.keyDown(input, { key: "z", ctrlKey: true });
    fireEvent.keyDown(input, { key: "z", ctrlKey: true, shiftKey: true });

    expect(undo).not.toHaveBeenCalled();
    expect(redo).not.toHaveBeenCalled();
  });

  it("Delete key calls bulkDelete when items are selected", () => {
    const bulkDelete = vi.fn();
    const mission = createMission({
      current: { selectedCount: 2, bulkDelete },
    });

    render(
      <MissionPanel
        vehicle={{ id: "vehicle" } as never}
        mission={mission as never}
        deviceLocation={{ id: "location" } as never}
        isMobile={false}
      />,
    );

    fireEvent.keyDown(window, { key: "Delete" });

    expect(bulkDelete).toHaveBeenCalledTimes(1);
  });

  it("Delete key does not fire when an input element is focused", () => {
    const bulkDelete = vi.fn();
    const mission = createMission({
      current: { selectedCount: 2, bulkDelete },
    });

    render(
      <>
        <input aria-label="Item name" />
        <MissionPanel
          vehicle={{ id: "vehicle" } as never}
          mission={mission as never}
          deviceLocation={{ id: "location" } as never}
          isMobile={false}
        />
      </>,
    );

    const input = screen.getByLabelText("Item name");
    input.focus();
    fireEvent.keyDown(input, { key: "Delete" });

    expect(bulkDelete).not.toHaveBeenCalled();
  });

  it("ArrowDown selects the next item", () => {
    const select = vi.fn();
    const mission = createMission({
      current: { selectedIndex: 1, displayTotal: 5, select },
    });

    render(
      <MissionPanel
        vehicle={{ id: "vehicle" } as never}
        mission={mission as never}
        deviceLocation={{ id: "location" } as never}
        isMobile={false}
      />,
    );

    fireEvent.keyDown(window, { key: "ArrowDown" });

    expect(select).toHaveBeenCalledWith(2);
  });

  it("ArrowUp selects the previous item", () => {
    const select = vi.fn();
    const mission = createMission({
      current: { selectedIndex: 2, displayTotal: 5, select },
    });

    render(
      <MissionPanel
        vehicle={{ id: "vehicle" } as never}
        mission={mission as never}
        deviceLocation={{ id: "location" } as never}
        isMobile={false}
      />,
    );

    fireEvent.keyDown(window, { key: "ArrowUp" });

    expect(select).toHaveBeenCalledWith(1);
  });

  it("ArrowDown does not navigate past the last item", () => {
    const select = vi.fn();
    const mission = createMission({
      current: { selectedIndex: 4, displayTotal: 5, select },
    });

    render(
      <MissionPanel
        vehicle={{ id: "vehicle" } as never}
        mission={mission as never}
        deviceLocation={{ id: "location" } as never}
        isMobile={false}
      />,
    );

    fireEvent.keyDown(window, { key: "ArrowDown" });

    expect(select).not.toHaveBeenCalled();
  });

  it("ArrowUp does not navigate before the first item", () => {
    const select = vi.fn();
    const mission = createMission({
      current: { selectedIndex: 0, displayTotal: 5, select },
    });

    render(
      <MissionPanel
        vehicle={{ id: "vehicle" } as never}
        mission={mission as never}
        deviceLocation={{ id: "location" } as never}
        isMobile={false}
      />,
    );

    fireEvent.keyDown(window, { key: "ArrowUp" });

    expect(select).not.toHaveBeenCalled();
  });

  it("Escape calls deselectAll when items are selected", () => {
    const deselectAll = vi.fn();
    const mission = createMission({
      current: { selectedCount: 1, deselectAll },
    });

    render(
      <MissionPanel
        vehicle={{ id: "vehicle" } as never}
        mission={mission as never}
        deviceLocation={{ id: "location" } as never}
        isMobile={false}
      />,
    );

    fireEvent.keyDown(window, { key: "Escape" });

    expect(deselectAll).toHaveBeenCalledTimes(1);
  });

  it("Escape does not fire when no items are selected", () => {
    const deselectAll = vi.fn();
    const mission = createMission({
      current: { selectedCount: 0, deselectAll },
    });

    render(
      <MissionPanel
        vehicle={{ id: "vehicle" } as never}
        mission={mission as never}
        deviceLocation={{ id: "location" } as never}
        isMobile={false}
      />,
    );

    fireEvent.keyDown(window, { key: "Escape" });

    expect(deselectAll).not.toHaveBeenCalled();
  });
});
