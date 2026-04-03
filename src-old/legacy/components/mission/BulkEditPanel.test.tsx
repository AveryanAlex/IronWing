// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BulkEditPanel } from "./BulkEditPanel";

afterEach(() => {
  cleanup();
});

function makeMission(overrides?: Partial<{
  tab: "mission" | "fence" | "rally";
  readOnly: boolean;
  selectedCount: number;
  selectedIndices: number[];
}>) {
  const draftItems = [
    { uiId: 1, index: 0, preview: { latitude_deg: 47.1, longitude_deg: 8.1, altitude_m: 25 } },
    { uiId: 2, index: 1, preview: { latitude_deg: 47.2, longitude_deg: 8.2, altitude_m: 25 } },
  ];

  return {
    current: {
      tab: "mission" as const,
      readOnly: false,
      selectedCount: 2,
      selectedIndices: [0, 1],
      selectedUiIds: new Set<number>([1, 2]),
      draftItems,
      bulkUpdateAltitude: vi.fn(),
      bulkDelete: vi.fn(),
      deselectAll: vi.fn(),
      ...overrides,
    },
  };
}

describe("BulkEditPanel", () => {
  it("commits a shared altitude and exposes bulk delete and deselect actions", () => {
    const mission = makeMission();
    render(<BulkEditPanel mission={mission as never} />);

    const altitudeInput = screen.getByRole("spinbutton");
    fireEvent.change(altitudeInput, { target: { value: "120" } });
    fireEvent.blur(altitudeInput);

    expect(mission.current.bulkUpdateAltitude).toHaveBeenCalledWith(120);

    fireEvent.click(screen.getByRole("button", { name: /Delete Selected/i }));
    fireEvent.click(screen.getByRole("button", { name: /Deselect All/i }));

    expect(mission.current.bulkDelete).toHaveBeenCalledTimes(1);
    expect(mission.current.deselectAll).toHaveBeenCalledTimes(1);
  });

  it("hides altitude editing for fence multi-selection", () => {
    const mission = makeMission({ tab: "fence" });
    render(<BulkEditPanel mission={mission as never} />);

    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.getByText(/Altitude bulk edits are only available/i)).toBeTruthy();
  });
});
