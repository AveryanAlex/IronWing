// @vitest-environment jsdom

import type { ReactNode } from "react";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MissionWorkspace } from "./MissionWorkspace";

const { terrainHookMock, terrainProfilePropsMock, desktopShellPropsMock } = vi.hoisted(() => ({
  terrainHookMock: vi.fn(),
  terrainProfilePropsMock: vi.fn(),
  desktopShellPropsMock: vi.fn(),
}));

vi.mock("../../hooks/use-mission-terrain", () => ({
  useMissionTerrain: (...args: unknown[]) => terrainHookMock(...args),
}));

vi.mock("./MissionTerrainProfile", () => ({
  MissionTerrainProfile: (props: { status: string; height?: number }) => {
    terrainProfilePropsMock(props);
    return (
      <div
        data-testid="mission-terrain-profile"
        data-status={props.status}
        data-height={props.height ?? 120}
      />
    );
  },
}));

vi.mock("../ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("react-resizable-panels", () => ({
  Group: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div data-testid="panel-group" className={className}>{children}</div>
  ),
  Panel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Separator: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

vi.mock("../MissionMap", () => ({
  MissionMap: ({ onBlankMapClick, isDrawingPolygon }: { onBlankMapClick?: (lat: number, lng: number) => void; isDrawingPolygon?: boolean }) => (
    <div>
      <button data-testid="mission-map-blank-click" onClick={() => onBlankMapClick?.(47.41, 8.56)}>
        Blank map
      </button>
      <span data-testid="mission-map-drawing-state">{isDrawingPolygon ? "drawing" : "idle"}</span>
    </div>
  ),
}));

vi.mock("../MapContextMenu", () => ({ MapContextMenu: () => null }));
vi.mock("./MissionDesktopShell", () => ({
  MissionDesktopShell: (props: { terrainWarnings?: Map<number, string> }) => {
    desktopShellPropsMock(props);
    return <div>Desktop shell</div>;
  },
}));
vi.mock("./MissionAutoGridDialog", () => ({
  MissionAutoGridDialog: ({ onStartDraw, onStopDraw, onClose }: {
    onStartDraw: () => void;
    onStopDraw: () => void;
    onClose: () => void;
  }) => (
    <div data-testid="mission-auto-grid-dialog">
      <button data-testid="mission-auto-grid-start" onClick={onStartDraw}>Start draw</button>
      <button data-testid="mission-auto-grid-stop" onClick={onStopDraw}>Stop draw</button>
      <button data-testid="mission-auto-grid-close" onClick={onClose}>Close</button>
    </div>
  ),
}));

function createMission(tab: "mission" | "fence" | "rally" = "mission", addWaypointAt = vi.fn()) {
  const current = {
    tab,
    draftItems: [],
    homePosition: null,
    selectedIndex: null,
    selectedItem: null,
    previousItem: null,
    readOnly: false,
    transferUi: { active: false },
    operation: { active: false },
    isDirty: false,
    recoverableAvailable: false,
    canUndo: false,
    undoCount: 0,
    canRedo: false,
    redoCount: 0,
    displayTotal: 0,
    issues: [],
    recoverDraft: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    addWaypoint: vi.fn(),
    addWaypointAt,
    insertBefore: vi.fn(),
    insertAfter: vi.fn(),
    deleteAt: vi.fn(),
    moveUp: vi.fn(),
    moveDown: vi.fn(),
    validate: vi.fn(),
    upload: vi.fn(),
    download: vi.fn(),
    clear: vi.fn(),
    setHomeFromMap: vi.fn(),
    updateHomeFromVehicle: vi.fn(),
    select: vi.fn(),
    moveWaypointOnMap: vi.fn(),
  };

  return {
    tabs: [
      { id: "mission", label: "Mission" },
      { id: "fence", label: "Fence" },
      { id: "rally", label: "Rally" },
    ],
    selectedTab: tab,
    selectTab: vi.fn(),
    selectedTabLabel: tab,
    current,
    selectedTabId: tab,
    vehicle: { missionState: { current_index: null } },
    mission: {
      setCurrent: vi.fn(),
      updateCommand: vi.fn(),
      setWaypointFromVehicle: vi.fn(),
      insertGeneratedAfter: vi.fn(),
      replaceAll: vi.fn(),
      selectedIndex: null,
      displayTotal: 0,
    },
    fence: {
      addRegionAt: vi.fn(),
      setReturnPoint: vi.fn(),
      returnPoint: null,
      updateRegion: vi.fn(),
    },
    rally: {
      updateAltitudeFrame: vi.fn(),
    },
  };
}

