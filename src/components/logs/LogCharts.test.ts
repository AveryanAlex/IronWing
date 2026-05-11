// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LogLibraryEntry } from "../../logs";
import type { LogsChartState, LogsExportState } from "../../lib/stores/logs-workspace";
import LogCharts from "./LogCharts.svelte";

function createEntry(
  format: LogLibraryEntry["metadata"]["format"],
  messageTypes: Record<string, number>,
  overrides: Partial<LogLibraryEntry> = {},
): LogLibraryEntry {
  return {
    entry_id: `${format}-entry`,
    status: "ready",
    imported_at_unix_msec: 1,
    source: {
      original_path: `/logs/sample.${format}`,
      fingerprint: { size_bytes: 1024, modified_unix_msec: 2 },
      status: { kind: "available", current_fingerprint: { size_bytes: 1024, modified_unix_msec: 2 } },
    },
    metadata: {
      display_name: `sample.${format}`,
      format,
      start_usec: 1_000_000,
      end_usec: 61_000_000,
      duration_secs: 60,
      total_messages: 100,
      message_types: messageTypes,
      vehicle_type: "quadrotor",
      autopilot: "ardupilotmega",
    },
    diagnostics: [],
    index: {
      index_id: "idx-sample",
      relative_path: "logs/indexes/sample.json",
      format,
      index_version: 1,
      built_at_unix_msec: 3,
      message_count: 100,
      covers_start_usec: 1_000_000,
      covers_end_usec: 61_000_000,
    },
    ...overrides,
  } satisfies LogLibraryEntry;
}

function createChartState(overrides: Partial<LogsChartState> = {}): LogsChartState {
  return {
    phase: "ready",
    error: null,
    request: null,
    page: {
      entry_id: "tlog-entry",
      start_usec: 1_000_000,
      end_usec: 61_000_000,
      series: [
        {
          selector: { message_type: "ATTITUDE", field: "roll", label: "Roll", unit: "rad" },
          points: [
            { timestamp_usec: 1_000_000, value: 0.1 },
            { timestamp_usec: 31_000_000, value: 0.4 },
            { timestamp_usec: 61_000_000, value: 0.2 },
          ],
        },
      ],
      diagnostics: [],
    },
    activeGroupKey: "attitude",
    hoveredCursorUsec: null,
    selectedRange: null,
    exportDestinationPath: "",
    ...overrides,
  } satisfies LogsChartState;
}

function createExportState(overrides: Partial<LogsExportState> = {}): LogsExportState {
  return {
    origin: null,
    phase: "idle",
    error: null,
    request: null,
    progress: null,
    result: null,
    ...overrides,
  } satisfies LogsExportState;
}

