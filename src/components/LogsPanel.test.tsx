// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { save, exportLogCsv } = vi.hoisted(() => ({
  save: vi.fn(),
  exportLogCsv: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ save }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../playback", () => ({ getFlightPath: vi.fn(async () => null) }));
vi.mock("../logs", async () => {
  const actual = await vi.importActual<typeof import("../logs")>("../logs");
  return {
    ...actual,
    exportLogCsv,
    getFlightSummary: vi.fn(async () => null),
  };
});
vi.mock("./charts/Timeline", () => ({
  Timeline: () => <div>Timeline</div>,
}));
vi.mock("./charts/LogCharts", () => ({
  getChartDefs: vi.fn(() => []),
  toAligned: vi.fn(() => null),
  LogCharts: ({ onRangeSelect }: { onRangeSelect: (range: { startUsec: number; endUsec: number }) => void }) => (
    <button onClick={() => onRangeSelect({ startUsec: 200, endUsec: 400 })}>Select Range</button>
  ),
}));

import { LogsPanel } from "./LogsPanel";

describe("LogsPanel", () => {
  beforeEach(() => {
    save.mockReset();
    exportLogCsv.mockReset();
  });

  it("exports the latest selected range", async () => {
    save.mockResolvedValue("/tmp/export.csv");
    exportLogCsv.mockResolvedValue(12);

    const logs = {
      summary: {
        file_name: "flight.tlog",
        start_usec: 100,
        end_usec: 1000,
        duration_secs: 10,
        total_entries: 42,
        message_types: {},
        log_type: "tlog",
      },
      progress: null,
      loading: false,
      openFile: vi.fn(),
      closeFile: vi.fn(),
      queryMessages: vi.fn(async () => []),
    };
    const recording = {
      status: "idle",
      isRecording: false,
      start: vi.fn(),
      stop: vi.fn(),
    };
    const playback = {
      configure: vi.fn(),
      stop: vi.fn(),
      currentTimeUsec: 100,
      isPlaying: false,
      speed: 1,
      play: vi.fn(),
      pause: vi.fn(),
      seek: vi.fn(),
      setSpeed: vi.fn(),
    };

    render(
      <LogsPanel
        logs={logs as never}
        recording={recording as never}
        connected={false}
        playback={playback as never}
        onFlightPath={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Select Range"));
    await waitFor(() => expect(screen.getByText("Export Range")).toBeTruthy());

    fireEvent.click(screen.getByText("Export Range"));

    await waitFor(() => expect(exportLogCsv).toHaveBeenCalledWith("/tmp/export.csv", 200, 400));
  });
});
