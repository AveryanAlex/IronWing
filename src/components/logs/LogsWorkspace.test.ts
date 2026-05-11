// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writable } from "svelte/store";

import type { ChartSeriesSelector, LogLibraryCatalog, LogLibraryEntry } from "../../logs";
import type { LogsWorkspaceState, LogsWorkspaceStore } from "../../lib/stores/logs-workspace";
import type { RecordingSettings, RecordingStatus } from "../../recording";
import type { LogRecordingFileIo } from "./log-recording-file-io";
import type { LogsWorkspaceMapHandoff } from "./logs-workspace-types";
import LogsWorkspace from "./LogsWorkspace.svelte";

function createEntry(entryId: string, status: LogLibraryEntry["status"], path = `/logs/${entryId}.tlog`): LogLibraryEntry {
  const available = status !== "missing";
  return {
    entry_id: entryId,
    status,
    imported_at_unix_msec: 1778246400000,
    source: {
      original_path: path,
      fingerprint: { size_bytes: 1024, modified_unix_msec: 1778246300000 },
      status: available
        ? { kind: status === "stale" ? "stale" : "available", current_fingerprint: { size_bytes: 1024, modified_unix_msec: 1778246300000 } }
        : { kind: "missing" },
    },
    metadata: {
      display_name: `${entryId}.tlog`,
      format: "tlog",
      start_usec: 1_000_000,
      end_usec: 61_000_000,
      duration_secs: 60,
      total_messages: 2400,
      message_types: { HEARTBEAT: 60 },
      vehicle_type: "quadrotor",
      autopilot: "ardupilotmega",
    },
    diagnostics: status === "corrupt"
      ? [{
          severity: "error",
          source: "parse",
          code: "invalid_crc",
          message: "failed to decode MAVLink frame: CRC mismatch",
          recoverable: false,
          timestamp_usec: 2_000_000,
        }]
      : status === "missing"
        ? [{
            severity: "warning",
            source: "file_system",
            code: "path_missing",
            message: "referenced log file is missing and must be relinked or removed",
            recoverable: true,
            timestamp_usec: null,
          }]
        : [],
    index: status === "corrupt"
      ? null
      : {
          index_id: `idx-${entryId}`,
          relative_path: `logs/indexes/${entryId}.json`,
          format: "tlog",
          index_version: 1,
          built_at_unix_msec: 1778246410000,
          message_count: 2399,
          covers_start_usec: 1_000_000,
          covers_end_usec: 61_000_000,
        },
  };
}

function createCatalog(entries: LogLibraryEntry[]): LogLibraryCatalog {
  return {
    schema_version: 1,
    storage: {
      kind: "app_data",
      catalog_path: "/app/logs/catalog.json",
      indexes_dir: "/app/logs/indexes",
      recordings_dir: "/app/logs/recordings",
    },
    migrated_from_schema_version: null,
    entries,
  };
}

