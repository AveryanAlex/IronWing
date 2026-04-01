// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createSurveyRegion } from "../../lib/survey-region";
import { SurveyRegionCard } from "./SurveyRegionCard";

const POLYGON = [
  { latitude_deg: 47.397742, longitude_deg: 8.545594 },
  { latitude_deg: 47.397742, longitude_deg: 8.547194 },
  { latitude_deg: 47.396642, longitude_deg: 8.547194 },
  { latitude_deg: 47.396642, longitude_deg: 8.545594 },
];

function createRegion() {
  const region = createSurveyRegion(POLYGON);
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
  it("renders the collapsed region summary", () => {
    const region = createRegion();

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

    expect(screen.getByText("Region 1")).toBeTruthy();
    expect(screen.getByText("Single-pass")).toBeTruthy();
    expect(screen.getByText(/128 photos/i)).toBeTruthy();
    expect(screen.getByText("18,500 m²")).toBeTruthy();
  });

  it("calls onSelect when the card summary is clicked", () => {
    const onSelect = vi.fn();

    render(
      <SurveyRegionCard
        region={createRegion()}
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
        region={createRegion()}
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
    const region = createRegion();
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
