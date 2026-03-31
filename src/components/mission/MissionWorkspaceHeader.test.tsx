// @vitest-environment jsdom

import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MissionWorkspaceHeader } from "./MissionWorkspaceHeader";
import type { useMission } from "../../hooks/use-mission";

vi.mock("../ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

function createMission(options?: { currentTransferActive?: boolean; fenceTransferActive?: boolean }) {
  const importPlanFile = vi.fn();
  const importKmlFile = vi.fn();
  const exportPlanFile = vi.fn();

  const currentTransferActive = options?.currentTransferActive ?? false;
  const fenceTransferActive = options?.fenceTransferActive ?? false;

  const mission = {
    tabs: [{ id: "mission", label: "Mission" }, { id: "fence", label: "Fence" }, { id: "rally", label: "Rally" }],
    selectedTab: "mission",
    selectTab: vi.fn(),
    importPlanFile,
    importKmlFile,
    exportPlanFile,
    mission: {
      setCurrent: vi.fn(),
      transferUi: { active: currentTransferActive, hasProgress: false, progressPct: 0, direction: null, completedItems: 0, totalItems: 0 },
    },
    fence: {
      transferUi: { active: fenceTransferActive, hasProgress: false, progressPct: 0, direction: null, completedItems: 0, totalItems: 0 },
    },
    rally: {
      transferUi: { active: false, hasProgress: false, progressPct: 0, direction: null, completedItems: 0, totalItems: 0 },
    },
    current: {
      tab: "mission",
      isDirty: false,
      recoverableAvailable: false,
      transferUi: { active: currentTransferActive, hasProgress: false, progressPct: 0, direction: null, completedItems: 0, totalItems: 0 },
      canUndo: false,
      undoCount: 0,
      canRedo: false,
      redoCount: 0,
      selectedIndex: null,
      displayTotal: 0,
      undo: vi.fn(),
      redo: vi.fn(),
      addWaypoint: vi.fn(),
      insertBefore: vi.fn(),
      insertAfter: vi.fn(),
      deleteAt: vi.fn(),
      moveUp: vi.fn(),
      moveDown: vi.fn(),
      validate: vi.fn(),
      upload: vi.fn(),
      download: vi.fn(),
      clear: vi.fn(),
      updateHomeFromVehicle: vi.fn(),
      recoverDraft: vi.fn(),
    },
  };

  return {
    mission: mission as unknown as ReturnType<typeof useMission>,
    importPlanFile,
    importKmlFile,
    exportPlanFile,
  };
}

describe("MissionWorkspaceHeader", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders import and export actions and wires them to the mission hook", () => {
    const { mission, importPlanFile, exportPlanFile } = createMission();

    render(<MissionWorkspaceHeader mission={mission} connected={false} />);

    expect(screen.getByRole("button", { name: /^Import$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Import KML/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Export$/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^Import$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Export$/i }));

    expect(importPlanFile).toHaveBeenCalledTimes(1);
    expect(exportPlanFile).toHaveBeenCalledTimes(1);
  });

  it("wires the KML import action separately", () => {
    const { mission, importKmlFile } = createMission();

    render(<MissionWorkspaceHeader mission={mission} connected={true} />);

    fireEvent.click(screen.getByRole("button", { name: /Import KML/i }));

    expect(importKmlFile).toHaveBeenCalledTimes(1);
  });

  it("disables import and export actions while any transfer is active", () => {
    const { mission } = createMission({ fenceTransferActive: true });

    render(<MissionWorkspaceHeader mission={mission} connected={true} />);

    expect((screen.getByRole("button", { name: /^Import$/i }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /Import KML/i }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /^Export$/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