function createState(overrides: Partial<LogsWorkspaceState> = {}): LogsWorkspaceState {
  const settings: RecordingSettings = {
    auto_record_on_connect: false,
    auto_record_directory: "/recordings",
    filename_template: "YYYY-MM-DD.tlog",
    add_completed_recordings_to_library: true,
  };
  const catalog = createCatalog([createEntry("ready", "ready"), createEntry("missing", "missing")]);
  const recordingStatus: RecordingStatus = { kind: "idle" };

  return {
    hydrated: true,
    phase: "ready",
    lastError: null,
    effectiveSource: "live",
    sessionEnvelope: null,
    operationProgress: null,
    library: {
      phase: "ready",
      error: null,
      catalog,
      selectedEntryId: "ready",
      loadedEntryId: null,
    },
    playback: {
      state: {
        status: "ready",
        entry_id: "ready",
        operation_id: null,
        cursor_usec: 2_000_000,
        start_usec: 1_000_000,
        end_usec: 61_000_000,
        duration_secs: 60,
        speed: 1,
        available_speeds: [0.5, 1, 2, 4, 8, 16],
        barrier_ready: true,
        readonly: true,
        diagnostic: null,
      },
      envelope: null,
      bootstrapping: false,
      error: null,
      openedSummary: {
        file_name: "ready.tlog",
        start_usec: 1_000_000,
        end_usec: 61_000_000,
        duration_secs: 60,
        total_entries: 2400,
        message_types: { HEARTBEAT: 60 },
        log_type: "tlog",
      },
    },
    recording: {
      statusPhase: "ready",
      settingsPhase: "ready",
      error: null,
      status: recordingStatus,
      settings,
    },
    rawBrowser: {
      phase: "idle",
      error: null,
      request: null,
      page: null,
      filters: {
        startUsecInput: "",
        endUsecInput: "",
        messageTypesInput: "",
        textInput: "",
        fieldFilters: [{ field: "", value_text: null }],
        limit: 25,
        includeDetail: true,
        includeHex: true,
      },
      selectedSequence: null,
      savedFiltersByEntryId: {},
      savedSelectionByEntryId: {},
    },
      charts: {
        phase: "idle",
        error: null,
        request: null,
        page: null,
        activeGroupKey: null,
        hoveredCursorUsec: null,
        selectedRange: null,
        exportDestinationPath: "",
      },
    export: {
      origin: null,
      phase: "idle",
      error: null,
      request: null,
      progress: null,
      result: null,
    },
    ...overrides,
  };
}

function createStore(state = createState()): LogsWorkspaceStore {
  const backing = writable(state);

  const setChartState = (recipe: (state: LogsWorkspaceState) => LogsWorkspaceState) => {
    backing.update(recipe);
  };

  return {
    subscribe: backing.subscribe,
    initialize: vi.fn(async () => undefined),
    refreshLibrary: vi.fn(async () => undefined),
    selectEntry: vi.fn((entryId: string | null) => {
      setChartState((current) => ({
        ...current,
        library: {
          ...current.library,
          selectedEntryId: entryId,
        },
      }));
    }),
    setChartGroup: vi.fn((groupKey: string | null) => {
      setChartState((current) => ({
        ...current,
        charts: {
          ...current.charts,
          activeGroupKey: groupKey,
          selectedRange: null,
        },
      }));
    }),
    setChartCursor: vi.fn((cursorUsec: number | null) => {
      setChartState((current) => ({
        ...current,
        charts: {
          ...current.charts,
          hoveredCursorUsec: cursorUsec,
        },
      }));
    }),
    setChartRange: vi.fn((startUsec: number | null, endUsec: number | null) => {
      setChartState((current) => ({
        ...current,
        charts: {
          ...current.charts,
          selectedRange: startUsec == null || endUsec == null
            ? null
            : { startUsec: Math.min(startUsec, endUsec), endUsec: Math.max(startUsec, endUsec) },
        },
      }));
    }),
    setChartExportDestination: vi.fn((path: string) => {
      setChartState((current) => ({
        ...current,
        charts: {
          ...current.charts,
          exportDestinationPath: path,
        },
      }));
    }),
    setRawFilters: vi.fn((filters) => {
      setChartState((current) => ({
        ...current,
        rawBrowser: {
          ...current.rawBrowser,
          filters,
        },
      }));
    }),
    selectRawMessage: vi.fn((sequence: number | null) => {
      setChartState((current) => ({
        ...current,
        rawBrowser: {
          ...current.rawBrowser,
          selectedSequence: sequence,
        },
      }));
    }),
    registerEntry: vi.fn(async () => null),
    registerEntryFromPicker: vi.fn(async () => null),
    removeEntry: vi.fn(async () => null),
    relinkEntry: vi.fn(async () => null),
    reindexEntry: vi.fn(async () => null),
    cancelOperation: vi.fn(async () => true),
    ensurePlaybackReady: vi.fn(async () => null),
    playSelected: vi.fn(async () => null),
    pause: vi.fn(async () => null),
    seek: vi.fn(async () => null),
    setSpeed: vi.fn(async () => null),
    stopReplay: vi.fn(async () => null),
    runRawQuery: vi.fn(async () => null),
    runChartQuery: vi.fn(async (request: {
      selectors: ChartSeriesSelector[];
      start_usec: number | null;
      end_usec: number | null;
      max_points: number | null;
    }) => {
      setChartState((current) => ({
        ...current,
        charts: {
          ...current.charts,
          phase: "ready",
          request: {
            entry_id: current.library.selectedEntryId ?? "ready",
            selectors: request.selectors,
            start_usec: request.start_usec,
            end_usec: request.end_usec,
            max_points: request.max_points,
          },
          page: {
            entry_id: current.library.selectedEntryId ?? "ready",
            start_usec: request.start_usec,
            end_usec: request.end_usec,
            series: request.selectors.map((selector: ChartSeriesSelector) => ({
              selector,
              points: [
                { timestamp_usec: request.start_usec ?? 1_000_000, value: 1 },
                { timestamp_usec: request.end_usec ?? 61_000_000, value: 2 },
              ],
            })),
            diagnostics: [],
          },
        },
      }));
      return null;
    }),
    runExport: vi.fn(async () => null),
    refreshRecordingStatus: vi.fn(async () => undefined),
    refreshRecordingSettings: vi.fn(async () => undefined),
    saveSettings: vi.fn(async () => null),
    startRecordingAt: vi.fn(async () => null),
    stopActiveRecording: vi.fn(async () => null),
    reset: vi.fn(),
  } satisfies LogsWorkspaceStore;
}

