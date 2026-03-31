// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MissionTerrainProfile } from "./MissionTerrainProfile";
import type { ProfileResult } from "../../lib/mission-terrain-profile";

const uPlotChartMock = vi.fn(({ height }: { height: number }) => (
  <div data-testid="terrain-profile-chart" data-height={height} />
));

vi.mock("../charts/UPlotChart", () => ({
  UPlotChart: (props: { height: number }) => uPlotChartMock(props),
}));

function makeProfile(): ProfileResult {
  return {
    points: [
      {
        distance_m: 0,
        terrainMsl: 100,
        flightMsl: 120,
        clearance_m: 20,
        warning: "none",
        index: null,
        isHome: true,
        isWaypoint: true,
      },
      {
        distance_m: 250,
        terrainMsl: 105,
        flightMsl: 124,
        clearance_m: 19,
        warning: "none",
        index: null,
        isHome: false,
        isWaypoint: false,
      },
      {
        distance_m: 500,
        terrainMsl: 110,
        flightMsl: 108,
        clearance_m: -2,
        warning: "below_terrain",
        index: 0,
        isHome: false,
        isWaypoint: true,
      },
      {
        distance_m: 1000,
        terrainMsl: 118,
        flightMsl: 125,
        clearance_m: 7,
        warning: "near_terrain",
        index: 1,
        isHome: false,
        isWaypoint: true,
      },
    ],
    warningsByIndex: new Map([
      [0, "below_terrain"],
      [1, "near_terrain"],
    ]),
  };
}

describe("MissionTerrainProfile", () => {
  beforeEach(() => {
    uPlotChartMock.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders a loading indicator while terrain sampling is active", () => {
    render(
      <MissionTerrainProfile
        profile={null}
        status="loading"
        selectedIndex={null}
      />,
    );

    expect(screen.getByTestId("terrain-profile-loading")).not.toBeNull();
    expect(screen.queryByTestId("terrain-profile-chart")).toBeNull();
  });

  it("renders the no-data placeholder when the profile is unavailable", () => {
    render(
      <MissionTerrainProfile
        profile={null}
        status="error"
        selectedIndex={null}
      />,
    );

    expect(screen.getByText("No elevation data")).not.toBeNull();
    expect(screen.queryByTestId("terrain-profile-chart")).toBeNull();
  });

  it("renders the uPlot chart with terrain and flight series when profile data is ready", () => {
    render(
      <MissionTerrainProfile
        profile={makeProfile()}
        status="ready"
        selectedIndex={0}
        height={120}
      />,
    );

    expect(screen.getByTestId("terrain-profile-chart")).not.toBeNull();
    expect(uPlotChartMock).toHaveBeenCalledTimes(1);

    const props = uPlotChartMock.mock.calls[0][0] as {
      height: number;
      data: unknown[];
      options: { series: Array<{ label?: string }> };
    };

    expect(props.height).toBe(120);
    expect(props.data).toHaveLength(3);
    expect(props.options.series[1]?.label).toBe("Terrain");
    expect(props.options.series[2]?.label).toBe("Flight altitude");
  });

  it("renders waypoint markers for each mission path anchor and toggles selection from marker clicks", () => {
    const onSelectIndex = vi.fn();
    render(
      <MissionTerrainProfile
        profile={makeProfile()}
        status="ready"
        selectedIndex={0}
        onSelectIndex={onSelectIndex}
      />,
    );

    const markers = screen.getAllByTestId("terrain-waypoint-marker");
    expect(markers).toHaveLength(3);
    expect(screen.getAllByTestId("terrain-warning-marker")).toHaveLength(1);

    fireEvent.click(screen.getByLabelText("Waypoint 2 near terrain"));
    expect(onSelectIndex).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByLabelText("Waypoint 1 below terrain"));
    expect(onSelectIndex).toHaveBeenCalledWith(null);
  });
});
