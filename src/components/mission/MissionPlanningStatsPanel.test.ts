// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import MissionPlanningStatsPanel from "./MissionPlanningStatsPanel.svelte";
import { missionWorkspaceTestIds } from "./mission-workspace-test-ids";
import type { TypedDraftItem } from "../../lib/mission-draft-typed";
import type { FenceRegion, GeoPoint3d, MissionCommand, MissionItem } from "../../lib/mavkit-types";
import { defaultGeoPoint3d } from "../../lib/mavkit-types";
import { latLonFromBearingDistance } from "../../lib/mission-coordinates";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function makeMissionItem(command: MissionCommand): MissionItem {
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

function waypoint(index: number, lat: number, lon: number, altitude_m = 30): TypedDraftItem {
  return makeDraftItem(index, {
    Nav: {
      Waypoint: {
        position: defaultGeoPoint3d(lat, lon, altitude_m),
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
        radius_m: 50,
        direction: "Clockwise",
      },
    },
  });
}

function loiterTurns(index: number, lat: number, lon: number, radius_m: number, turns = 1): TypedDraftItem {
  return makeDraftItem(index, {
    Nav: {
      LoiterTurns: {
        position: defaultGeoPoint3d(lat, lon, 30),
        turns,
        radius_m,
        direction: "Clockwise",
        exit_xtrack: false,
      },
    },
  });
}

function offsetPoint(
  reference: { latitude_deg: number; longitude_deg: number },
  bearing_deg: number,
  distance_m: number,
): { lat: number; lon: number } {
  return latLonFromBearingDistance(reference, bearing_deg, distance_m);
}

function makeFenceRegion(): FenceRegion {
  return {
    inclusion_polygon: {
      inclusion_group: 0,
      vertices: [
        { latitude_deg: 47.401, longitude_deg: 8.551 },
        { latitude_deg: 47.403, longitude_deg: 8.551 },
        { latitude_deg: 47.403, longitude_deg: 8.553 },
        { latitude_deg: 47.401, longitude_deg: 8.553 },
      ],
    },
  };
}

function makeRallyPoint(latitude_deg: number, longitude_deg: number, altitude_m = 25): GeoPoint3d {
  return defaultGeoPoint3d(latitude_deg, longitude_deg, altitude_m);
}

function renderStatsPanel(overrides: Partial<{
  home: { latitude_deg: number; longitude_deg: number; altitude_m: number } | null;
  missionItems: TypedDraftItem[];
  fenceRegions: FenceRegion[];
  rallyPoints: GeoPoint3d[];
  cruiseSpeed: number;
  hoverSpeed: number;
  confirmedCruiseSpeed: number;
  confirmedHoverSpeed: number;
  readOnly: boolean;
  onSetPlanningSpeeds: ReturnType<typeof vi.fn>;
  onPersistPlanningSpeeds: ReturnType<typeof vi.fn>;
}> = {}) {
  const home = "home" in overrides
    ? overrides.home ?? null
    : {
      latitude_deg: 47.3769,
      longitude_deg: 8.5417,
      altitude_m: 488,
    };

  const props = {
    home,
    missionItems: overrides.missionItems ?? [],
    fenceRegions: overrides.fenceRegions ?? [],
    rallyPoints: overrides.rallyPoints ?? [],
    cruiseSpeed: overrides.cruiseSpeed ?? 15,
    hoverSpeed: overrides.hoverSpeed ?? 5,
    confirmedCruiseSpeed: overrides.confirmedCruiseSpeed ?? 15,
    confirmedHoverSpeed: overrides.confirmedHoverSpeed ?? 5,
    readOnly: overrides.readOnly ?? false,
    onSetPlanningSpeeds: overrides.onSetPlanningSpeeds ?? vi.fn(),
    onPersistPlanningSpeeds: overrides.onPersistPlanningSpeeds ?? vi.fn(),
  };

  return {
    ...render(MissionPlanningStatsPanel, props),
    props,
  };
}

describe("MissionPlanningStatsPanel", () => {
  it("renders mission, fence, and rally statistics with explicit indeterminate reasons", () => {
    const home = {
      latitude_deg: 47.3769,
      longitude_deg: 8.5417,
      altitude_m: 488,
    };
    const target = offsetPoint(home, 90, 150);

    renderStatsPanel({
      home,
      missionItems: [
        waypoint(0, target.lat, target.lon, 40),
        loiterUnlimited(1, target.lat, target.lon),
      ],
      fenceRegions: [makeFenceRegion()],
      rallyPoints: [makeRallyPoint(47.4012, 8.5512)],
    });

    expect(screen.getByTestId(missionWorkspaceTestIds.planningStatsPanel)).toBeTruthy();
    expect(screen.getByTestId(missionWorkspaceTestIds.planningStatsMissionState).textContent).toContain("Indeterminate");
    expect(screen.getByTestId(missionWorkspaceTestIds.planningStatsMissionDistance).textContent).toContain("distance");
    expect(screen.getByTestId(missionWorkspaceTestIds.planningStatsIndeterminate).textContent).toContain("#2");
    expect(screen.getByTestId(missionWorkspaceTestIds.planningStatsIndeterminate).textContent).toContain("Loiter-unlimited commands");
    expect(screen.getByTestId(missionWorkspaceTestIds.planningStatsFenceRegions).textContent).toContain("1");
    expect(screen.getByTestId(missionWorkspaceTestIds.planningStatsRallyCount).textContent).toContain("1");
  });

  it("keeps invalid speed edits local until valid and preserves the last confirmed estimate", async () => {
    const onSetPlanningSpeeds = vi.fn();
    const onPersistPlanningSpeeds = vi.fn();
    const home = {
      latitude_deg: 47.3769,
      longitude_deg: 8.5417,
      altitude_m: 488,
    };
    const target = offsetPoint(home, 90, 180);

    renderStatsPanel({
      home,
      missionItems: [
        waypoint(0, target.lat, target.lon, 30),
        loiterTurns(1, target.lat, target.lon, 40, 1.5),
      ],
      cruiseSpeed: 15,
      hoverSpeed: 5,
      confirmedCruiseSpeed: 12,
      confirmedHoverSpeed: 4,
      onSetPlanningSpeeds,
      onPersistPlanningSpeeds,
    });

    const timeBefore = screen.getByTestId(missionWorkspaceTestIds.planningStatsMissionTime).textContent;
    const speedStatus = screen.getByTestId(missionWorkspaceTestIds.planningStatsSpeedStatus).textContent;
    expect(speedStatus).toContain("Draft override");

    const cruiseInput = screen.getByTestId(missionWorkspaceTestIds.planningStatsCruiseInput) as HTMLInputElement;
    await fireEvent.input(cruiseInput, { target: { value: "0" } });
    await fireEvent.change(cruiseInput, { target: { value: "0" } });

    expect(screen.getByTestId(missionWorkspaceTestIds.planningStatsCruiseValidation).textContent).toContain("greater than 0 m/s");
    expect(onSetPlanningSpeeds).not.toHaveBeenCalled();
    expect(onPersistPlanningSpeeds).not.toHaveBeenCalled();
    expect(screen.getByTestId(missionWorkspaceTestIds.planningStatsMissionTime).textContent).toBe(timeBefore);

    await fireEvent.input(cruiseInput, { target: { value: "9" } });
    await fireEvent.change(cruiseInput, { target: { value: "9" } });

    expect(onSetPlanningSpeeds).toHaveBeenCalledWith({ cruiseSpeed: 9 });
    expect(onPersistPlanningSpeeds).toHaveBeenCalledWith({ cruiseSpeed: 9 });
  });

  it("surfaces missing-home rally distance as unavailable instead of a fake zero", () => {
    renderStatsPanel({
      home: null,
      rallyPoints: [makeRallyPoint(47.4012, 8.5512)],
    });

    expect(screen.getByTestId(missionWorkspaceTestIds.planningStatsRallyMaxDistance).textContent).toContain("Unavailable");
    expect(screen.getByTestId(missionWorkspaceTestIds.planningStatsRallyMaxDistance).textContent).toContain("Set Home");
  });
});
