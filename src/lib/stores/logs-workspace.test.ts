import { get, writable } from "svelte/store";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ChartSeriesPage,
  ChartSeriesRequest,
  LogDiagnostic,
  LogExportRequest,
  LogExportResult,
  LogLibraryCatalog,
  LogLibraryEntry,
  LogSummary,
  LogProgress,
  RawMessagePage,
  RawMessageQuery,
} from "../../logs";
import type { PlaybackSeekResult, PlaybackStateSnapshot, ReplayState } from "../../playback";
import type { RecordingSettings, RecordingSettingsResult, RecordingStatus } from "../../recording";
import type { OpenSessionSnapshot, SessionEvent, SessionEnvelope, SourceKind } from "../../session";
import { missingDomainValue } from "../domain-status";
import { createLogsWorkspaceStore, type LogsWorkspaceService } from "./logs-workspace";
import type { SessionStoreState } from "./session";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, resolve, reject };
}

function createEnvelope(source_kind: SourceKind, seek_epoch = 0, reset_revision = 0): SessionEnvelope {
  return {
    session_id: source_kind === "live" ? "live-session" : "playback-session",
    source_kind,
    seek_epoch,
    reset_revision,
  };
}

function createSessionState(overrides: Partial<SessionStoreState> = {}): SessionStoreState {
  return {
    hydrated: true,
    lastPhase: "ready",
    lastError: null,
    activeEnvelope: createEnvelope("live"),
    activeSource: "live",
    sessionDomain: missingDomainValue("bootstrap"),
    telemetryDomain: missingDomainValue("bootstrap"),
    support: missingDomainValue("bootstrap"),
    sensorHealth: missingDomainValue("bootstrap"),
    configurationFacts: missingDomainValue("bootstrap"),
    calibration: missingDomainValue("bootstrap"),
    guided: missingDomainValue("bootstrap"),
    statusText: missingDomainValue("bootstrap"),
    bootstrap: {
      missionState: null,
      paramStore: null,
      paramProgress: null,
      playbackCursorUsec: null,
    },
    connectionForm: {
      mode: "tcp",
      udpBind: "0.0.0.0:14550",
      tcpAddress: "127.0.0.1:5760",
      serialPort: "",
      baud: 57600,
      selectedBtDevice: "",
      takeoffAlt: "10",
      followVehicle: true,
    },
    transportDescriptors: [],
    serialPorts: [],
    availableModes: [],
    btDevices: [],
    btScanning: false,
    optimisticConnection: null,
    ...overrides,
  };
}

