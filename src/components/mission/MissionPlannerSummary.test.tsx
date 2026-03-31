// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] ?? null,
  };
})();
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock });

afterEach(() => {
  localStorageMock.clear();
});
import type { useMission } from "../../hooks/use-mission";
import type { TypedDraftItem } from "../../lib/mission-draft-typed";
import type { MissionCommand } from "../../lib/mavkit-types";
import type { MissionType } from "../../mission";
import { defaultGeoPoint3d } from "../../lib/mavkit-types";
import { MissionPlannerSummary } from "./MissionPlannerSummary";

afterEach(() => {
  cleanup();
});

function makeTransferUi() {
  return {
    active: false,
    hasProgress: false,
    progressPct: 0,
    direction: null,
    completedItems: 0,
    totalItems: 0,
  } as const;
}

function makeMissionItem(command: MissionCommand) {
  return {
    command,
    current: false,
    autocontinue: true,
  };
}

function makeDraftItem(index: number, command: MissionCommand): TypedDraftItem {
  return {
    uiId: index + 1,
    index,
    document: makeMissionItem(command),
    readOnly: false,
    preview: {
      latitude_deg: null,
      longitude_deg: null,
      altitude_m: null,
    },
  };
}

function waypoint(index: number, lat: number, lon: number): TypedDraftItem {
  return makeDraftItem(index, {
    Nav: {
      Waypoint: {
        position: defaultGeoPoint3d(lat, lon, 30),
        hold_time_s: 0,
        acceptance_radius_m: 1,
        pass_radius_m: 0,
        yaw_deg: 0,
      },
    },
  });
}

function loiterUnlimited(index: number, lat: number, lon: number): TypedDraftItem {
  return makeDraftItem(index, {
    Nav: {
      LoiterUnlimited: {
        position: defaultGeoPoint3d(lat, lon, 30),
        radius_m: 20,
        direction: "Clockwise",
      },
    },
  });
}

function makeMissionStub({
  selectedTab = "mission",
  draftItems = [waypoint(0, 47.3779, 8.5417)],
  homePosition = { latitude_deg: 47.3769, longitude_deg: 8.5417, altitude_m: 408.25 },
  importedSpeeds = null,
}: {
  selectedTab?: MissionType;
  draftItems?: TypedDraftItem[];
  homePosition?: { latitude_deg: number; longitude_deg: number; altitude_m: number } | null;
  importedSpeeds?: { cruiseSpeedMps: number; hoverSpeedMps: number } | null;
} = {}) {
  const setExportSpeeds = vi.fn();
  const recoverDraft = vi.fn();
  const cancel = vi.fn();

  const missionDomain = {
    isDirty: false,
    displayTotal: draftItems.length,
    recoverableAvailable: false,
    recoverDraft,
    homePosition,
    homeSource: homePosition ? "vehicle" : null,
    transferUi: makeTransferUi(),
    roundtripStatus: "",
    cancel,
    draftItems,
    importedSpeeds,
    setExportSpeeds,
  };

  const emptyDomain = {
    isDirty: false,
    displayTotal: 0,
    recoverableAvailable: false,
    recoverDraft,
    homePosition: null,
    homeSource: null,
    transferUi: makeTransferUi(),
    roundtripStatus: "",
    cancel,
    draftItems: [],
    // FencePlan + RallyPlan shapes required by computeFenceStats/computeRallyStats
    plan: { return_point: null, regions: [], points: [] },
  };

  const mission = {
    selectedTab,
    current:
      selectedTab === "mission"
        ? missionDomain
        : selectedTab === "fence"
          ? emptyDomain
          : emptyDomain,
    mission: missionDomain,
    fence: emptyDomain,
    rally: emptyDomain,
    vehicle: {
      activeSeq: null,
      missionState: null,
    },
  } as unknown as ReturnType<typeof useMission>;

  return { mission, setExportSpeeds };
}

describe("MissionPlannerSummary", () => {
  it("renders mission statistics on the mission tab", () => {
    const { mission } = makeMissionStub();

    render(<MissionPlannerSummary mission={mission} connected={true} />);

    expect(screen.getByTestId("mission-planning-stats")).toBeTruthy();
    expect(screen.getByTestId("mission-stats-distance").textContent).toContain("111 m");
    expect(screen.getByTestId("mission-stats-time").textContent).toContain("0:07");
  });

  it("does not render the mission statistics card on fence or rally tabs", () => {
    const { mission: fenceMission } = makeMissionStub({ selectedTab: "fence" });
    const { rerender } = render(<MissionPlannerSummary mission={fenceMission} connected={true} />);

    // Mission estimates card is hidden on non-mission tabs
    expect(screen.queryByTestId("mission-planning-stats")).toBeNull();
    // Fence estimates card is shown on the fence tab
    expect(screen.getByTestId("fence-planning-stats")).toBeTruthy();

    const { mission: rallyMission } = makeMissionStub({ selectedTab: "rally" });
    rerender(<MissionPlannerSummary mission={rallyMission} connected={true} />);

    expect(screen.queryByTestId("mission-planning-stats")).toBeNull();
    expect(screen.queryByTestId("fence-planning-stats")).toBeNull();
  });

  it("updates the displayed estimate and export speeds when planning inputs change", () => {
    const { mission, setExportSpeeds } = makeMissionStub();

    render(<MissionPlannerSummary mission={mission} connected={true} />);

    expect(screen.getByTestId("mission-stats-time").textContent).toContain("0:07");
    expect(setExportSpeeds).toHaveBeenLastCalledWith({ cruiseSpeedMps: 15, hoverSpeedMps: 5 });

    fireEvent.change(screen.getByLabelText("Cruise speed"), { target: { value: "5" } });

    expect(screen.getByTestId("mission-stats-time").textContent).toContain("0:22");
    expect(setExportSpeeds).toHaveBeenLastCalledWith({ cruiseSpeedMps: 5, hoverSpeedMps: 5 });
  });

  it("shows endurance usage when a budget is entered", () => {
    const { mission } = makeMissionStub();

    render(<MissionPlannerSummary mission={mission} connected={true} />);

    fireEvent.change(screen.getByLabelText("Endurance budget"), { target: { value: "1" } });

    expect(screen.getByTestId("mission-stats-endurance").textContent).toContain("12%");
  });

  it("shows an indeterminate indicator for unbounded commands", () => {
    const { mission } = makeMissionStub({
      draftItems: [loiterUnlimited(0, 47.3779, 8.5417)],
    });

    render(<MissionPlannerSummary mission={mission} connected={true} />);

    expect(screen.getByTestId("mission-stats-state").textContent).toContain("Indeterminate");
    expect(screen.getByTestId("mission-stats-time").textContent).toContain("Indeterminate");
    expect(screen.getByTestId("mission-stats-indeterminate").textContent).toContain("#1");
  });

  it("shows zero distance for an empty mission", () => {
    const { mission } = makeMissionStub({ draftItems: [], homePosition: null });

    render(<MissionPlannerSummary mission={mission} connected={true} />);

    expect(screen.getByTestId("mission-stats-distance").textContent).toContain("0 m");
  });
});
