// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCorridorRegion, createStructureRegion, createSurveyRegion } from "../../lib/survey-region";
import { SurveyRegionCard } from "./SurveyRegionCard";

const POLYGON = [
  { latitude_deg: 47.397742, longitude_deg: 8.545594 },
  { latitude_deg: 47.397742, longitude_deg: 8.547194 },
  { latitude_deg: 47.396642, longitude_deg: 8.547194 },
  { latitude_deg: 47.396642, longitude_deg: 8.545594 },
];

const POLYLINE = [
  { latitude_deg: 47.397742, longitude_deg: 8.545594 },
  { latitude_deg: 47.397142, longitude_deg: 8.546394 },
  { latitude_deg: 47.396642, longitude_deg: 8.547194 },
];

function applyStats(region: ReturnType<typeof createSurveyRegion> | ReturnType<typeof createCorridorRegion> | ReturnType<typeof createStructureRegion>) {
  region.generatedStats = {
    gsd_m: 0.023,
    photoCount: 128,
    area_m2: 18_500,
    triggerDistance_m: 18,
    laneSpacing_m: 24,
    laneCount: 8,
    crosshatchLaneCount: 0,
  };
  return region;
}

afterEach(() => {
  cleanup();
});

describe("SurveyRegionCard", () => {
  it("renders grid, crosshatch grid, corridor, and structure pattern labels", () => {
    const gridRegion = applyStats(createSurveyRegion(POLYGON));
    const crosshatchRegion = applyStats(createSurveyRegion(POLYGON));
    crosshatchRegion.params.crosshatch = true;
    const corridorRegion = createCorridorRegion(POLYLINE);
    corridorRegion.generatedStats = {
      gsd_m: 0.023,
      photoCount: 96,
      area_m2: 12_500,
      triggerDistance_m: 18,
      laneSpacing_m: 24,
      laneCount: 6,
      crosshatchLaneCount: 0,
    };
    const structureRegion = createStructureRegion(POLYGON);
    structureRegion.generatedStats = {
      gsd_m: 0.018,
      photoCount: 64,
      layerCount: 4,
      photosPerLayer: 16,
      layerSpacing_m: 12,
      triggerDistance_m: 16,
      estimatedFlightTime_s: 420,
    };

    const { rerender } = render(
      <SurveyRegionCard
        region={gridRegion}
        label="Region 1"
        selected={false}
        onSelect={() => undefined}
        onDissolve={() => undefined}
        onDelete={() => undefined}
      />,
    );

    expect(screen.getByText("Grid")).toBeTruthy();
    expect(screen.getByText("8 lanes")).toBeTruthy();

    rerender(
      <SurveyRegionCard
        region={crosshatchRegion}
        label="Region 1"
        selected={false}
        onSelect={() => undefined}
        onDissolve={() => undefined}
        onDelete={() => undefined}
      />,
    );

    expect(screen.getByText("Crosshatch grid")).toBeTruthy();

    rerender(
      <SurveyRegionCard
        region={corridorRegion}
        label="Region 1"
        selected={false}
        onSelect={() => undefined}
        onDissolve={() => undefined}
        onDelete={() => undefined}
      />,
    );

    expect(screen.getByText("Corridor")).toBeTruthy();
    expect(screen.getByText("6 lanes")).toBeTruthy();
    expect(screen.getByText("12,500 m²")).toBeTruthy();

    rerender(
      <SurveyRegionCard
        region={structureRegion}
        label="Region 1"
        selected={false}
        onSelect={() => undefined}
        onDissolve={() => undefined}
        onDelete={() => undefined}
      />,
    );

    expect(screen.getByText("Structure scan")).toBeTruthy();
    expect(screen.getByText("4 layers")).toBeTruthy();
  });

  it("calls onSelect when the card summary is clicked", () => {
    const onSelect = vi.fn();

    render(
      <SurveyRegionCard
        region={applyStats(createSurveyRegion(POLYGON))}
        label="Region 1"
        selected={false}
        onSelect={onSelect}
        onDissolve={() => undefined}
        onDelete={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /select region 1/i }));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("triggers dissolve and delete callbacks from the action buttons", () => {
    const onDissolve = vi.fn();
    const onDelete = vi.fn();

    render(
      <SurveyRegionCard
        region={applyStats(createSurveyRegion(POLYGON))}
        label="Region 1"
        selected={true}
        onSelect={() => undefined}
        onDissolve={onDissolve}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^dissolve region 1$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^delete region 1$/i }));

    expect(onDissolve).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("shows the edited badge when the region has manual edits", () => {
    const region = applyStats(createSurveyRegion(POLYGON));
    region.manualEdits.set(0, {
      command: {
        Nav: {
          Waypoint: {
            position: {
              RelHome: {
                latitude_deg: 47.3971,
                longitude_deg: 8.5461,
                relative_alt_m: 60,
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
    });

    render(
      <SurveyRegionCard
        region={region}
        label="Region 1"
        selected={false}
        onSelect={() => undefined}
        onDissolve={() => undefined}
        onDelete={() => undefined}
      />,
    );

    expect(screen.getByText("Edited")).toBeTruthy();
  });
});