function createEntry(entry_id: string, status: LogLibraryEntry["status"], path = `/logs/${entry_id}.tlog`): LogLibraryEntry {
  const available = status !== "missing";
  return {
    entry_id,
    status,
    imported_at_unix_msec: 1,
    source: {
      original_path: path,
      fingerprint: { size_bytes: 10, modified_unix_msec: 2 },
      status: available
        ? { kind: status === "stale" ? "stale" : "available", current_fingerprint: { size_bytes: 10, modified_unix_msec: 2 } }
        : { kind: "missing" },
    },
    metadata: {
      display_name: `${entry_id}.tlog`,
      format: "tlog",
      start_usec: 100,
      end_usec: 500,
      duration_secs: 0.4,
      total_messages: 4,
      message_types: { HEARTBEAT: 4 },
      vehicle_type: "quadrotor",
      autopilot: "ardupilotmega",
    },
    diagnostics: [],
    index: status === "corrupt"
      ? null
      : {
          index_id: `idx-${entry_id}`,
          relative_path: `logs/indexes/${entry_id}.json`,
          format: "tlog",
          index_version: 1,
          built_at_unix_msec: 3,
          message_count: 4,
          covers_start_usec: 100,
          covers_end_usec: 500,
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

function findCatalogEntry(catalog: LogLibraryCatalog | null, entryId: string): LogLibraryEntry | null {
  return catalog?.entries.find((entry) => entry.entry_id === entryId) ?? null;
}

function idlePlaybackState(): PlaybackStateSnapshot {
  return {
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
  };
}

function createSessionHarness() {
  const store = writable(createSessionState());

  return {
    subscribe: store.subscribe,
    initialize: vi.fn().mockResolvedValue(undefined),
    bootstrapSource: vi.fn<(
      sourceKind?: SourceKind,
    ) => Promise<OpenSessionSnapshot | null>>(async (sourceKind = "live") => {
      store.update((state) => ({
        ...state,
        activeEnvelope: sourceKind === "live"
          ? createEnvelope("live", 0, 1)
          : createEnvelope("playback", 0, 1),
        activeSource: sourceKind,
        bootstrap: {
          ...state.bootstrap,
          playbackCursorUsec: sourceKind === "playback" ? 150 : null,
        },
      }));
      return null satisfies OpenSessionSnapshot | null;
    }),
    emitPlayback(cursor_usec = 150, seek_epoch = 0) {
      store.set(createSessionState({
        activeEnvelope: createEnvelope("playback", seek_epoch, 1),
        activeSource: "playback",
        bootstrap: {
          missionState: null,
          paramStore: null,
          paramProgress: null,
          playbackCursorUsec: cursor_usec,
        },
      }));
    },
    emitLive() {
      store.set(createSessionState({
        activeEnvelope: createEnvelope("live", 0, 2),
        activeSource: "live",
      }));
    },
  };
}

function createService(catalog = createCatalog([createEntry("ready", "ready")])) {
  let progressHandler: ((progress: LogProgress) => void) | null = null;
  let playbackHandler: ((event: SessionEvent<PlaybackStateSnapshot>) => void) | null = null;
  let currentCatalog = structuredClone(catalog);
  let recordingStatus: RecordingStatus = { kind: "idle" };
  let recordingSettings: RecordingSettings = {
    auto_record_on_connect: false,
    auto_record_directory: "/recordings",
    filename_template: "YYYY-MM-DD.tlog",
    add_completed_recordings_to_library: true,
  };

  const relinkDiagnostic = {
    severity: "warning",
    source: "catalog",
    code: "relink_requires_reindex",
    message: "reindex required",
    recoverable: true,
    timestamp_usec: null,
  } satisfies LogDiagnostic;

  const openSummary = {
    file_name: "ready.tlog",
    start_usec: 100,
    end_usec: 500,
    duration_secs: 0.4,
    total_entries: 4,
    message_types: { HEARTBEAT: 4 },
    log_type: "tlog",
  } satisfies LogSummary;

  function replayState(overrides: Partial<ReplayState>): ReplayState {
    return {
      ...idlePlaybackState(),
      ...overrides,
    };
  }

  const service: LogsWorkspaceService & {
    emitProgress(progress: LogProgress): void;
    emitPlayback(event: SessionEvent<PlaybackStateSnapshot>): void;
    setRecordingStatus(status: RecordingStatus): void;
    setCatalog(catalog: LogLibraryCatalog): void;
  } = {
    listLibrary: vi.fn(async () => structuredClone(currentCatalog)),
    registerEntry: vi.fn(async (path: string) => createEntry("registered", "ready", path)),
    registerEntryFromPicker: vi.fn(async () => createEntry("picked", "ready", "/mock/picker/picked-flight.tlog")),
    removeEntry: vi.fn(async (entryId: string) => {
      currentCatalog.entries = currentCatalog.entries.filter((entry) => entry.entry_id !== entryId);
      return structuredClone(currentCatalog);
    }),
    relinkEntry: vi.fn<LogsWorkspaceService["relinkEntry"]>(async (entryId: string, path: string) => ({
      ...createEntry(entryId, "stale", path),
      diagnostics: [relinkDiagnostic],
    } satisfies LogLibraryEntry)),
    reindexEntry: vi.fn(async (entryId: string) => createEntry(entryId, "ready")),
    cancelOperation: vi.fn(async () => true),
    openLog: vi.fn<LogsWorkspaceService["openLog"]>(async () => openSummary),
    closeLog: vi.fn(async () => undefined),
    subscribeProgress: vi.fn(async (cb: (progress: LogProgress) => void) => {
      progressHandler = cb;
      return () => {
        progressHandler = null;
      };
    }),
    subscribePlayback: vi.fn(async (cb: (event: SessionEvent<PlaybackStateSnapshot>) => void) => {
      playbackHandler = cb;
      return () => {
        playbackHandler = null;
      };
    }),
    play: vi.fn<LogsWorkspaceService["play"]>(async () => replayState({
      status: "playing",
      entry_id: "ready",
      operation_id: "replay_play",
      cursor_usec: 150,
      start_usec: 100,
      end_usec: 500,
      duration_secs: 0.4,
      barrier_ready: true,
    })),
    pause: vi.fn<LogsWorkspaceService["pause"]>(async () => replayState({
      status: "paused",
      entry_id: "ready",
      operation_id: "replay_pause",
      cursor_usec: 200,
      start_usec: 100,
      end_usec: 500,
      duration_secs: 0.4,
      barrier_ready: true,
    })),
    seek: vi.fn(async (cursorUsec: number | null) => ({
      envelope: createEnvelope("playback", 1, 1),
      cursor_usec: cursorUsec,
    } satisfies PlaybackSeekResult)),
    setSpeed: vi.fn<LogsWorkspaceService["setSpeed"]>(async (speed: number) => replayState({
      status: "paused",
      entry_id: "ready",
      operation_id: "replay_set_speed",
      cursor_usec: 150,
      start_usec: 100,
      end_usec: 500,
      duration_secs: 0.4,
      speed,
      barrier_ready: true,
    })),
    stop: vi.fn(async () => idlePlaybackState()),
    queryRaw: vi.fn(async (request: RawMessageQuery) => ({
      entry_id: request.entry_id,
      items: [],
      next_cursor: null,
      total_available: 0,
    } satisfies RawMessagePage)),
    queryCharts: vi.fn(async (request: ChartSeriesRequest) => ({
      entry_id: request.entry_id,
      start_usec: request.start_usec,
      end_usec: request.end_usec,
      series: [],
      diagnostics: [],
    } satisfies ChartSeriesPage)),
    exportLog: vi.fn(async (request: LogExportRequest) => ({
      operation_id: "log_export",
      destination_path: request.destination_path,
      bytes_written: 42,
      rows_written: 4,
      diagnostics: [],
    } satisfies LogExportResult)),
    getRecordingStatus: vi.fn<LogsWorkspaceService["getRecordingStatus"]>(async () => structuredClone(recordingStatus)),
    getRecordingSettings: vi.fn(async () => ({
      operation_id: "recording_settings_read",
      settings: structuredClone(recordingSettings),
    } satisfies RecordingSettingsResult)),
    saveRecordingSettings: vi.fn(async (settings: RecordingSettings) => {
      recordingSettings = structuredClone(settings);
      return {
        operation_id: "recording_settings_write",
        settings: structuredClone(recordingSettings),
      } satisfies RecordingSettingsResult;
    }),
    startRecording: vi.fn(async () => "capture.tlog"),
    stopRecording: vi.fn(async () => undefined),
    formatError: vi.fn((error: unknown) => error instanceof Error ? error.message : String(error)),
    emitProgress(progress: LogProgress) {
      progressHandler?.(progress);
    },
    emitPlayback(event: SessionEvent<PlaybackStateSnapshot>) {
      playbackHandler?.(event);
    },
    setRecordingStatus(status: RecordingStatus) {
      recordingStatus = structuredClone(status);
    },
    setCatalog(nextCatalog: LogLibraryCatalog) {
      currentCatalog = structuredClone(nextCatalog);
    },
  };

  return service;
}

describe("logs workspace store", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("hydrates library, recording, and selection state on initialize", async () => {
    const sessionHarness = createSessionHarness();
    const service = createService(createCatalog([
      createEntry("ready-a", "ready"),
      createEntry("missing-a", "missing"),
    ]));
    const store = createLogsWorkspaceStore(sessionHarness, service);

    await store.initialize();

    const state = get(store);
    expect(state.hydrated).toBe(true);
    expect(state.library.selectedEntryId).toBe("ready-a");
    expect(state.library.catalog?.entries.map((entry) => entry.entry_id)).toEqual(["ready-a", "missing-a"]);
    expect(state.recording.status.kind).toBe("idle");
    expect(state.recording.settings?.auto_record_on_connect).toBe(false);
    expect(state.charts.selectedRange).toBeNull();
    expect(state.charts.exportDestinationPath).toBe("");
  });

  it("refreshes the library and resolves the selected entry when it disappears", async () => {
    const sessionHarness = createSessionHarness();
    const initialCatalog = createCatalog([
      createEntry("ready-a", "ready"),
      createEntry("missing-a", "missing"),
    ]);
    const refreshedCatalog = createCatalog([
      createEntry("ready-b", "ready"),
      createEntry("ready-c", "ready"),
    ]);
    const service = createService(initialCatalog);
    service.listLibrary = vi.fn()
      .mockResolvedValueOnce(structuredClone(initialCatalog))
      .mockResolvedValueOnce(structuredClone(refreshedCatalog));
    const store = createLogsWorkspaceStore(sessionHarness, service);

    await store.initialize();
    store.selectEntry("missing-a");

    await store.refreshLibrary();

    const state = get(store);
    expect(service.listLibrary).toHaveBeenCalledTimes(2);
    expect(state.library.phase).toBe("ready");
    expect(state.library.catalog?.entries.map((entry) => entry.entry_id)).toEqual(["ready-b", "ready-c"]);
    expect(state.library.selectedEntryId).toBe("ready-b");
  });

  it("forwards cancelOperation to the service", async () => {
    const sessionHarness = createSessionHarness();
    const service = createService(createCatalog([createEntry("ready-a", "ready")]));
    const store = createLogsWorkspaceStore(sessionHarness, service);

    await store.initialize();

    await expect(store.cancelOperation()).resolves.toBe(true);
    expect(service.cancelOperation).toHaveBeenCalledTimes(1);
  });

  it("registers a referenced log from the picker and keeps cancellation non-destructive", async () => {
    const sessionHarness = createSessionHarness();
    const service = createService(createCatalog([createEntry("ready-a", "ready")]));
    const store = createLogsWorkspaceStore(sessionHarness, service);

    await store.initialize();

    const picked = await store.registerEntryFromPicker();
    expect(picked?.entry_id).toBe("picked");
    expect(service.registerEntryFromPicker).toHaveBeenCalledTimes(1);
    expect(get(store).library.selectedEntryId).toBe("picked");
    expect(get(store).library.catalog?.entries.some((entry) => entry.entry_id === "picked")).toBe(true);

    service.registerEntryFromPicker = vi.fn(async () => null);
    const cancelled = await store.registerEntryFromPicker();
    expect(cancelled).toBeNull();
    expect(get(store).library.phase).toBe("ready");
    expect(get(store).library.catalog?.entries.some((entry) => entry.entry_id === "picked")).toBe(true);
  });

  it("restores saved RawMessages filters per selected log entry", async () => {
    const sessionHarness = createSessionHarness();
    const service = createService(createCatalog([
      createEntry("ready-a", "ready"),
      createEntry("ready-b", "ready"),
    ]));
    const store = createLogsWorkspaceStore(sessionHarness, service);

    await store.initialize();

    store.setRawFilters({
      startUsecInput: "100",
      endUsecInput: "250",
      messageTypesInput: "HEARTBEAT,ATTITUDE",
      textInput: "armed",
      fieldFilters: [{ field: "mode", value_text: "GUIDED" }],
      limit: 25,
      includeDetail: true,
      includeHex: false,
    });

    store.selectEntry("ready-b");
    expect(get(store).rawBrowser.filters.messageTypesInput).toBe("");

    store.setRawFilters({
      startUsecInput: "300",
      endUsecInput: "400",
      messageTypesInput: "GPS",
      textInput: "fix",
      fieldFilters: [{ field: "satellites", value_text: "10" }],
      limit: 50,
      includeDetail: false,
      includeHex: true,
    });

    store.selectEntry("ready-a");

    expect(get(store).rawBrowser.filters).toEqual({
      startUsecInput: "100",
      endUsecInput: "250",
      messageTypesInput: "HEARTBEAT,ATTITUDE",
      textInput: "armed",
      fieldFilters: [{ field: "mode", value_text: "GUIDED" }],
      limit: 25,
      includeDetail: true,
      includeHex: false,
    });
  });

  it("blocks replay preparation for missing, stale, and corrupt entries", async () => {
    const sessionHarness = createSessionHarness();
    const service = createService(createCatalog([
      createEntry("missing", "missing"),
      createEntry("stale", "stale"),
      createEntry("corrupt", "corrupt"),
    ]));
    const store = createLogsWorkspaceStore(sessionHarness, service);
    await store.initialize();

    store.selectEntry("missing");
    await store.ensurePlaybackReady();
    expect(get(store).playback.error).toContain("missing");

    store.selectEntry("stale");
    await store.ensurePlaybackReady();
    expect(get(store).playback.error).toContain("stale");

    store.selectEntry("corrupt");
    await store.ensurePlaybackReady();
    expect(get(store).playback.error).toContain("corrupt");
  });

  it("updates relinked and reindexed entries without overwriting a newer selection", async () => {
    const sessionHarness = createSessionHarness();
    const service = createService(createCatalog([
      createEntry("ready", "ready"),
      createEntry("stale", "stale"),
    ]));
    const relinkDeferred = deferred<LogLibraryEntry>();
    const reindexDeferred = deferred<LogLibraryEntry>();
    service.relinkEntry = vi.fn(() => relinkDeferred.promise);
    service.reindexEntry = vi.fn(() => reindexDeferred.promise);

    const store = createLogsWorkspaceStore(sessionHarness, service);
    await store.initialize();

    store.selectEntry("stale");
    const relinkPromise = store.relinkEntry("stale", "/logs/relinked.tlog");
    store.selectEntry("ready");
    relinkDeferred.resolve(createEntry("stale", "stale", "/logs/relinked.tlog"));
    await relinkPromise;

    expect(get(store).library.selectedEntryId).toBe("ready");
    expect(findCatalogEntry(get(store).library.catalog ?? null, "stale")?.source.original_path).toBe("/logs/relinked.tlog");

    store.selectEntry("stale");
    const reindexPromise = store.reindexEntry("stale");
    store.selectEntry("ready");
    reindexDeferred.resolve(createEntry("stale", "ready", "/logs/relinked.tlog"));
    await reindexPromise;

    expect(get(store).library.selectedEntryId).toBe("ready");
    expect(findCatalogEntry(get(store).library.catalog ?? null, "stale")?.status).toBe("ready");
  });

  it("plays, stops, and restores live source while preserving library selection", async () => {
    const sessionHarness = createSessionHarness();
    const service = createService(createCatalog([
      createEntry("ready", "ready"),
      createEntry("other", "ready"),
    ]));
    const store = createLogsWorkspaceStore(sessionHarness, service);
    await store.initialize();

    store.selectEntry("ready");
    await store.playSelected();
    sessionHarness.emitPlayback(150, 0);
    service.emitPlayback({
      envelope: createEnvelope("playback", 0, 1),
      value: {
        ...idlePlaybackState(),
        status: "playing",
        entry_id: "ready",
        operation_id: "replay_play",
        cursor_usec: 150,
        start_usec: 100,
        end_usec: 500,
        duration_secs: 0.4,
        barrier_ready: true,
      },
    });

    expect(get(store).effectiveSource).toBe("playback");
    expect(get(store).playback.state.status).toBe("playing");

    await store.stopReplay();
    expect(sessionHarness.bootstrapSource).toHaveBeenCalledWith("live");
    sessionHarness.emitLive();

    const state = get(store);
    expect(state.library.selectedEntryId).toBe("ready");
    expect(state.effectiveSource).toBe("live");
    expect(state.playback.state.status).toBe("idle");
    expect(state.library.loadedEntryId).toBeNull();
  });

  it("ignores stale seek completions after replay stops and live is restored", async () => {
    const sessionHarness = createSessionHarness();
    const service = createService(createCatalog([createEntry("ready", "ready")]));
    const seekDeferred = deferred<PlaybackSeekResult>();
    service.seek = vi.fn(() => seekDeferred.promise);
    const store = createLogsWorkspaceStore(sessionHarness, service);
    await store.initialize();

    store.selectEntry("ready");
    await store.ensurePlaybackReady();
    sessionHarness.emitPlayback(150, 0);
    const seekPromise = store.seek(400);
    await store.stopReplay();
    sessionHarness.emitLive();

    seekDeferred.resolve({
      envelope: createEnvelope("playback", 1, 1),
      cursor_usec: 400,
    });
    await seekPromise;
    service.emitPlayback({
      envelope: createEnvelope("playback", 1, 1),
      value: {
        ...idlePlaybackState(),
        status: "paused",
        entry_id: "ready",
        operation_id: "replay_seek",
        cursor_usec: 400,
        start_usec: 100,
        end_usec: 500,
        duration_secs: 0.4,
        barrier_ready: true,
      },
    });

    const state = get(store);
    expect(state.effectiveSource).toBe("live");
    expect(state.playback.state.status).toBe("idle");
    expect(state.playback.state.cursor_usec).toBeNull();
  });

  it("refreshes recording status across start and stop transitions", async () => {
    const sessionHarness = createSessionHarness();
    const service = createService();
    service.startRecording = vi.fn(async () => {
      service.setRecordingStatus({
        kind: "recording",
        operation_id: "recording_start",
        mode: "manual",
        file_name: "capture.tlog",
        destination_path: "/recordings/capture.tlog",
        bytes_written: 128,
        started_at_unix_msec: 10,
      });
      return "capture.tlog";
    });
    service.stopRecording = vi.fn(async () => {
      service.setRecordingStatus({
        kind: "stopping",
        operation_id: "recording_stop",
        file_name: "capture.tlog",
        destination_path: "/recordings/capture.tlog",
        bytes_written: 256,
      });
    });

    const store = createLogsWorkspaceStore(sessionHarness, service);
    await store.initialize();
    await store.startRecordingAt("/recordings/capture.tlog");
    expect(get(store).recording.status.kind).toBe("recording");

    await store.stopActiveRecording();
    expect(get(store).recording.status.kind).toBe("stopping");
  });

  it("surfaces manual recording start failures without mutating the last known status", async () => {
    const sessionHarness = createSessionHarness();
    const service = createService();
    service.startRecording = vi.fn(async () => {
      throw new Error("disk full");
    });

    const store = createLogsWorkspaceStore(sessionHarness, service);
    await store.initialize();

    await expect(store.startRecordingAt("/recordings/capture.tlog")).resolves.toBeNull();

    const state = get(store);
    expect(state.lastError).toBe("disk full");
    expect(state.recording.statusPhase).toBe("failed");
    expect(state.recording.error).toBe("disk full");
    expect(state.recording.status).toEqual({ kind: "idle" });
  });

  it("refreshes the library after a stopped recording settles back to idle", async () => {
    vi.useFakeTimers();
    try {
      const sessionHarness = createSessionHarness();
      const service = createService();
      const activeRecordingStatus = {
        kind: "recording",
        operation_id: "recording_start",
        mode: "manual",
        file_name: "capture.tlog",
        destination_path: "/recordings/capture.tlog",
        bytes_written: 512,
        started_at_unix_msec: 10,
      } satisfies RecordingStatus;
      service.getRecordingStatus = vi.fn<LogsWorkspaceService["getRecordingStatus"]>(async () => activeRecordingStatus)
        .mockResolvedValueOnce(activeRecordingStatus)
        .mockResolvedValueOnce({ kind: "idle" } satisfies RecordingStatus);
      const nextCatalog = createCatalog([
        createEntry("ready", "ready"),
        createEntry("recorded", "ready", "/recordings/capture.tlog"),
      ]);
      service.listLibrary = vi.fn(async () => structuredClone(nextCatalog));

      const store = createLogsWorkspaceStore(sessionHarness, service);
      await store.initialize();
      expect(get(store).recording.status.kind).toBe("recording");

      await vi.advanceTimersByTimeAsync(1000);
      await Promise.resolve();

      expect(get(store).recording.status.kind).toBe("idle");
      expect(service.listLibrary).toHaveBeenCalledTimes(2);
      expect(get(store).library.catalog?.entries.some((entry) => entry.entry_id === "recorded")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("tracks export progress and stores the completed export result", async () => {
    const sessionHarness = createSessionHarness();
    const service = createService(createCatalog([createEntry("ready", "ready")]));
    const exportDeferred = deferred<LogExportResult>();
    service.exportLog = vi.fn(() => exportDeferred.promise);
    const store = createLogsWorkspaceStore(sessionHarness, service);
    await store.initialize();

    store.selectEntry("ready");
    const exportPromise = store.runExport({
      format: "csv",
      destination_path: "/tmp/export.csv",
      start_usec: null,
      end_usec: null,
      message_types: [],
      text: null,
      field_filters: [],
    });

    service.emitProgress({
      operation_id: "log_export",
      phase: "exporting",
      completed_items: 1,
      total_items: 2,
      percent: 50,
      entry_id: "ready",
      instance_id: "export-1",
      message: "exporting",
    });

    expect(get(store).export.phase).toBe("exporting");
    expect(get(store).export.progress?.percent).toBe(50);

    exportDeferred.resolve({
      operation_id: "log_export",
      destination_path: "/tmp/export.csv",
      bytes_written: 64,
      rows_written: 4,
      diagnostics: [],
    });
    await exportPromise;

    expect(get(store).export.phase).toBe("completed");
    expect(get(store).export.result?.destination_path).toBe("/tmp/export.csv");
  });

  it("ignores stale export progress after selecting a different entry", async () => {
    const sessionHarness = createSessionHarness();
    const service = createService(createCatalog([
      createEntry("ready-a", "ready"),
      createEntry("ready-b", "ready"),
    ]));
    const exportDeferred = deferred<LogExportResult>();
    service.exportLog = vi.fn(() => exportDeferred.promise);
    const store = createLogsWorkspaceStore(sessionHarness, service);
    await store.initialize();

    store.selectEntry("ready-a");
    const exportPromise = store.runExport({
      format: "csv",
      destination_path: "/tmp/a.csv",
      start_usec: null,
      end_usec: null,
      message_types: [],
      text: null,
      field_filters: [],
    });

    store.selectEntry("ready-b");
    service.emitProgress({
      operation_id: "log_export",
      phase: "exporting",
      completed_items: 1,
      total_items: 4,
      percent: 25,
      entry_id: "ready-a",
      instance_id: "export-1",
      message: "stale export progress",
    });

    expect(get(store).export.phase).toBe("idle");
    expect(get(store).export.progress).toBeNull();
    expect(get(store).operationProgress).toBeNull();

    exportDeferred.resolve({
      operation_id: "log_export",
      destination_path: "/tmp/a.csv",
      bytes_written: 64,
      rows_written: 4,
      diagnostics: [],
    });
    await exportPromise;
  });

  it("ignores stale export progress from an earlier export of the same entry", async () => {
    const sessionHarness = createSessionHarness();
    const service = createService(createCatalog([createEntry("ready", "ready")]));
    const firstDeferred = deferred<LogExportResult>();
    const secondDeferred = deferred<LogExportResult>();
    service.exportLog = vi.fn()
      .mockImplementationOnce(() => firstDeferred.promise)
      .mockImplementationOnce(() => secondDeferred.promise);
    const store = createLogsWorkspaceStore(sessionHarness, service);
    await store.initialize();

    store.selectEntry("ready");
    const firstPromise = store.runExport({
      format: "csv",
      destination_path: "/tmp/first.csv",
      start_usec: null,
      end_usec: null,
      message_types: [],
      text: null,
      field_filters: [],
    });
    const secondPromise = store.runExport({
      format: "csv",
      destination_path: "/tmp/second.csv",
      start_usec: null,
      end_usec: null,
      message_types: [],
      text: null,
      field_filters: [],
    });

    service.emitProgress({
      operation_id: "log_export",
      phase: "exporting",
      completed_items: 1,
      total_items: 4,
      percent: 25,
      entry_id: "ready",
      instance_id: "export-1",
      message: "stale first export progress",
    });

    expect(get(store).export.request?.destination_path).toBe("/tmp/second.csv");
    expect(get(store).export.progress).toBeNull();
    expect(get(store).operationProgress).toBeNull();

    service.emitProgress({
      operation_id: "log_export",
      phase: "exporting",
      completed_items: 1,
      total_items: 2,
      percent: 50,
      entry_id: "ready",
      instance_id: "export-2",
      message: "active second export progress",
    });

    expect(get(store).export.progress?.instance_id).toBe("export-2");
    expect(get(store).operationProgress?.instance_id).toBe("export-2");

    firstDeferred.resolve({
      operation_id: "log_export",
      destination_path: "/tmp/first.csv",
      bytes_written: 64,
      rows_written: 4,
      diagnostics: [],
    });
    secondDeferred.resolve({
      operation_id: "log_export",
      destination_path: "/tmp/second.csv",
      bytes_written: 96,
      rows_written: 6,
      diagnostics: [],
    });

    await Promise.all([firstPromise, secondPromise]);
  });

  it("ignores stale raw, chart, and export completions after selecting a different entry", async () => {
    const sessionHarness = createSessionHarness();
    const service = createService(createCatalog([
      createEntry("ready-a", "ready"),
      createEntry("ready-b", "ready"),
    ]));
    const rawDeferred = deferred<RawMessagePage>();
    const chartDeferred = deferred<ChartSeriesPage>();
    const exportDeferred = deferred<LogExportResult>();
    service.queryRaw = vi.fn(() => rawDeferred.promise);
    service.queryCharts = vi.fn(() => chartDeferred.promise);
    service.exportLog = vi.fn(() => exportDeferred.promise);
    const store = createLogsWorkspaceStore(sessionHarness, service);
    await store.initialize();

    store.selectEntry("ready-a");
    const rawPromise = store.runRawQuery({
      cursor: null,
      start_usec: null,
      end_usec: null,
      message_types: [],
      text: null,
      field_filters: [],
      limit: 25,
      include_detail: true,
      include_hex: false,
    });
    const chartPromise = store.runChartQuery({
      selectors: [],
      start_usec: null,
      end_usec: null,
      max_points: null,
    });
    const exportPromise = store.runExport({
      format: "csv",
      destination_path: "/tmp/a.csv",
      start_usec: null,
      end_usec: null,
      message_types: [],
      text: null,
      field_filters: [],
    });

    store.selectEntry("ready-b");

    rawDeferred.resolve({
      entry_id: "ready-a",
      items: [{
        sequence: 7,
        timestamp_usec: 123,
        message_type: "HEARTBEAT",
        system_id: 1,
        component_id: 1,
        raw_len_bytes: 10,
        fields: {},
        detail: null,
        hex_payload: null,
        diagnostics: [],
      }],
      next_cursor: null,
      total_available: 1,
    });
    chartDeferred.resolve({
      entry_id: "ready-a",
      start_usec: null,
      end_usec: null,
      series: [{
        selector: { message_type: "HEARTBEAT", field: "base_mode", label: "Base mode", unit: null },
        points: [{ timestamp_usec: 123, value: 1 }],
      }],
      diagnostics: [],
    });
    exportDeferred.resolve({
      operation_id: "log_export",
      destination_path: "/tmp/a.csv",
      bytes_written: 64,
      rows_written: 4,
      diagnostics: [],
    });

    await Promise.all([rawPromise, chartPromise, exportPromise]);

    const state = get(store);
    expect(state.library.selectedEntryId).toBe("ready-b");
    expect(state.rawBrowser.phase).toBe("idle");
    expect(state.rawBrowser.request).toBeNull();
    expect(state.rawBrowser.page).toBeNull();
    expect(state.charts.phase).toBe("idle");
    expect(state.charts.request).toBeNull();
    expect(state.charts.page).toBeNull();
    expect(state.export.phase).toBe("idle");
    expect(state.export.request).toBeNull();
    expect(state.export.result).toBeNull();
  });

  it("ignores stale chart and export completions after changing chart groups", async () => {
    const sessionHarness = createSessionHarness();
    const service = createService(createCatalog([createEntry("ready", "ready")]));
    const chartDeferred = deferred<ChartSeriesPage>();
    const exportDeferred = deferred<LogExportResult>();
    service.queryCharts = vi.fn(() => chartDeferred.promise);
    service.exportLog = vi.fn(() => exportDeferred.promise);
    const store = createLogsWorkspaceStore(sessionHarness, service);
    await store.initialize();

    store.selectEntry("ready");
    store.setChartGroup("attitude");
    const chartPromise = store.runChartQuery({
      selectors: [{ message_type: "ATT", field: "Roll", label: "Roll", unit: "deg" }],
      start_usec: 100,
      end_usec: 200,
      max_points: 100,
    });
    const exportPromise = store.runExport({
      format: "csv",
      destination_path: "/tmp/attitude.csv",
      start_usec: 100,
      end_usec: 200,
      message_types: ["ATT"],
      text: null,
      field_filters: [],
    }, { origin: "chart" });

    store.setChartGroup("rate");

    chartDeferred.resolve({
      entry_id: "ready",
      start_usec: 100,
      end_usec: 200,
      series: [{
        selector: { message_type: "ATT", field: "Roll", label: "Roll", unit: "deg" },
        points: [{ timestamp_usec: 123, value: 1 }],
      }],
      diagnostics: [],
    });
    exportDeferred.resolve({
      operation_id: "log_export",
      destination_path: "/tmp/attitude.csv",
      bytes_written: 64,
      rows_written: 4,
      diagnostics: [],
    });

    await Promise.all([chartPromise, exportPromise]);

    const state = get(store);
    expect(state.charts.activeGroupKey).toBe("rate");
    expect(state.charts.phase).toBe("idle");
    expect(state.charts.request).toBeNull();
    expect(state.charts.page).toBeNull();
    expect(state.export.phase).toBe("idle");
    expect(state.export.request).toBeNull();
    expect(state.export.result).toBeNull();
  });

  it("ignores stale chart completions after changing the selected chart range", async () => {
    const sessionHarness = createSessionHarness();
    const service = createService(createCatalog([createEntry("ready", "ready")]));
    const chartDeferred = deferred<ChartSeriesPage>();
    service.queryCharts = vi.fn(() => chartDeferred.promise);
    const store = createLogsWorkspaceStore(sessionHarness, service);
    await store.initialize();

    store.selectEntry("ready");
    store.setChartGroup("attitude");
    store.setChartRange(100, 200);
    const chartPromise = store.runChartQuery({
      selectors: [{ message_type: "ATT", field: "Roll", label: "Roll", unit: "deg" }],
      start_usec: 100,
      end_usec: 200,
      max_points: 100,
    });

    store.setChartRange(300, 400);

    chartDeferred.resolve({
      entry_id: "ready",
      start_usec: 100,
      end_usec: 200,
      series: [{
        selector: { message_type: "ATT", field: "Roll", label: "Roll", unit: "deg" },
        points: [{ timestamp_usec: 123, value: 1 }],
      }],
      diagnostics: [],
    });

    await chartPromise;

    const state = get(store);
    expect(state.charts.selectedRange).toEqual({ startUsec: 300, endUsec: 400 });
    expect(state.charts.phase).toBe("idle");
    expect(state.charts.request).toBeNull();
    expect(state.charts.page).toBeNull();
  });

  it("ignores stale export completions after changing the selected export range", async () => {
    const sessionHarness = createSessionHarness();
    const service = createService(createCatalog([createEntry("ready", "ready")]));
    const exportDeferred = deferred<LogExportResult>();
    service.exportLog = vi.fn(() => exportDeferred.promise);
    const store = createLogsWorkspaceStore(sessionHarness, service);
    await store.initialize();

    store.selectEntry("ready");
    store.setChartGroup("attitude");
    store.setChartRange(100, 200);
    const exportPromise = store.runExport({
      format: "csv",
      destination_path: "/tmp/range-a.csv",
      start_usec: 100,
      end_usec: 200,
      message_types: ["ATT"],
      text: null,
      field_filters: [],
    }, { origin: "chart" });

    store.setChartRange(300, 400);

    exportDeferred.resolve({
      operation_id: "log_export",
      destination_path: "/tmp/range-a.csv",
      bytes_written: 64,
      rows_written: 4,
      diagnostics: [],
    });

    await exportPromise;

    const state = get(store);
    expect(state.charts.selectedRange).toEqual({ startUsec: 300, endUsec: 400 });
    expect(state.export.phase).toBe("idle");
    expect(state.export.request).toBeNull();
    expect(state.export.result).toBeNull();
  });

  it("keeps a raw export active while chart group and range invalidation happens", async () => {
    const sessionHarness = createSessionHarness();
    const service = createService(createCatalog([createEntry("ready", "ready")]));
    const exportDeferred = deferred<LogExportResult>();
    service.exportLog = vi.fn(() => exportDeferred.promise);
    const store = createLogsWorkspaceStore(sessionHarness, service);
    await store.initialize();

    store.selectEntry("ready");
    const exportPromise = store.runExport({
      format: "csv",
      destination_path: "/tmp/raw.csv",
      start_usec: null,
      end_usec: null,
      message_types: ["RAW_IMU"],
      text: null,
      field_filters: [],
    });

    store.setChartGroup("attitude");
    store.setChartRange(100, 200);

    service.emitProgress({
      operation_id: "log_export",
      phase: "exporting",
      completed_items: 1,
      total_items: 2,
      percent: 50,
      entry_id: "ready",
      instance_id: "export-1",
      message: "raw export still active",
    });

    expect(get(store).export.phase).toBe("exporting");
    expect(get(store).export.request?.destination_path).toBe("/tmp/raw.csv");
    expect(get(store).export.progress?.instance_id).toBe("export-1");

    exportDeferred.resolve({
      operation_id: "log_export",
      destination_path: "/tmp/raw.csv",
      bytes_written: 64,
      rows_written: 4,
      diagnostics: [],
    });

    await exportPromise;

    const state = get(store);
    expect(state.export.phase).toBe("completed");
    expect(state.export.request?.destination_path).toBe("/tmp/raw.csv");
    expect(state.export.result?.destination_path).toBe("/tmp/raw.csv");
    expect(state.charts.activeGroupKey).toBe("attitude");
    expect(state.charts.selectedRange).toEqual({ startUsec: 100, endUsec: 200 });
  });

  it("stores chart group, hover cursor, range selection, and export destination in the active workspace state", async () => {
    const sessionHarness = createSessionHarness();
    const service = createService(createCatalog([createEntry("ready", "ready")]));
    const store = createLogsWorkspaceStore(sessionHarness, service);
    await store.initialize();

    store.setChartGroup("attitude");
    store.setChartCursor(220);
    store.setChartRange(400, 200);
    store.setChartExportDestination("/tmp/chart-range.csv");

    const state = get(store);
    expect(state.charts.activeGroupKey).toBe("attitude");
    expect(state.charts.hoveredCursorUsec).toBe(220);
    expect(state.charts.selectedRange).toEqual({ startUsec: 200, endUsec: 400 });
    expect(state.charts.exportDestinationPath).toBe("/tmp/chart-range.csv");
  });
});
