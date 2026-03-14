// @vitest-environment jsdom

import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

const { desktopSpy, mobileSpy } = vi.hoisted(() => ({
  desktopSpy: vi.fn(),
  mobileSpy: vi.fn(),
}));

vi.mock("./mission/MissionWorkspace", () => ({
  MissionWorkspace: (props: unknown) => {
    desktopSpy(props);
    return <div>Desktop workspace</div>;
  },
}));

vi.mock("./mission/MissionMobileDrawer", () => ({
  MissionMobileDrawer: (props: unknown) => {
    mobileSpy(props);
    return <div>Mobile drawer</div>;
  },
}));

import { MissionPanel } from "./MissionPanel";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  desktopSpy.mockClear();
  mobileSpy.mockClear();
});

describe("MissionPanel", () => {
  it("renders the desktop workspace when isMobile is false", () => {
    const vehicle = { id: "vehicle" };
    const mission = { id: "mission" };
    const deviceLocation = { id: "location" };

    render(
      <MissionPanel
        vehicle={vehicle as never}
        mission={mission as never}
        deviceLocation={deviceLocation as never}
        isMobile={false}
      />,
    );

    expect(screen.getByText("Desktop workspace")).toBeTruthy();
    expect(screen.queryByText("Mobile drawer")).toBeNull();
    expect(desktopSpy).toHaveBeenCalledTimes(1);
    expect(desktopSpy.mock.calls[0][0]).toMatchObject({ vehicle, mission, deviceLocation });
    expect(mobileSpy).not.toHaveBeenCalled();
  });

  it("renders the mobile drawer when isMobile is true", () => {
    const vehicle = { id: "vehicle" };
    const mission = { id: "mission" };
    const deviceLocation = { id: "location" };

    render(
      <MissionPanel
        vehicle={vehicle as never}
        mission={mission as never}
        deviceLocation={deviceLocation as never}
        isMobile={true}
      />,
    );

    expect(screen.getByText("Mobile drawer")).toBeTruthy();
    expect(screen.queryByText("Desktop workspace")).toBeNull();
    expect(mobileSpy).toHaveBeenCalledTimes(1);
    expect(mobileSpy.mock.calls[0][0]).toMatchObject({ vehicle, mission, deviceLocation });
    expect(desktopSpy).not.toHaveBeenCalled();
  });
});