describe("MissionWorkspace", () => {
  beforeEach(() => {
    terrainHookMock.mockReset();
    terrainProfilePropsMock.mockReset();
    desktopShellPropsMock.mockReset();
    terrainHookMock.mockReturnValue({
      status: "ready",
      profile: { points: [], warningsByIndex: new Map() },
      warningsByIndex: new Map(),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("keeps chain mode active across blank-map waypoint additions and clears it when leaving the mission tab", () => {
    const addWaypointAt = vi.fn();
    const vehicle = { connected: true, vehiclePosition: null, missionState: { current_index: null } };
    const deviceLocation = { location: null };
    const { rerender } = render(
      <MissionWorkspace
        vehicle={vehicle as never}
        mission={createMission("mission", addWaypointAt) as never}
        deviceLocation={deviceLocation as never}
      />,
    );

    const chainButton = screen.getByTestId("mission-chain-mode");
    fireEvent.click(chainButton);
    expect(chainButton.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByTestId("mission-map-blank-click"));
    expect(addWaypointAt).toHaveBeenCalledWith(47.41, 8.56);
    expect(chainButton.getAttribute("aria-pressed")).toBe("true");

    rerender(
      <MissionWorkspace
        vehicle={vehicle as never}
        mission={createMission("fence", addWaypointAt) as never}
        deviceLocation={deviceLocation as never}
      />,
    );

    expect(screen.getByTestId("mission-chain-mode").getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByTestId("mission-map-blank-click"));
    expect(addWaypointAt).toHaveBeenCalledTimes(1);
  });

  it("suppresses chain mode while auto-grid polygon drawing is active without deactivating the toggle", () => {
    const addWaypointAt = vi.fn();
    const vehicle = { connected: true, vehiclePosition: null, missionState: { current_index: null } };
    const deviceLocation = { location: null };
    const { container } = render(
      <MissionWorkspace
        vehicle={vehicle as never}
        mission={createMission("mission", addWaypointAt) as never}
        deviceLocation={deviceLocation as never}
      />,
    );

    fireEvent.click(screen.getByTestId("mission-chain-mode"));
    fireEvent.click(container.querySelector("[data-mission-auto-grid-open]") as HTMLButtonElement);
    fireEvent.click(screen.getByTestId("mission-auto-grid-start"));

    expect(screen.getByTestId("mission-map-drawing-state").textContent).toBe("drawing");
    expect(screen.getByTestId("mission-chain-mode").getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByTestId("mission-map-blank-click"));
    expect(addWaypointAt).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("mission-auto-grid-stop"));
    expect(screen.getByTestId("mission-map-drawing-state").textContent).toBe("idle");

    fireEvent.click(screen.getByTestId("mission-map-blank-click"));
    expect(addWaypointAt).toHaveBeenCalledWith(47.41, 8.56);
  });

  it("shows the terrain profile only for the mission tab, wires the terrain hook into it, and forwards waypoint warnings to the desktop shell", () => {
    const vehicle = { connected: true, vehiclePosition: null, missionState: { current_index: null } };
    const deviceLocation = { location: null };
    const missionTab = createMission("mission");
    const terrainWarnings = new Map([[2, "below_terrain"]]);
    terrainHookMock.mockReturnValue({
      status: "ready",
      profile: { points: [], warningsByIndex: terrainWarnings },
      warningsByIndex: terrainWarnings,
    });
    const { rerender } = render(
      <MissionWorkspace
        vehicle={vehicle as never}
        mission={missionTab as never}
        deviceLocation={deviceLocation as never}
      />,
    );

    expect(terrainHookMock).toHaveBeenCalledWith(
      missionTab.current.draftItems,
      missionTab.current.homePosition,
      "mission",
    );
    expect(screen.getByTestId("mission-terrain-profile").getAttribute("data-height")).toBe("120");

    const props = terrainProfilePropsMock.mock.calls[terrainProfilePropsMock.mock.calls.length - 1]?.[0] as {
      selectedIndex: number | null;
      onSelectIndex?: (index: number | null) => void;
    };
    expect(props.selectedIndex).toBeNull();
    expect(props.onSelectIndex).toBe(missionTab.current.select);

    const desktopShellProps = desktopShellPropsMock.mock.calls[desktopShellPropsMock.mock.calls.length - 1]?.[0] as {
      terrainWarnings?: Map<number, string>;
    };
    expect(desktopShellProps.terrainWarnings).toBe(terrainWarnings);

    rerender(
      <MissionWorkspace
        vehicle={vehicle as never}
        mission={createMission("fence") as never}
        deviceLocation={deviceLocation as never}
      />,
    );

    expect(screen.queryByTestId("mission-terrain-profile")).toBeNull();
    expect(terrainHookMock.mock.calls[terrainHookMock.mock.calls.length - 1]?.[2]).toBe("fence");
  });
});
