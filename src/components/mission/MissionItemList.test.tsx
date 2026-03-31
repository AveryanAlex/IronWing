// @vitest-environment jsdom

import type { ReactNode } from "react";
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MissionItemList } from "./MissionItemList";
import type { TerrainWarning } from "../../lib/mission-terrain-profile";

vi.mock("../ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

function makeDraftItem(index: number, uiId: number) {
  return {
    uiId,
    index,
    document: {
      command: {
        Nav: {
          Waypoint: {
            position: { RelHome: { latitude_deg: 47 + index, longitude_deg: 8 + index, relative_alt_m: 25 } },
            hold_time_s: 0,
            acceptance_radius_m: 1,
            pass_radius_m: 0,
            yaw_deg: 0,
          },
        },
      },
      current: index === 0,
      autocontinue: true,
    },
    readOnly: false,
    preview: {
      latitude_deg: 47 + index,
      longitude_deg: 8 + index,
      altitude_m: 25,
    },
  };
}

function createMission() {
  const select = vi.fn();
  const toggleSelect = vi.fn();
  const selectRange = vi.fn();

  return {
    mission: {
      setCurrent: vi.fn(),
    },
    vehicle: {
      activeSeq: null,
    },
    current: {
      tab: "mission",
      draftItems: [makeDraftItem(0, 101), makeDraftItem(1, 102), makeDraftItem(2, 103)],
      readOnly: false,
      selectedIndex: 0,
      selectedUiIds: new Set<number>([101]),
      selectionAnchorIndex: 0,
      reorderItems: vi.fn(),
      select,
      toggleSelect,
      selectRange,
      insertBefore: vi.fn(),
      insertAfter: vi.fn(),
      deleteAt: vi.fn(),
      moveWaypointOnMap: vi.fn(),
    },
  };
}

describe("MissionItemList", () => {
  it("routes plain, shift, and ctrl/cmd clicks to the appropriate selection helpers", () => {
    const mission = createMission();
    const onCardSelect = vi.fn();
    const { container } = render(
      <MissionItemList mission={mission as never} onCardSelect={onCardSelect} />,
    );

    const cards = Array.from(container.querySelectorAll("[data-mission-waypoint-card]"));
    expect(cards).toHaveLength(3);

    fireEvent.click(cards[2]!);
    expect(mission.current.select).toHaveBeenCalledWith(2);
    expect(onCardSelect).toHaveBeenCalledWith(2);

    fireEvent.click(cards[1]!, { shiftKey: true });
    expect(mission.current.selectRange).toHaveBeenCalledWith(0, 1);
    expect(onCardSelect).toHaveBeenCalledWith(1);

    fireEvent.click(cards[1]!, { ctrlKey: true });
    expect(mission.current.toggleSelect).toHaveBeenCalledWith(1);
  });

  it("passes terrain warning state through to individual cards by item index", () => {
    const mission = createMission();
    const terrainWarnings = new Map<number, TerrainWarning>([
      [1, "below_terrain"],
      [2, "near_terrain"],
    ]);

    const { container } = render(
      <MissionItemList
        mission={mission as never}
        terrainWarnings={terrainWarnings}
      />,
    );

    expect(container.querySelector("[data-seq='1'] [data-terrain-warning='below_terrain']")).not.toBeNull();
    expect(container.querySelector("[data-seq='2'] [data-terrain-warning='near_terrain']")).not.toBeNull();
    expect(container.querySelector("[data-seq='0'] [data-terrain-warning]")).toBeNull();
  });
});
