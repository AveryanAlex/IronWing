// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OverviewSection } from "./OverviewSection";

vi.mock("../shared/use-prearm-checks", () => ({
  usePrearmChecks: () => ({
    blockers: [],
    checking: false,
    runChecks: vi.fn(),
  }),
}));

function makeParams(overrides: Record<string, unknown> = {}) {
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
    ...overrides,
  } as any;
}

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    connected: true,
    vehicleState: {
      vehicle_type: "Quadrotor",
      autopilot: "ardu_pilot_mega",
      system_id: 1,
      mode_name: "Loiter",
      armed: false,
      system_status: "standby",
    },
    telemetry: null,
    linkState: "connected",
    support: { value: { can_request_prearm_checks: false } },
    sensorHealth: null,
    homePosition: null,
    params: makeParams(),
    sectionStatuses: new Map(),
    overallProgress: { completed: 0, total: 18, percentage: 0 },
    onNavigateSection: vi.fn(),
    ...overrides,
  } as any;
}

afterEach(() => {
  cleanup();
});

describe("OverviewSection", () => {
  it("shows the setup guide link only in the ready state", () => {
    render(<OverviewSection {...makeProps()} />);

    expect(screen.getByRole("link", { name: /setup guide/i }).getAttribute("href")).toBe(
      "https://ardupilot.org/copter/docs/configuring-hardware.html",
    );
  });

  it("does not show the setup guide link before setup is ready", () => {
    const { rerender } = render(
      <OverviewSection
        {...makeProps({ connected: false })}
      />,
    );
    expect(screen.queryByRole("link", { name: /setup guide/i })).toBeNull();

    rerender(
      <OverviewSection
        {...makeProps({ params: makeParams({ store: null, metadata: null }) })}
      />,
    );
    expect(screen.queryByRole("link", { name: /setup guide/i })).toBeNull();

    rerender(
      <OverviewSection
        {...makeProps({ params: makeParams({ metadata: null, metadataLoading: true }) })}
      />,
    );
    expect(screen.queryByRole("link", { name: /setup guide/i })).toBeNull();
  });
});
