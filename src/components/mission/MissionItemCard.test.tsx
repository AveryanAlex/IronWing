// @vitest-environment jsdom

import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MissionItemCard } from "./MissionItemCard";
import type { TerrainWarning } from "../../lib/mission-terrain-profile";

vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
}));

vi.mock("../ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

function makeDraftItem() {
  return {
    uiId: 101,
    index: 0,
    document: {
      command: {
        Nav: {
          Waypoint: {
            position: {
              RelHome: {
                latitude_deg: 47.397742,
                longitude_deg: 8.545594,
                relative_alt_m: 35,
              },
            },
            hold_time_s: 0,
            acceptance_radius_m: 1,
            pass_radius_m: 0,
            yaw_deg: 0,
          },
        },
      },
      current: false,
      autocontinue: true,
    },
    readOnly: false,
    preview: {
      latitude_deg: 47.397742,
      longitude_deg: 8.545594,
      altitude_m: 35,
    },
  };
}

function renderCard(terrainWarning?: TerrainWarning) {
  return render(
    <MissionItemCard
      draftItem={makeDraftItem() as never}
      displayIndex={1}
      isPrimarySelected={false}
      isMultiSelected={false}
      isActive={false}
      missionType="mission"
      readOnly={false}
      terrainWarning={terrainWarning}
      onSelect={vi.fn()}
      onShiftClick={vi.fn()}
      onCtrlClick={vi.fn()}
      onInsertBefore={vi.fn()}
      onInsertAfter={vi.fn()}
      onDelete={vi.fn()}
      onSetCurrent={vi.fn()}
    />,
  );
}

describe("MissionItemCard", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders without a terrain warning icon by default", () => {
    const { container } = renderCard();

    expect(container.querySelector("[data-terrain-warning]")).toBeNull();
  });

  it("renders a red warning icon for below-terrain waypoints", () => {
    const { container } = renderCard("below_terrain");

    const warningIcon = container.querySelector("[data-terrain-warning='below_terrain']");
    expect(warningIcon).not.toBeNull();
    expect(warningIcon?.parentElement?.getAttribute("class") ?? "").toContain("text-danger");
    expect(screen.queryByLabelText("Below terrain")).not.toBeNull();
  });

  it("renders an amber warning icon for near-terrain waypoints", () => {
    const { container } = renderCard("near_terrain");

    const warningIcon = container.querySelector("[data-terrain-warning='near_terrain']");
    expect(warningIcon).not.toBeNull();
    expect(warningIcon?.parentElement?.getAttribute("class") ?? "").toContain("text-warning");
    expect(screen.queryByLabelText("Near terrain")).not.toBeNull();
  });

  it("does not render a warning icon for no_data", () => {
    const { container } = renderCard("no_data");

    expect(container.querySelector("[data-terrain-warning]")).toBeNull();
    expect(screen.queryByLabelText("Below terrain")).toBeNull();
    expect(screen.queryByLabelText("Near terrain")).toBeNull();
  });
});