describe("LogCharts", () => {
  afterEach(() => {
    cleanup();
  });

  it("requests a bounded chart query for the supported active group", () => {
    const requestChartRange = vi.fn();

    render(LogCharts, {
      props: {
        entry: createEntry("tlog", { ATTITUDE: 40 }),
        chartState: createChartState(),
        exportState: createExportState(),
        playbackCursorUsec: 2_000_000,
        playbackRangeStartUsec: 1_000_000,
        playbackRangeEndUsec: 61_000_000,
        onSelectGroup: vi.fn(),
        onHoverCursor: vi.fn(),
        onSelectRange: vi.fn(),
        onExportDestinationChange: vi.fn(),
        onRequestChartRange: requestChartRange,
        onExportSelectedRange: vi.fn(),
      },
    });

    expect(requestChartRange).toHaveBeenCalledWith({
      selectors: [
        { message_type: "ATTITUDE", field: "roll", label: "Roll", unit: "rad" },
        { message_type: "ATTITUDE", field: "pitch", label: "Pitch", unit: "rad" },
        { message_type: "ATTITUDE", field: "yaw", label: "Yaw", unit: "rad" },
      ],
      start_usec: 1_000_000,
      end_usec: 61_000_000,
      max_points: 240,
    });
  });

  it("shows unsupported state and does not query when no supported groups exist", () => {
    const requestChartRange = vi.fn();

    render(LogCharts, {
      props: {
        entry: createEntry("tlog", { HEARTBEAT: 40 }),
        chartState: createChartState({ activeGroupKey: null, page: null, request: null }),
        exportState: createExportState(),
        playbackCursorUsec: 2_000_000,
        playbackRangeStartUsec: 1_000_000,
        playbackRangeEndUsec: 61_000_000,
        onSelectGroup: vi.fn(),
        onHoverCursor: vi.fn(),
        onSelectRange: vi.fn(),
        onExportDestinationChange: vi.fn(),
        onRequestChartRange: requestChartRange,
        onExportSelectedRange: vi.fn(),
      },
    });

    expect(screen.getByTestId("logs-charts-unsupported").textContent).toContain("No bounded chart query was sent");
    expect(requestChartRange).not.toHaveBeenCalled();
  });

  it("does not query or expose supported groups for missing entries even when message types match", () => {
    const requestChartRange = vi.fn();

    render(LogCharts, {
      props: {
        entry: createEntry("tlog", { ATTITUDE: 40 }, {
          status: "missing",
          source: {
            original_path: "/logs/missing.tlog",
            fingerprint: { size_bytes: 1024, modified_unix_msec: 2 },
            status: { kind: "missing" },
          },
        }),
        chartState: createChartState({ activeGroupKey: null, page: null, request: null }),
        exportState: createExportState(),
        playbackCursorUsec: 2_000_000,
        playbackRangeStartUsec: 1_000_000,
        playbackRangeEndUsec: 61_000_000,
        onSelectGroup: vi.fn(),
        onHoverCursor: vi.fn(),
        onSelectRange: vi.fn(),
        onExportDestinationChange: vi.fn(),
        onRequestChartRange: requestChartRange,
        onExportSelectedRange: vi.fn(),
      },
    });

    expect(screen.getByTestId("logs-charts-unsupported").textContent).toContain("No bounded chart query was sent");
    expect(requestChartRange).not.toHaveBeenCalled();
  });

  it("does not query or expose supported groups for corrupt unindexed entries even when message types match", () => {
    const requestChartRange = vi.fn();

    render(LogCharts, {
      props: {
        entry: createEntry("bin", { ATT: 40, CTUN: 20 }, {
          status: "corrupt",
          index: null,
        }),
        chartState: createChartState({ activeGroupKey: null, page: null, request: null }),
        exportState: createExportState(),
        playbackCursorUsec: 2_000_000,
        playbackRangeStartUsec: 1_000_000,
        playbackRangeEndUsec: 61_000_000,
        onSelectGroup: vi.fn(),
        onHoverCursor: vi.fn(),
        onSelectRange: vi.fn(),
        onExportDestinationChange: vi.fn(),
        onRequestChartRange: requestChartRange,
        onExportSelectedRange: vi.fn(),
      },
    });

    expect(screen.getByTestId("logs-charts-unsupported").textContent).toContain("No bounded chart query was sent");
    expect(requestChartRange).not.toHaveBeenCalled();
  });

  it("reports drag-selected ranges from the full bounded replay window", async () => {
    const selectRange = vi.fn();
    const hoverCursor = vi.fn();

    render(LogCharts, {
      props: {
        entry: createEntry("tlog", { ATTITUDE: 40 }),
        chartState: createChartState({
          selectedRange: null,
          exportDestinationPath: "/tmp/range.csv",
        }),
        exportState: createExportState(),
        playbackCursorUsec: 2_000_000,
        playbackRangeStartUsec: 1_000_000,
        playbackRangeEndUsec: 61_000_000,
        onSelectGroup: vi.fn(),
        onHoverCursor: hoverCursor,
        onSelectRange: selectRange,
        onExportDestinationChange: vi.fn(),
        onRequestChartRange: vi.fn(),
        onExportSelectedRange: vi.fn(),
      },
    });

    const plot = screen.getByTestId("logs-chart-plot-roll");
    Object.defineProperty(plot, "getBoundingClientRect", {
      value: () => ({ left: 0, width: 200, top: 0, height: 120, right: 200, bottom: 120, x: 0, y: 0, toJSON: () => ({}) }),
    });

    await fireEvent.pointerDown(plot, { clientX: 40 });
    await fireEvent.pointerMove(window, { clientX: 140 });
    await fireEvent.pointerUp(window, { clientX: 140 });

    expect(selectRange).toHaveBeenCalledWith(13_000_000, 43_000_000);
    expect(hoverCursor).toHaveBeenCalled();
    expect(plot.querySelector("svg")).toBeNull();
  });

  it("exports the selected range with active group message filters", async () => {
    const exportSelectedRange = vi.fn();

    render(LogCharts, {
      props: {
        entry: createEntry("tlog", { ATTITUDE: 40 }),
        chartState: createChartState({
          selectedRange: { startUsec: 13_000_000, endUsec: 43_000_000 },
          exportDestinationPath: "/tmp/range.csv",
        }),
        exportState: createExportState(),
        playbackCursorUsec: 2_000_000,
        playbackRangeStartUsec: 1_000_000,
        playbackRangeEndUsec: 61_000_000,
        onSelectGroup: vi.fn(),
        onHoverCursor: vi.fn(),
        onSelectRange: vi.fn(),
        onExportDestinationChange: vi.fn(),
        onRequestChartRange: vi.fn(),
        onExportSelectedRange: exportSelectedRange,
      },
    });

    await fireEvent.click(screen.getByTestId("logs-chart-export-button"));
    expect(exportSelectedRange).toHaveBeenCalledWith({
      destinationPath: "/tmp/range.csv",
      startUsec: 13_000_000,
      endUsec: 43_000_000,
      messageTypes: ["ATTITUDE"],
    });
  });

  it("shows the empty bounded-range state when every requested selector returns zero points", () => {
    render(LogCharts, {
      props: {
        entry: createEntry("tlog", { ATTITUDE: 40 }),
        chartState: createChartState({
          page: {
            entry_id: "tlog-entry",
            start_usec: 1_000_000,
            end_usec: 61_000_000,
            series: [
              {
                selector: { message_type: "ATTITUDE", field: "roll", label: "Roll", unit: "rad" },
                points: [],
              },
              {
                selector: { message_type: "ATTITUDE", field: "pitch", label: "Pitch", unit: "rad" },
                points: [],
              },
            ],
            diagnostics: [],
          },
        }),
        exportState: createExportState(),
        playbackCursorUsec: 2_000_000,
        playbackRangeStartUsec: 1_000_000,
        playbackRangeEndUsec: 61_000_000,
        onSelectGroup: vi.fn(),
        onHoverCursor: vi.fn(),
        onSelectRange: vi.fn(),
        onExportDestinationChange: vi.fn(),
        onRequestChartRange: vi.fn(),
        onExportSelectedRange: vi.fn(),
      },
    });

    expect(screen.getByTestId("logs-charts-no-series").textContent).toContain("No chart data landed");
  });

  it("does not render raw export feedback inside the chart export panel", () => {
    render(LogCharts, {
      props: {
        entry: createEntry("tlog", { ATTITUDE: 40 }),
        chartState: createChartState({
          selectedRange: { startUsec: 13_000_000, endUsec: 43_000_000 },
          exportDestinationPath: "/tmp/range.csv",
        }),
        exportState: createExportState({
          origin: "raw-browser",
          phase: "completed",
          result: {
            operation_id: "log_export",
            destination_path: "/tmp/raw.csv",
            bytes_written: 64,
            rows_written: 4,
            diagnostics: [],
          },
        }),
        playbackCursorUsec: 2_000_000,
        playbackRangeStartUsec: 1_000_000,
        playbackRangeEndUsec: 61_000_000,
        onSelectGroup: vi.fn(),
        onHoverCursor: vi.fn(),
        onSelectRange: vi.fn(),
        onExportDestinationChange: vi.fn(),
        onRequestChartRange: vi.fn(),
        onExportSelectedRange: vi.fn(),
      },
    });

    expect(screen.queryByTestId("logs-chart-export-result")).toBeNull();
    expect(screen.getByTestId("logs-chart-export-button").textContent).toContain("Export selected range as CSV");
  });
});
