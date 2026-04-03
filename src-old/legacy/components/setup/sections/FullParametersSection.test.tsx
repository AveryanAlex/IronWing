// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FullParametersSection } from "./FullParametersSection";

vi.mock("../../ConfigPanel", () => ({
  ConfigPanel: () => <div>Config Panel</div>,
}));

function makeParams() {
  return {
    store: { params: {}, expected_count: 0 },
    staged: new Map(),
    metadata: new Map(),
    metadataLoading: false,
    progress: null,
    stage: vi.fn(),
    unstage: vi.fn(),
    unstageAll: vi.fn(),
    applyStaged: vi.fn(),
    download: vi.fn(),
    cancel: vi.fn(),
    saveToFile: vi.fn(),
    loadFromFile: vi.fn(),
  } as any;
}

afterEach(() => {
  cleanup();
});

describe("FullParametersSection", () => {
  it("frames the section as an advanced reference and shows the vehicle-specific docs link", () => {
    render(
      <FullParametersSection
        params={makeParams()}
        connected
        vehicleState={{ vehicle_type: "Quadrotor" } as any}
      />,
    );

    expect(screen.getByText(/advanced reference is best for experienced users/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /ardupilot docs/i }).getAttribute("href")).toBe(
      "https://ardupilot.org/copter/docs/parameters.html",
    );
    expect(screen.getByText("Config Panel")).toBeTruthy();
  });

  it("omits the docs link when the vehicle family is unknown", () => {
    render(
      <FullParametersSection
        params={makeParams()}
        connected
        vehicleState={null}
      />,
    );

    expect(screen.queryByRole("link", { name: /ardupilot docs/i })).toBeNull();
  });
});
