// @vitest-environment jsdom

import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect } from "vitest";
import { MissionHomeCard } from "./MissionHomeCard";

afterEach(() => {
  cleanup();
});

describe("MissionHomeCard", () => {
  it("renders mission home coordinates, altitude, and source when home is set", () => {
    render(
      <MissionHomeCard
        missionType="mission"
        homePosition={{
          latitude_deg: 47.3769,
          longitude_deg: 8.5417,
          altitude_m: 408.25,
        }}
        homeSource="vehicle"
      />,
    );

    expect(screen.getByText("Home Position")).toBeTruthy();
    expect(screen.getByText("47.376900, 8.541700")).toBeTruthy();
    expect(screen.getByText("408.3 m")).toBeTruthy();
    expect(screen.getByText("vehicle")).toBeTruthy();
  });

  it("shows mission guidance when home is not set", () => {
    render(
      <MissionHomeCard
        missionType="mission"
        homePosition={null}
        homeSource={null}
      />,
    );

    expect(screen.getByText(/Not set/i)).toBeTruthy();
    expect(screen.getByText(/Home from Vehicle/i)).toBeTruthy();
  });

  it("renders fence-specific copy and docs link", () => {
    render(
      <MissionHomeCard
        missionType="fence"
        homePosition={null}
        homeSource={null}
      />,
    );

    expect(screen.getByText("Fence Info")).toBeTruthy();
    expect(
      screen.getByText(/Geofence boundaries are defined independently of home/i),
    ).toBeTruthy();

    const link = screen.getByRole("link", { name: /ArduPilot Docs/i });
    expect(link.getAttribute("href")).toBe(
      "https://ardupilot.org/copter/docs/common-ac2_simple_geofence.html",
    );
  });

  it("renders rally-specific copy", () => {
    render(
      <MissionHomeCard
        missionType="rally"
        homePosition={null}
        homeSource={null}
      />,
    );

    expect(screen.getByText("Rally Info")).toBeTruthy();
    expect(
      screen.getByText(/Rally points are standalone return locations independent of home/i),
    ).toBeTruthy();
  });
});