function createRecordingFileIo(overrides: Partial<LogRecordingFileIo> = {}): LogRecordingFileIo {
  return {
    supportsManualPicker: vi.fn(() => false),
    pickManualRecordingPath: vi.fn(async () => null),
    ...overrides,
  } satisfies LogRecordingFileIo;
}

describe("LogsWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the library list and dispatches select, register, relink, reindex, and remove actions", async () => {
    const store = createStore();

    render(LogsWorkspace, {
      props: { store },
    });

    await waitFor(() => {
      expect(store.initialize).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByTestId("logs-library-list")).toBeTruthy();
    expect(screen.getByText("ready.tlog")).toBeTruthy();
    expect(screen.getByText("missing.tlog")).toBeTruthy();

    await fireEvent.click(screen.getByTestId("logs-entry-missing"));
    expect(store.selectEntry).toHaveBeenCalledWith("missing");

    await fireEvent.input(screen.getByTestId("logs-import-path-input"), {
      target: { value: "/imports/new-flight.tlog" },
    });
    await fireEvent.click(screen.getByTestId("logs-import-button"));
    expect(store.registerEntry).toHaveBeenCalledWith("/imports/new-flight.tlog");

    await fireEvent.click(screen.getByTestId("logs-import-picker-button"));
    expect(store.registerEntryFromPicker).toHaveBeenCalledTimes(1);

    await fireEvent.input(screen.getByTestId("logs-relink-path-input"), {
      target: { value: "/relinked/ready.tlog" },
    });
    await fireEvent.click(screen.getByTestId("logs-relink-button"));
    expect(store.relinkEntry).toHaveBeenCalledWith("missing", "/relinked/ready.tlog");

    await fireEvent.click(screen.getByTestId("logs-reindex-button"));
    expect(store.reindexEntry).toHaveBeenCalledWith("missing");

    await fireEvent.click(screen.getByTestId("logs-remove-button"));
    expect(store.removeEntry).toHaveBeenCalledWith("missing");
  });

  it("dispatches refresh and cancel controls from the workspace chrome", async () => {
    const store = createStore(createState({
      operationProgress: {
        operation_id: "log_library_reindex",
        phase: "indexing",
        completed_items: 1,
        total_items: 4,
        percent: 25,
        entry_id: "missing",
        instance_id: null,
        message: "indexing referenced logs",
      },
    }));

    render(LogsWorkspace, {
      props: { store },
    });

    await waitFor(() => {
      expect(store.initialize).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();

    await fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(store.refreshLibrary).toHaveBeenCalledTimes(1);

    await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(store.cancelOperation).toHaveBeenCalledTimes(1);
  });

  it("announces workspace failures as alerts", async () => {
    const store = createStore(createState({
      lastError: "failed to refresh log library",
    }));

    render(LogsWorkspace, {
      props: { store },
    });

    await waitFor(() => {
      expect(store.initialize).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByRole("alert").textContent).toContain("failed to refresh log library");
  });

  it("dispatches replay, seek, speed, recording, and map handoff actions", async () => {
    const store = createStore(createState({ effectiveSource: "playback" }));
    const handoff = vi.fn<(payload: LogsWorkspaceMapHandoff) => void>();

    render(LogsWorkspace, {
      props: {
        store,
        onMapHandoff: handoff,
      },
    });

    await fireEvent.click(screen.getByTestId("logs-prepare-playback"));
    expect(store.ensurePlaybackReady).toHaveBeenCalledTimes(1);

    await fireEvent.click(screen.getByTestId("logs-play-button"));
    expect(store.playSelected).toHaveBeenCalledTimes(1);

    await fireEvent.click(screen.getByTestId("logs-pause-button"));
    expect(store.pause).toHaveBeenCalledTimes(1);

    await fireEvent.change(screen.getByTestId("logs-timeline-range"), {
      target: { value: "5000000" },
    });
    expect(store.seek).toHaveBeenCalledWith(5_000_000);

    await fireEvent.change(screen.getByTestId("logs-speed-select"), {
      target: { value: "4" },
    });
    expect(store.setSpeed).toHaveBeenCalledWith(4);

    await fireEvent.click(screen.getByTestId("logs-stop-button"));
    expect(store.stopReplay).toHaveBeenCalledTimes(1);

    await fireEvent.click(screen.getByTestId("logs-auto-record-toggle"));
    expect(store.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ auto_record_on_connect: true }));

    await fireEvent.click(screen.getByTestId("logs-map-path-button"));
    expect(handoff).toHaveBeenCalledWith({
      kind: "path",
      entryId: "ready",
      startUsec: 1_000_000,
      endUsec: 61_000_000,
    });

    await fireEvent.click(screen.getByTestId("logs-map-marker-button"));
    expect(handoff).toHaveBeenCalledWith({
      kind: "replay_marker",
      entryId: "ready",
      cursorUsec: 2_000_000,
    });
  });

  it("starts manual recording through the picker-aware branch and leaves auto-record disabled by default", async () => {
    const store = createStore();
    const recordingFileIo = createRecordingFileIo({
      supportsManualPicker: vi.fn(() => true),
      pickManualRecordingPath: vi.fn(async () => "/picked/manual-capture-01.tlog"),
    });

    render(LogsWorkspace, {
      props: { store, recordingFileIo },
    });

    expect((screen.getByTestId("logs-auto-record-toggle") as HTMLInputElement).checked).toBe(false);
    expect(screen.getByTestId("logs-auto-record-value").textContent).toContain("disabled");
    expect(screen.getByTestId("logs-recording-path-help").textContent).toContain("save picker");

    await fireEvent.click(screen.getByTestId("logs-recording-toggle"));

    expect(recordingFileIo.pickManualRecordingPath).toHaveBeenCalledWith({
      suggestedPath: "/recordings/manual-capture.tlog",
    });
    expect(store.startRecordingAt).toHaveBeenCalledWith("/picked/manual-capture-01.tlog");
    expect(screen.getByTestId("logs-recording-destination-value").textContent).toContain("/picked/manual-capture-01.tlog");
  });

  it("preserves Windows separators in the default manual recording path", async () => {
    const store = createStore(createState({
      recording: {
        statusPhase: "ready",
        settingsPhase: "ready",
        error: null,
        status: { kind: "idle" },
        settings: {
          auto_record_on_connect: false,
          auto_record_directory: "C:\\logs\\",
          filename_template: "YYYY-MM-DD.tlog",
          add_completed_recordings_to_library: true,
        },
      },
    }));
    const recordingFileIo = createRecordingFileIo({
      supportsManualPicker: vi.fn(() => true),
      pickManualRecordingPath: vi.fn(async () => "C:\\picked\\manual-capture-01.tlog"),
    });

    render(LogsWorkspace, {
      props: { store, recordingFileIo },
    });

    expect(screen.getByTestId("logs-recording-destination-value").textContent).toContain("C:\\logs\\manual-capture.tlog");

    await fireEvent.click(screen.getByTestId("logs-recording-toggle"));

    expect(recordingFileIo.pickManualRecordingPath).toHaveBeenCalledWith({
      suggestedPath: "C:\\logs\\manual-capture.tlog",
    });
  });

  it("stops an active recording and surfaces truthful recording facts", async () => {
    const store = createStore(createState({
      effectiveSource: "playback",
      recording: {
        statusPhase: "ready",
        settingsPhase: "ready",
        error: null,
        status: {
          kind: "recording",
          operation_id: "recording_start",
          mode: "manual",
          file_name: "capture-01.tlog",
          destination_path: "/recordings/capture-01.tlog",
          bytes_written: 1536,
          started_at_unix_msec: 1778246400000,
        },
        settings: {
          auto_record_on_connect: false,
          auto_record_directory: "/recordings",
          filename_template: "YYYY-MM-DD.tlog",
          add_completed_recordings_to_library: true,
        },
      },
    }));

    render(LogsWorkspace, {
      props: { store },
    });

    expect(screen.getByTestId("logs-recording-file-value").textContent).toContain("capture-01.tlog");
    expect(screen.getByTestId("logs-recording-bytes-value").textContent).toContain("1.5 KB");
    expect(screen.getByTestId("logs-recording-replay-overlap").textContent).toContain("Replay is still active");

    await fireEvent.click(screen.getByTestId("logs-recording-toggle"));
    expect(store.stopActiveRecording).toHaveBeenCalledTimes(1);
  });

  it("renders truthful missing and corrupt states from store data", async () => {
    const corruptEntry = createEntry("corrupt", "corrupt", "/logs/corrupt.bin");
    const state = createState({
      library: {
        phase: "ready",
        error: null,
        catalog: createCatalog([corruptEntry]),
        selectedEntryId: "corrupt",
        loadedEntryId: null,
      },
      playback: {
        state: {
          status: "idle",
          entry_id: null,
          operation_id: null,
          cursor_usec: null,
          start_usec: null,
          end_usec: null,
          duration_secs: null,
          speed: 1,
          available_speeds: [0.5, 1, 2, 4, 8, 16],
          barrier_ready: false,
          readonly: true,
          diagnostic: null,
        },
        envelope: null,
        bootstrapping: false,
        error: null,
        openedSummary: null,
      },
    });
    const store = createStore(state);

    render(LogsWorkspace, {
      props: { store },
    });

    expect(screen.getByTestId("logs-selected-status-pill").textContent).toContain("corrupt");
    expect(screen.getByTestId("logs-selected-message").textContent).toContain("corrupt");
    expect(screen.getByText("failed to decode MAVLink frame: CRC mismatch")).toBeTruthy();
    expect(screen.getByTestId("logs-prepare-playback")).toHaveProperty("disabled", true);
    expect(screen.getByTestId("logs-play-button")).toHaveProperty("disabled", true);
  });

  it("keeps replay seek and map handoff bound to the loaded playback entry when selection drifts", async () => {
    const readyEntry = createEntry("ready", "ready");
    const otherEntry = createEntry("other", "ready", "/logs/other.tlog");
    otherEntry.metadata.start_usec = 10_000_000;
    otherEntry.metadata.end_usec = 20_000_000;

    const store = createStore(createState({
      effectiveSource: "playback",
      library: {
        phase: "ready",
        error: null,
        catalog: createCatalog([readyEntry, otherEntry]),
        selectedEntryId: "other",
        loadedEntryId: "ready",
      },
      playback: {
        state: {
          status: "playing",
          entry_id: "ready",
          operation_id: null,
          cursor_usec: 5_000_000,
          start_usec: 1_000_000,
          end_usec: 61_000_000,
          duration_secs: 60,
          speed: 1,
          available_speeds: [0.5, 1, 2, 4, 8, 16],
          barrier_ready: true,
          readonly: true,
          diagnostic: null,
        },
        envelope: null,
        bootstrapping: false,
        error: null,
        openedSummary: {
          file_name: "ready.tlog",
          start_usec: 1_000_000,
          end_usec: 61_000_000,
          duration_secs: 60,
          total_entries: 2400,
          message_types: { HEARTBEAT: 60 },
          log_type: "tlog",
        },
      },
    }));
    const handoff = vi.fn<(payload: LogsWorkspaceMapHandoff) => void>();

    render(LogsWorkspace, {
      props: { store, onMapHandoff: handoff },
    });

    expect(screen.getByTestId("logs-timeline-range")).toHaveProperty("disabled", false);
    await fireEvent.change(screen.getByTestId("logs-timeline-range"), {
      target: { value: "7000000" },
    });
    expect(store.seek).toHaveBeenCalledWith(7_000_000);

    await fireEvent.click(screen.getByTestId("logs-map-path-button"));
    expect(handoff).toHaveBeenCalledWith({
      kind: "path",
      entryId: "ready",
      startUsec: 1_000_000,
      endUsec: 61_000_000,
    });

    await fireEvent.click(screen.getByTestId("logs-map-marker-button"));
    expect(handoff).toHaveBeenCalledWith({
      kind: "replay_marker",
      entryId: "ready",
      cursorUsec: 5_000_000,
    });
  });

  it("dispatches selected-range chart export with the active log and bounded message filters", async () => {
    const readyEntry = createEntry("ready", "ready");
    readyEntry.metadata.message_types = {
      ATTITUDE: 30,
      VFR_HUD: 30,
    };

    const store = createStore(createState({
      library: {
        phase: "ready",
        error: null,
        catalog: createCatalog([readyEntry]),
        selectedEntryId: "ready",
        loadedEntryId: "ready",
      },
    }));

    render(LogsWorkspace, {
      props: { store },
    });

    const plot = await screen.findByTestId("logs-chart-plot-roll");
    Object.defineProperty(plot, "getBoundingClientRect", {
      value: () => ({ left: 0, width: 200, top: 0, height: 120, right: 200, bottom: 120, x: 0, y: 0, toJSON: () => ({}) }),
    });

    await fireEvent.pointerDown(plot, { clientX: 40 });
    await fireEvent.pointerMove(window, { clientX: 140 });
    await fireEvent.pointerUp(window, { clientX: 140 });

    await fireEvent.input(screen.getByTestId("logs-chart-export-path"), {
      target: { value: "/tmp/range-export.csv" },
    });
    await fireEvent.click(screen.getByTestId("logs-chart-export-button"));

    expect(store.runExport).toHaveBeenCalledWith({
      destination_path: "/tmp/range-export.csv",
      format: "csv",
      start_usec: 13_000_000,
      end_usec: 43_000_000,
      message_types: ["ATTITUDE"],
      text: null,
      field_filters: [],
    }, { origin: "chart" });
  });

  it("disables replay-marker actions and shows a truthful idle label after stop clears the local replay session", async () => {
    const store = createStore(createState({
      effectiveSource: "playback",
      library: {
        phase: "ready",
        error: null,
        catalog: createCatalog([createEntry("ready", "ready")]),
        selectedEntryId: "ready",
        loadedEntryId: null,
      },
      playback: {
        state: {
          status: "idle",
          entry_id: null,
          operation_id: null,
          cursor_usec: null,
          start_usec: null,
          end_usec: null,
          duration_secs: null,
          speed: 1,
          available_speeds: [0.5, 1, 2, 4, 8, 16],
          barrier_ready: false,
          readonly: true,
          diagnostic: null,
        },
        envelope: null,
        bootstrapping: false,
        error: null,
        openedSummary: null,
      },
    }));

    render(LogsWorkspace, {
      props: { store },
    });

    expect(screen.getByTestId("logs-playback-label").textContent).toContain("Stopping replay and restoring live data");
    expect(screen.getByTestId("logs-map-marker-button")).toHaveProperty("disabled", true);
    expect(screen.getByTestId("logs-stop-button")).toHaveProperty("disabled", true);
  });
});
