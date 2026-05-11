import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock, listenMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  listenMock: vi.fn(),
}));

vi.mock("@platform/core", () => ({
  invoke: invokeMock,
}));

vi.mock("@platform/event", () => ({
  listen: listenMock,
}));

import {
  cancelLogLibraryOperation,
  closeLog,
  exportLog,
  exportLogCsv,
  getFlightSummary,
  getLogLibraryCatalog,
  getLogSummary,
  listLogFormatAdapters,
  openLog,
  queryChartSeries,
  queryFlightPath,
  queryLogMessages,
  queryRawMessages,
  refreshLogLibrary,
  registerLogLibraryEntry,
  registerLogLibraryEntryFromPicker,
  reindexLogLibraryEntry,
  relinkLogLibraryEntry,
  removeLogLibraryEntry,
  subscribeLogProgress,
  type ChartSeriesRequest,
  type FlightPathQuery,
  type LogExportRequest,
  type LogProgress,
  type RawMessageQuery,
} from "./logs";

describe("logs bridge", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    listenMock.mockReset();
  });

  it("forwards log invoke commands with typed payloads", async () => {
    invokeMock.mockResolvedValue(undefined);

    const rawRequest: RawMessageQuery = {
      entry_id: "entry-1",
      cursor: null,
      start_usec: 100,
      end_usec: 200,
      message_types: ["ATTITUDE"],
      text: "gps",
      field_filters: [{ field: "Fix", value_text: "3" }],
      limit: 50,
      include_detail: true,
      include_hex: false,
    };
    const chartRequest: ChartSeriesRequest = {
      entry_id: "entry-1",
      selectors: [{ message_type: "ATTITUDE", field: "Roll", label: "Roll", unit: "deg" }],
      start_usec: 100,
      end_usec: 200,
      max_points: 250,
    };
    const flightPathRequest: FlightPathQuery = {
      entry_id: "entry-1",
      start_usec: 100,
      end_usec: 200,
      max_points: 25,
    };
    const exportRequest: LogExportRequest = {
      entry_id: "entry-1",
      instance_id: "export-1",
      format: "csv",
      destination_path: "/tmp/export.csv",
      start_usec: 100,
      end_usec: 200,
      message_types: ["ATTITUDE"],
      text: "roll",
      field_filters: [{ field: "Roll", value_text: "1.2" }],
    };

    await openLog("/tmp/flight.tlog");
    await queryLogMessages("ATTITUDE", 1, 2, 3);
    await getLogSummary();
    await closeLog();
    await listLogFormatAdapters();
    await getLogLibraryCatalog();
    await refreshLogLibrary();
    await registerLogLibraryEntry("/tmp/import.tlog");
    await registerLogLibraryEntryFromPicker();
    await removeLogLibraryEntry("entry-1");
    await relinkLogLibraryEntry("entry-1", "/tmp/relinked.tlog");
    await reindexLogLibraryEntry("entry-1");
    await cancelLogLibraryOperation();
    await queryRawMessages(rawRequest);
    await queryChartSeries(chartRequest);
    await queryFlightPath(flightPathRequest);
    await exportLog(exportRequest);
    await getFlightSummary();
    await exportLogCsv("/tmp/export.csv", 11, 22);

    expect(invokeMock).toHaveBeenNthCalledWith(1, "log_open", { path: "/tmp/flight.tlog" });
    expect(invokeMock).toHaveBeenNthCalledWith(2, "log_query", {
      msgType: "ATTITUDE",
      startUsec: 1,
      endUsec: 2,
      maxPoints: 3,
    });
    expect(invokeMock).toHaveBeenNthCalledWith(3, "log_get_summary");
    expect(invokeMock).toHaveBeenNthCalledWith(4, "log_close");
    expect(invokeMock).toHaveBeenNthCalledWith(5, "log_format_adapters");
    expect(invokeMock).toHaveBeenNthCalledWith(6, "log_library_list");
    expect(invokeMock).toHaveBeenNthCalledWith(7, "log_library_list");
    expect(invokeMock).toHaveBeenNthCalledWith(8, "log_library_register", { path: "/tmp/import.tlog" });
    expect(invokeMock).toHaveBeenNthCalledWith(9, "log_library_register_open_file");
    expect(invokeMock).toHaveBeenNthCalledWith(10, "log_library_remove", { entryId: "entry-1" });
    expect(invokeMock).toHaveBeenNthCalledWith(11, "log_library_relink", {
      entryId: "entry-1",
      path: "/tmp/relinked.tlog",
    });
    expect(invokeMock).toHaveBeenNthCalledWith(12, "log_library_reindex", { entryId: "entry-1" });
    expect(invokeMock).toHaveBeenNthCalledWith(13, "log_library_cancel");
    expect(invokeMock).toHaveBeenNthCalledWith(14, "log_raw_messages_query", { request: rawRequest });
    expect(invokeMock).toHaveBeenNthCalledWith(15, "log_chart_series_query", { request: chartRequest });
    expect(invokeMock).toHaveBeenNthCalledWith(16, "log_get_flight_path", {
      entryId: "entry-1",
      startUsec: 100,
      endUsec: 200,
      maxPoints: 25,
    });
    expect(invokeMock).toHaveBeenNthCalledWith(17, "log_export", { request: exportRequest });
    expect(invokeMock).toHaveBeenNthCalledWith(18, "log_get_flight_summary");
    expect(invokeMock).toHaveBeenNthCalledWith(19, "log_export_csv", {
      path: "/tmp/export.csv",
      startUsec: 11,
      endUsec: 22,
    });
  });

  it("unwraps log progress event payloads", async () => {
    const progress: LogProgress = {
      operation_id: "log_export",
      phase: "completed",
      completed_items: 2,
      total_items: 2,
      percent: 100,
      entry_id: "entry-1",
      instance_id: "export-1",
      message: "done",
    };
    const unlisten = vi.fn();
    const cb = vi.fn();

    listenMock.mockImplementation(async (_event, handler) => {
      handler({ payload: progress });
      return unlisten;
    });

    const dispose = await subscribeLogProgress(cb);

    expect(listenMock).toHaveBeenCalledWith("log://progress", expect.any(Function));
    expect(cb).toHaveBeenCalledWith(progress);
    expect(dispose).toBe(unlisten);
  });
});
