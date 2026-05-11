import { get, writable } from "svelte/store";

import {
  cancelLogLibraryOperation,
  closeLog,
  exportLog,
  getLogLibraryCatalog,
  openLog,
  queryChartSeries,
  queryRawMessages,
  registerLogLibraryEntry,
  registerLogLibraryEntryFromPicker,
  reindexLogLibraryEntry,
  relinkLogLibraryEntry,
  removeLogLibraryEntry,
  subscribeLogProgress,
  type ChartSeriesPage,
  type ChartSeriesRequest,
  type LogExportRequest,
  type LogExportResult,
  type LogLibraryCatalog,
  type LogLibraryEntry,
  type LogProgress,
  type LogSummary,
  type RawMessagePage,
  type RawMessageFieldFilter,
  type RawMessageQuery,
} from "../../logs";
import {
  getRecordingSettings,
  getRecordingStatus,
  saveRecordingSettings,
  startRecording,
  stopRecording,
  type RecordingSettings,
  type RecordingSettingsResult,
  type RecordingStatus,
} from "../../recording";
import {
  pausePlayback,
  playPlayback,
  seekPlayback,
  setPlaybackSpeed,
  stopPlayback,
  subscribePlaybackState,
  type PlaybackSeekResult,
  type PlaybackStateSnapshot,
} from "../../playback";
import { shouldDropEvent, type SessionEvent, type SessionEnvelope, type SourceKind } from "../../session";
import { formatUnknownError } from "../error-format";
import { session, type SessionStore, type SessionStoreState } from "./session";

const DEFAULT_PLAYBACK_SPEEDS = [0.5, 1, 2, 4, 8, 16];

type AsyncPhase = "idle" | "loading" | "ready" | "failed";

export type LogsExportOrigin = "raw-browser" | "chart";

export type LogsWorkspacePhase = "idle" | "subscribing" | "loading" | "ready";

export type LogsLibraryState = {
  phase: AsyncPhase;
  error: string | null;
  catalog: LogLibraryCatalog | null;
  selectedEntryId: string | null;
  loadedEntryId: string | null;
};

export type LogsPlaybackState = {
  state: PlaybackStateSnapshot;
  envelope: SessionEnvelope | null;
  bootstrapping: boolean;
  error: string | null;
  openedSummary: LogSummary | null;
};

export type LogsRecordingState = {
  statusPhase: AsyncPhase;
  settingsPhase: AsyncPhase;
  error: string | null;
  status: RecordingStatus;
  settings: RecordingSettings | null;
};

export type LogsRawBrowserState = {
  phase: AsyncPhase;
  error: string | null;
  request: RawMessageQuery | null;
  page: RawMessagePage | null;
  filters: LogsRawBrowserFilters;
  selectedSequence: number | null;
  savedFiltersByEntryId: Record<string, LogsRawBrowserFilters>;
  savedSelectionByEntryId: Record<string, number | null>;
};

export type LogsRawBrowserFilters = {
  startUsecInput: string;
  endUsecInput: string;
  messageTypesInput: string;
  textInput: string;
  fieldFilters: RawMessageFieldFilter[];
  limit: number;
  includeDetail: boolean;
  includeHex: boolean;
};

export type LogsChartState = {
  phase: AsyncPhase;
  error: string | null;
  request: ChartSeriesRequest | null;
  page: ChartSeriesPage | null;
  activeGroupKey: string | null;
  hoveredCursorUsec: number | null;
  selectedRange: { startUsec: number; endUsec: number } | null;
  exportDestinationPath: string;
};

export type LogsExportState = {
  origin: LogsExportOrigin | null;
  phase: "idle" | "exporting" | "completed" | "failed";
  error: string | null;
  request: LogExportRequest | null;
  progress: LogProgress | null;
  result: LogExportResult | null;
};

export type LogsWorkspaceState = {
  hydrated: boolean;
  phase: LogsWorkspacePhase;
  lastError: string | null;
  effectiveSource: SourceKind;
  sessionEnvelope: SessionEnvelope | null;
  operationProgress: LogProgress | null;
  library: LogsLibraryState;
  playback: LogsPlaybackState;
  recording: LogsRecordingState;
  rawBrowser: LogsRawBrowserState;
  charts: LogsChartState;
  export: LogsExportState;
};

type LogsSessionStore = Pick<SessionStore, "subscribe" | "initialize" | "bootstrapSource">;

export type LogsWorkspaceService = {
  listLibrary(): Promise<LogLibraryCatalog>;
  registerEntry(path: string): Promise<LogLibraryEntry>;
  registerEntryFromPicker(): Promise<LogLibraryEntry | null>;
  removeEntry(entryId: string): Promise<LogLibraryCatalog>;
  relinkEntry(entryId: string, path: string): Promise<LogLibraryEntry>;
  reindexEntry(entryId: string): Promise<LogLibraryEntry>;
  cancelOperation(): Promise<boolean>;
  openLog(path: string): Promise<LogSummary>;
  closeLog(): Promise<void>;
  subscribeProgress(cb: (progress: LogProgress) => void): Promise<() => void>;
  subscribePlayback(cb: (event: SessionEvent<PlaybackStateSnapshot>) => void): Promise<() => void>;
  play(): Promise<PlaybackStateSnapshot>;
  pause(): Promise<PlaybackStateSnapshot>;
  seek(cursorUsec: number | null): Promise<PlaybackSeekResult>;
  setSpeed(speed: number): Promise<PlaybackStateSnapshot>;
  stop(): Promise<PlaybackStateSnapshot>;
  queryRaw(request: RawMessageQuery): Promise<RawMessagePage>;
  queryCharts(request: ChartSeriesRequest): Promise<ChartSeriesPage>;
  exportLog(request: LogExportRequest): Promise<LogExportResult>;
  getRecordingStatus(): Promise<RecordingStatus>;
  getRecordingSettings(): Promise<RecordingSettingsResult>;
  saveRecordingSettings(settings: RecordingSettings): Promise<RecordingSettingsResult>;
  startRecording(path: string): Promise<string>;
  stopRecording(): Promise<void>;
  formatError(error: unknown): string;
};

function buildIdlePlaybackState(): PlaybackStateSnapshot {
  return {
    status: "idle",
    entry_id: null,
    operation_id: null,
    cursor_usec: null,
    start_usec: null,
    end_usec: null,
    duration_secs: null,
    speed: 1,
    available_speeds: [...DEFAULT_PLAYBACK_SPEEDS],
    barrier_ready: false,
    readonly: true,
    diagnostic: null,
  };
}

function createDefaultRawBrowserFilters(): LogsRawBrowserFilters {
  return {
    startUsecInput: "",
    endUsecInput: "",
    messageTypesInput: "",
    textInput: "",
    fieldFilters: [{ field: "", value_text: null }],
    limit: 25,
    includeDetail: true,
    includeHex: true,
  };
}

function createInitialState(): LogsWorkspaceState {
  return {
    hydrated: false,
    phase: "idle",
    lastError: null,
    effectiveSource: "live",
    sessionEnvelope: null,
    operationProgress: null,
    library: {
      phase: "idle",
      error: null,
      catalog: null,
      selectedEntryId: null,
      loadedEntryId: null,
    },
    playback: {
      state: buildIdlePlaybackState(),
      envelope: null,
      bootstrapping: false,
      error: null,
      openedSummary: null,
    },
    recording: {
      statusPhase: "idle",
      settingsPhase: "idle",
      error: null,
      status: { kind: "idle" },
      settings: null,
    },
    rawBrowser: {
      phase: "idle",
      error: null,
      request: null,
      page: null,
      filters: createDefaultRawBrowserFilters(),
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
  };
}

export function createLogsWorkspaceService(): LogsWorkspaceService {
  return {
    listLibrary: getLogLibraryCatalog,
    registerEntry: registerLogLibraryEntry,
    registerEntryFromPicker: registerLogLibraryEntryFromPicker,
    removeEntry: removeLogLibraryEntry,
    relinkEntry: relinkLogLibraryEntry,
    reindexEntry: reindexLogLibraryEntry,
    cancelOperation: cancelLogLibraryOperation,
    openLog,
    closeLog,
    subscribeProgress: subscribeLogProgress,
    subscribePlayback: subscribePlaybackState,
    play: playPlayback,
    pause: pausePlayback,
    seek: seekPlayback,
    setSpeed: setPlaybackSpeed,
    stop: stopPlayback,
    queryRaw: queryRawMessages,
    queryCharts: queryChartSeries,
    exportLog,
    getRecordingStatus,
    getRecordingSettings,
    saveRecordingSettings,
    startRecording,
    stopRecording,
    formatError: formatUnknownError,
  };
}

function resolveSelectedEntryId(catalog: LogLibraryCatalog | null, currentSelectedEntryId: string | null): string | null {
  if (!catalog || catalog.entries.length === 0) {
    return null;
  }

  if (currentSelectedEntryId && catalog.entries.some((entry) => entry.entry_id === currentSelectedEntryId)) {
    return currentSelectedEntryId;
  }

  return catalog.entries[0]?.entry_id ?? null;
}

function upsertCatalogEntry(catalog: LogLibraryCatalog | null, nextEntry: LogLibraryEntry): LogLibraryCatalog | null {
  if (!catalog) {
    return null;
  }

  const entries = catalog.entries.some((entry) => entry.entry_id === nextEntry.entry_id)
    ? catalog.entries.map((entry) => entry.entry_id === nextEntry.entry_id ? nextEntry : entry)
    : [nextEntry, ...catalog.entries];

  return {
    ...catalog,
    entries,
  };
}

function findEntry(catalog: LogLibraryCatalog | null, entryId: string | null): LogLibraryEntry | null {
  if (!catalog || !entryId) {
    return null;
  }

  return catalog.entries.find((entry) => entry.entry_id === entryId) ?? null;
}

function normalizeChartRange(startUsec: number | null, endUsec: number | null) {
  if (startUsec == null || endUsec == null || !Number.isFinite(startUsec) || !Number.isFinite(endUsec)) {
    return null;
  }

  return startUsec <= endUsec
    ? { startUsec, endUsec }
    : { startUsec: endUsec, endUsec: startUsec };
}

function canPreparePlayback(entry: LogLibraryEntry): boolean {
  if (entry.source.status.kind !== "available") {
    return false;
  }

  return entry.status === "ready" || entry.status === "partial";
}

function buildReplayableEntryError(entry: LogLibraryEntry): string {
  switch (entry.status) {
    case "missing":
      return "The selected log is missing. Relink or remove it before starting replay.";
    case "stale":
      return "The selected log is stale. Reindex it before starting replay.";
    case "corrupt":
      return "The selected log is corrupt and cannot be replayed.";
    case "unsupported":
      return "The selected log format is unsupported for replay.";
    case "indexing":
      return "The selected log is still indexing. Wait for indexing to finish before replaying it.";
    default:
      return "The selected log is not ready for replay.";
  }
}

function normalizePlaybackState(state: PlaybackStateSnapshot, entryId: string | null): PlaybackStateSnapshot {
  return {
    ...state,
    entry_id: state.entry_id ?? entryId,
    available_speeds: state.available_speeds.length > 0 ? [...state.available_speeds] : [...DEFAULT_PLAYBACK_SPEEDS],
  };
}

export function createLogsWorkspaceStore(
  sessionStore: LogsSessionStore = session,
  service: LogsWorkspaceService = createLogsWorkspaceService(),
) {
  const store = writable<LogsWorkspaceState>(createInitialState());
  let initializePromise: Promise<void> | null = null;
  let stopSession: (() => void) | null = null;
  let stopSubscriptions: (() => void) | null = null;
  let libraryRequestId = 0;
  let playbackRequestId = 0;
  let rawRequestId = 0;
  let chartRequestId = 0;
  let exportRequestId = 0;
  let exportOrigin: LogsExportOrigin | null = null;
  let recordingStatusRequestId = 0;
  let recordingSettingsRequestId = 0;
  let acceptPlaybackEvents = false;
  let recordingRefreshTimer: ReturnType<typeof setTimeout> | null = null;

  function updateState(recipe: (state: LogsWorkspaceState) => LogsWorkspaceState) {
    store.update(recipe);
  }

  function clearRecordingRefreshTimer() {
    if (recordingRefreshTimer) {
      clearTimeout(recordingRefreshTimer);
      recordingRefreshTimer = null;
    }
  }

  function scheduleRecordingRefresh(nextStatus: RecordingStatus, previousStatus: RecordingStatus) {
    clearRecordingRefreshTimer();

    if (nextStatus.kind === "recording" || nextStatus.kind === "stopping") {
      recordingRefreshTimer = setTimeout(() => {
        recordingRefreshTimer = null;
        void refreshRecordingStatus();
      }, 1000);
      return;
    }

    if (previousStatus.kind === "recording" || previousStatus.kind === "stopping") {
      void refreshLibrary();
    }
  }

  function invalidatePlaybackFlow() {
    playbackRequestId += 1;
    acceptPlaybackEvents = false;
  }

  function invalidateExport(origin: LogsExportOrigin | "any") {
    if (origin !== "any" && exportOrigin !== origin) {
      return false;
    }

    exportRequestId += 1;
    exportOrigin = null;
    return true;
  }

  function applySessionState(sessionState: SessionStoreState) {
    const effectiveSource = sessionState.activeSource ?? "live";
    const playbackCursorUsec = sessionState.bootstrap.playbackCursorUsec;

    updateState((state) => {
      const currentEntryId = state.playback.state.entry_id ?? state.library.loadedEntryId ?? state.library.selectedEntryId;
      const nextPlaybackState = effectiveSource === "playback"
        ? {
            ...state.playback.state,
            status: state.playback.state.status === "idle" ? "ready" : state.playback.state.status,
            entry_id: currentEntryId,
            cursor_usec: playbackCursorUsec ?? state.playback.state.cursor_usec,
            available_speeds:
              state.playback.state.available_speeds.length > 0
                ? [...state.playback.state.available_speeds]
                : [...DEFAULT_PLAYBACK_SPEEDS],
          }
        : buildIdlePlaybackState();

      return {
        ...state,
        effectiveSource,
        sessionEnvelope: sessionState.activeEnvelope,
        playback: {
          ...state.playback,
          envelope: effectiveSource === "playback" ? sessionState.activeEnvelope : null,
          bootstrapping: false,
          error: effectiveSource === "playback" ? state.playback.error : null,
          openedSummary: effectiveSource === "playback" ? state.playback.openedSummary : null,
          state: nextPlaybackState,
        },
        library: {
          ...state.library,
          loadedEntryId: effectiveSource === "playback" ? state.library.loadedEntryId : null,
        },
      };
    });

    acceptPlaybackEvents = effectiveSource === "playback";
  }

  function applyPlaybackEvent(event: SessionEvent<PlaybackStateSnapshot>) {
    const current = get(store);
    if (event.envelope.source_kind !== "playback") {
      return;
    }

    if (!acceptPlaybackEvents && current.effectiveSource !== "playback") {
      return;
    }

    if (shouldDropEvent(current.playback.envelope, event.envelope)) {
      return;
    }

    updateState((state) => ({
      ...state,
      playback: {
        ...state.playback,
        envelope: event.envelope,
        bootstrapping: false,
        error: null,
        state: normalizePlaybackState(event.value, event.value.entry_id ?? state.library.loadedEntryId ?? state.library.selectedEntryId),
      },
      library: {
        ...state.library,
        loadedEntryId: event.value.entry_id ?? state.library.loadedEntryId,
      },
    }));
  }

  function applyProgress(progress: LogProgress) {
    const current = get(store);
    const shouldApplyExportProgress = progress.operation_id === "log_export"
      && current.export.request != null
      && current.export.phase !== "idle"
      && current.export.request.entry_id === progress.entry_id;
    const exportProgressMatchesInstance = shouldApplyExportProgress
      && current.export.request?.instance_id === progress.instance_id;

    updateState((state) => ({
      ...state,
      operationProgress:
        progress.operation_id === "log_export" && !exportProgressMatchesInstance
          ? state.operationProgress
          : progress,
      export:
        exportProgressMatchesInstance
          ? {
              ...state.export,
              phase:
                progress.phase === "completed"
                  ? "completed"
                  : progress.phase === "failed" || progress.phase === "cancelled"
                    ? "failed"
                    : "exporting",
              progress,
            }
          : state.export,
    }));
  }

  async function refreshLibrary() {
    const requestId = libraryRequestId + 1;
    libraryRequestId = requestId;

    updateState((state) => ({
      ...state,
      phase: state.hydrated ? state.phase : "loading",
      library: {
        ...state.library,
        phase: "loading",
        error: null,
      },
    }));

    try {
      const catalog = await service.listLibrary();
      if (libraryRequestId !== requestId) {
        return;
      }

      updateState((state) => ({
        ...state,
        phase: "ready",
        library: {
          ...state.library,
          phase: "ready",
          error: null,
          catalog,
          selectedEntryId: resolveSelectedEntryId(catalog, state.library.selectedEntryId),
        },
      }));
    } catch (error) {
      if (libraryRequestId !== requestId) {
        return;
      }

      updateState((state) => ({
        ...state,
        phase: "ready",
        lastError: service.formatError(error),
        library: {
          ...state.library,
          phase: "failed",
          error: service.formatError(error),
        },
      }));
    }
  }

  async function refreshRecordingStatus() {
    const requestId = recordingStatusRequestId + 1;
    recordingStatusRequestId = requestId;
    const previousStatus = get(store).recording.status;

    updateState((state) => ({
      ...state,
      recording: {
        ...state.recording,
        statusPhase: "loading",
        error: null,
      },
    }));

    try {
      const status = await service.getRecordingStatus();
      if (recordingStatusRequestId !== requestId) {
        return;
      }

      updateState((state) => ({
        ...state,
        recording: {
          ...state.recording,
          statusPhase: "ready",
          status,
        },
      }));

      scheduleRecordingRefresh(status, previousStatus);
    } catch (error) {
      if (recordingStatusRequestId !== requestId) {
        return;
      }

      clearRecordingRefreshTimer();

      updateState((state) => ({
        ...state,
        lastError: service.formatError(error),
        recording: {
          ...state.recording,
          statusPhase: "failed",
          error: service.formatError(error),
        },
      }));
    }
  }

  async function refreshRecordingSettings() {
    const requestId = recordingSettingsRequestId + 1;
    recordingSettingsRequestId = requestId;

    updateState((state) => ({
      ...state,
      recording: {
        ...state.recording,
        settingsPhase: "loading",
        error: null,
      },
    }));

    try {
      const result = await service.getRecordingSettings();
      if (recordingSettingsRequestId !== requestId) {
        return;
      }

      updateState((state) => ({
        ...state,
        recording: {
          ...state.recording,
          settingsPhase: "ready",
          settings: result.settings,
        },
      }));
    } catch (error) {
      if (recordingSettingsRequestId !== requestId) {
        return;
      }

      updateState((state) => ({
        ...state,
        lastError: service.formatError(error),
        recording: {
          ...state.recording,
          settingsPhase: "failed",
          error: service.formatError(error),
        },
      }));
    }
  }

  async function initialize() {
    if (initializePromise) {
      return initializePromise;
    }

    initializePromise = (async () => {
      updateState((state) => ({
        ...state,
        phase: "subscribing",
        lastError: null,
      }));

      await sessionStore.initialize();
      stopSession = sessionStore.subscribe(applySessionState);

      try {
        const disposers = await Promise.all([
          service.subscribeProgress(applyProgress),
          service.subscribePlayback(applyPlaybackEvent),
        ]);
        stopSubscriptions = () => {
          for (const dispose of disposers) {
            dispose();
          }
        };
      } catch (error) {
        updateState((state) => ({
          ...state,
          phase: "ready",
          lastError: service.formatError(error),
        }));
      }

      await Promise.allSettled([
        refreshLibrary(),
        refreshRecordingStatus(),
        refreshRecordingSettings(),
      ]);

      updateState((state) => ({
        ...state,
        hydrated: true,
        phase: "ready",
      }));
    })();

    return initializePromise;
  }

  function selectEntry(entryId: string | null) {
    const selectionChanged = entryId !== get(store).library.selectedEntryId;
    if (selectionChanged) {
      rawRequestId += 1;
      chartRequestId += 1;
      invalidateExport("any");
    }

    updateState((state) => ({
      ...state,
      library: {
        ...state.library,
        selectedEntryId: entryId,
      },
      rawBrowser: entryId === state.library.selectedEntryId
        ? state.rawBrowser
        : {
            ...state.rawBrowser,
            phase: "idle",
            error: null,
            request: null,
            page: null,
            filters: entryId ? (state.rawBrowser.savedFiltersByEntryId[entryId] ?? createDefaultRawBrowserFilters()) : createDefaultRawBrowserFilters(),
            selectedSequence: entryId ? (state.rawBrowser.savedSelectionByEntryId[entryId] ?? null) : null,
          },
      charts: entryId === state.library.selectedEntryId
        ? state.charts
        : {
            ...state.charts,
            phase: "idle",
            error: null,
            request: null,
            page: null,
            activeGroupKey: null,
            hoveredCursorUsec: null,
            selectedRange: null,
          },
        export: entryId === state.library.selectedEntryId
          ? state.export
          : {
            origin: null,
            phase: "idle",
            error: null,
            request: null,
            progress: null,
            result: null,
          },
    }));
  }

  function setRawFilters(filters: LogsRawBrowserFilters) {
    updateState((state) => {
      const entryId = state.library.selectedEntryId;
      return {
        ...state,
        rawBrowser: {
          ...state.rawBrowser,
          filters,
          savedFiltersByEntryId: entryId
            ? {
                ...state.rawBrowser.savedFiltersByEntryId,
                [entryId]: filters,
              }
            : state.rawBrowser.savedFiltersByEntryId,
        },
      };
    });
  }

  function selectRawMessage(sequence: number | null) {
    updateState((state) => {
      const entryId = state.library.selectedEntryId;
      return {
        ...state,
        rawBrowser: {
          ...state.rawBrowser,
          selectedSequence: sequence,
          savedSelectionByEntryId: entryId
            ? {
                ...state.rawBrowser.savedSelectionByEntryId,
                [entryId]: sequence,
              }
            : state.rawBrowser.savedSelectionByEntryId,
        },
      };
    });
  }

  function setChartGroup(groupKey: string | null) {
    const groupChanged = groupKey !== get(store).charts.activeGroupKey;
    const exportInvalidated = groupChanged ? invalidateExport("chart") : false;
    if (groupChanged) {
      chartRequestId += 1;
    }

    updateState((state) => ({
      ...state,
      charts: {
        ...state.charts,
        phase: state.charts.activeGroupKey === groupKey ? state.charts.phase : "idle",
        error: state.charts.activeGroupKey === groupKey ? state.charts.error : null,
        request: state.charts.activeGroupKey === groupKey ? state.charts.request : null,
        page: state.charts.activeGroupKey === groupKey ? state.charts.page : null,
        activeGroupKey: groupKey,
        hoveredCursorUsec: null,
        selectedRange: null,
      },
      export: !exportInvalidated || groupKey === state.charts.activeGroupKey
        ? state.export
        : {
            origin: null,
            phase: "idle",
            error: null,
            request: null,
            progress: null,
            result: null,
          },
    }));
  }

  function setChartCursor(cursorUsec: number | null) {
    updateState((state) => ({
      ...state,
      charts: {
        ...state.charts,
        hoveredCursorUsec: cursorUsec,
      },
    }));
  }

  function setChartRange(startUsec: number | null, endUsec: number | null) {
    chartRequestId += 1;
    const exportInvalidated = invalidateExport("chart");

    updateState((state) => ({
      ...state,
      charts: {
        ...state.charts,
        phase: "idle",
        error: null,
        request: null,
        page: null,
        selectedRange: normalizeChartRange(startUsec, endUsec),
      },
      export: exportInvalidated
        ? {
            origin: null,
            phase: "idle",
            error: null,
            request: null,
            progress: null,
            result: null,
          }
        : state.export,
    }));
  }

  function setChartExportDestination(path: string) {
    updateState((state) => ({
      ...state,
      charts: {
        ...state.charts,
        exportDestinationPath: path,
      },
    }));
  }

  async function registerEntry(path: string) {
    const selectionAtStart = get(store).library.selectedEntryId;
    const requestId = libraryRequestId + 1;
    libraryRequestId = requestId;

    updateState((state) => ({
      ...state,
      library: {
        ...state.library,
        phase: "loading",
        error: null,
      },
    }));

    try {
      const entry = await service.registerEntry(path);
      if (libraryRequestId !== requestId) {
        return null;
      }

      updateState((state) => {
        const catalog = upsertCatalogEntry(state.library.catalog, entry);
        const shouldSelect = state.library.selectedEntryId === selectionAtStart || state.library.selectedEntryId === null;
        return {
          ...state,
          library: {
            ...state.library,
            phase: "ready",
            catalog,
            selectedEntryId: shouldSelect ? entry.entry_id : state.library.selectedEntryId,
          },
        };
      });

      return entry;
    } catch (error) {
      if (libraryRequestId !== requestId) {
        return null;
      }

      updateState((state) => ({
        ...state,
        lastError: service.formatError(error),
        library: {
          ...state.library,
          phase: "failed",
          error: service.formatError(error),
        },
      }));
      return null;
    }
  }

  async function registerEntryFromPicker() {
    const selectionAtStart = get(store).library.selectedEntryId;
    const requestId = libraryRequestId + 1;
    libraryRequestId = requestId;

    updateState((state) => ({
      ...state,
      library: {
        ...state.library,
        phase: "loading",
        error: null,
      },
    }));

    try {
      const entry = await service.registerEntryFromPicker();
      if (libraryRequestId !== requestId) {
        return null;
      }

      if (!entry) {
        updateState((state) => ({
          ...state,
          library: {
            ...state.library,
            phase: "ready",
            error: null,
          },
        }));
        return null;
      }

      updateState((state) => {
        const catalog = upsertCatalogEntry(state.library.catalog, entry);
        const shouldSelect = state.library.selectedEntryId === selectionAtStart || state.library.selectedEntryId === null;
        return {
          ...state,
          library: {
            ...state.library,
            phase: "ready",
            catalog,
            selectedEntryId: shouldSelect ? entry.entry_id : state.library.selectedEntryId,
          },
        };
      });

      return entry;
    } catch (error) {
      if (libraryRequestId !== requestId) {
        return null;
      }

      updateState((state) => ({
        ...state,
        lastError: service.formatError(error),
        library: {
          ...state.library,
          phase: "failed",
          error: service.formatError(error),
        },
      }));
      return null;
    }
  }

  async function removeEntry(entryId: string) {
    const requestId = libraryRequestId + 1;
    libraryRequestId = requestId;

    updateState((state) => ({
      ...state,
      library: {
        ...state.library,
        phase: "loading",
        error: null,
      },
    }));

    try {
      const catalog = await service.removeEntry(entryId);
      if (libraryRequestId !== requestId) {
        return null;
      }

      updateState((state) => ({
        ...state,
        library: {
          ...state.library,
          phase: "ready",
          catalog,
          selectedEntryId: resolveSelectedEntryId(catalog, state.library.selectedEntryId === entryId ? null : state.library.selectedEntryId),
          loadedEntryId: state.library.loadedEntryId === entryId ? null : state.library.loadedEntryId,
        },
      }));

      return catalog;
    } catch (error) {
      if (libraryRequestId !== requestId) {
        return null;
      }

      updateState((state) => ({
        ...state,
        lastError: service.formatError(error),
        library: {
          ...state.library,
          phase: "failed",
          error: service.formatError(error),
        },
      }));
      return null;
    }
  }

  async function relinkEntry(entryId: string, path: string) {
    const requestId = libraryRequestId + 1;
    libraryRequestId = requestId;

    updateState((state) => ({
      ...state,
      library: {
        ...state.library,
        phase: "loading",
        error: null,
      },
    }));

    try {
      const entry = await service.relinkEntry(entryId, path);
      if (libraryRequestId !== requestId) {
        return null;
      }

      updateState((state) => ({
        ...state,
        library: {
          ...state.library,
          phase: "ready",
          catalog: upsertCatalogEntry(state.library.catalog, entry),
        },
      }));

      return entry;
    } catch (error) {
      if (libraryRequestId !== requestId) {
        return null;
      }

      updateState((state) => ({
        ...state,
        lastError: service.formatError(error),
        library: {
          ...state.library,
          phase: "failed",
          error: service.formatError(error),
        },
      }));
      return null;
    }
  }

  async function reindexEntry(entryId: string) {
    const requestId = libraryRequestId + 1;
    libraryRequestId = requestId;

    updateState((state) => ({
      ...state,
      library: {
        ...state.library,
        phase: "loading",
        error: null,
      },
    }));

    try {
      const entry = await service.reindexEntry(entryId);
      if (libraryRequestId !== requestId) {
        return null;
      }

      updateState((state) => ({
        ...state,
        library: {
          ...state.library,
          phase: "ready",
          catalog: upsertCatalogEntry(state.library.catalog, entry),
        },
      }));

      return entry;
    } catch (error) {
      if (libraryRequestId !== requestId) {
        return null;
      }

      updateState((state) => ({
        ...state,
        lastError: service.formatError(error),
        library: {
          ...state.library,
          phase: "failed",
          error: service.formatError(error),
        },
      }));
      return null;
    }
  }

  async function ensurePlaybackReadyForRequest(requestId: number, selectedEntryId = get(store).library.selectedEntryId) {
    if (!selectedEntryId) {
      updateState((state) => ({
        ...state,
        playback: {
          ...state.playback,
          error: "Select a log before starting replay.",
        },
      }));
      return null;
    }

    acceptPlaybackEvents = true;

    const entry = findEntry(get(store).library.catalog, selectedEntryId);
    if (!entry) {
      updateState((state) => ({
        ...state,
        playback: {
          ...state.playback,
          error: "The selected log is no longer available.",
        },
      }));
      return null;
    }

    if (!canPreparePlayback(entry)) {
      updateState((state) => ({
        ...state,
        playback: {
          ...state.playback,
          error: buildReplayableEntryError(entry),
        },
      }));
      acceptPlaybackEvents = get(store).effectiveSource === "playback";
      return null;
    }

    updateState((state) => ({
      ...state,
      playback: {
        ...state.playback,
        bootstrapping: true,
        error: null,
        state: {
          ...state.playback.state,
          status: "loading",
          entry_id: entry.entry_id,
        },
      },
    }));

    try {
      const current = get(store);
      if (current.effectiveSource === "playback" && current.library.loadedEntryId && current.library.loadedEntryId !== entry.entry_id) {
        await service.stop();
        if (playbackRequestId !== requestId) {
          return null;
        }

        updateState((state) => ({
          ...state,
          library: {
            ...state.library,
            loadedEntryId: null,
          },
          playback: {
            ...state.playback,
            state: buildIdlePlaybackState(),
            envelope: null,
            openedSummary: null,
          },
        }));
      }

      if (get(store).library.loadedEntryId !== entry.entry_id) {
        const summary = await service.openLog(entry.source.original_path);
        if (playbackRequestId !== requestId || get(store).library.selectedEntryId !== selectedEntryId) {
          return null;
        }

        updateState((state) => ({
          ...state,
          library: {
            ...state.library,
            loadedEntryId: entry.entry_id,
          },
          playback: {
            ...state.playback,
            openedSummary: summary,
          },
        }));
      }

      if (get(store).effectiveSource !== "playback") {
        await sessionStore.bootstrapSource("playback");
        if (playbackRequestId !== requestId || get(store).library.selectedEntryId !== selectedEntryId) {
          return null;
        }
      }

      updateState((state) => ({
        ...state,
        playback: {
          ...state.playback,
          bootstrapping: false,
          error: null,
          state: {
            ...state.playback.state,
            status: state.playback.state.status === "idle" || state.playback.state.status === "loading"
              ? "ready"
              : state.playback.state.status,
            entry_id: entry.entry_id,
            start_usec: entry.metadata.start_usec,
            end_usec: entry.metadata.end_usec,
            duration_secs: entry.metadata.duration_secs,
            available_speeds:
              state.playback.state.available_speeds.length > 0
                ? [...state.playback.state.available_speeds]
                : [...DEFAULT_PLAYBACK_SPEEDS],
          },
        },
      }));

      return entry;
    } catch (error) {
      if (playbackRequestId !== requestId) {
        return null;
      }

      updateState((state) => ({
        ...state,
        lastError: service.formatError(error),
        playback: {
          ...state.playback,
          bootstrapping: false,
          error: service.formatError(error),
        },
      }));
      acceptPlaybackEvents = get(store).effectiveSource === "playback";
      return null;
    }
  }

  async function ensurePlaybackReady(selectedEntryId = get(store).library.selectedEntryId) {
    const requestId = playbackRequestId + 1;
    playbackRequestId = requestId;
    return ensurePlaybackReadyForRequest(requestId, selectedEntryId);
  }

  async function playSelected() {
    const selectedEntryId = get(store).library.selectedEntryId;
    const requestId = playbackRequestId + 1;
    playbackRequestId = requestId;
    const entry = await ensurePlaybackReadyForRequest(requestId, selectedEntryId);
    if (!entry) {
      return null;
    }

    try {
      const nextPlaybackState = await service.play();
      if (playbackRequestId !== requestId || get(store).library.selectedEntryId !== selectedEntryId) {
        return null;
      }

      updateState((state) => ({
        ...state,
        playback: {
          ...state.playback,
          error: null,
          state: normalizePlaybackState(nextPlaybackState, entry.entry_id),
        },
      }));

      return nextPlaybackState;
    } catch (error) {
      updateState((state) => ({
        ...state,
        lastError: service.formatError(error),
        playback: {
          ...state.playback,
          error: service.formatError(error),
        },
      }));
      return null;
    }
  }

  async function pause() {
    if (get(store).effectiveSource !== "playback") {
      return null;
    }

    try {
      const nextPlaybackState = await service.pause();
      updateState((state) => ({
        ...state,
        playback: {
          ...state.playback,
          error: null,
          state: normalizePlaybackState(nextPlaybackState, state.playback.state.entry_id),
        },
      }));
      return nextPlaybackState;
    } catch (error) {
      updateState((state) => ({
        ...state,
        lastError: service.formatError(error),
        playback: {
          ...state.playback,
          error: service.formatError(error),
        },
      }));
      return null;
    }
  }

  async function seek(cursorUsec: number | null) {
    const selectedEntryId = get(store).library.selectedEntryId;
    const requestId = playbackRequestId + 1;
    playbackRequestId = requestId;
    const entry = await ensurePlaybackReadyForRequest(requestId, selectedEntryId);
    if (!entry) {
      return null;
    }

    updateState((state) => ({
      ...state,
      playback: {
        ...state.playback,
        error: null,
        state: {
          ...state.playback.state,
          status: "seeking",
          operation_id: "replay_seek",
          entry_id: entry.entry_id,
          cursor_usec: cursorUsec,
          barrier_ready: false,
          start_usec: entry.metadata.start_usec,
          end_usec: entry.metadata.end_usec,
          duration_secs: entry.metadata.duration_secs,
        },
      },
    }));

    try {
      const result = await service.seek(cursorUsec);
      if (playbackRequestId !== requestId || get(store).library.selectedEntryId !== selectedEntryId) {
        return null;
      }

      updateState((state) => ({
        ...state,
        playback: {
          ...state.playback,
          envelope: result.envelope,
          error: null,
          state: {
            ...state.playback.state,
            status: "seeking",
            operation_id: "replay_seek",
            entry_id: entry.entry_id,
            cursor_usec: result.cursor_usec,
            barrier_ready: false,
          },
        },
      }));

      return result;
    } catch (error) {
      updateState((state) => ({
        ...state,
        lastError: service.formatError(error),
        playback: {
          ...state.playback,
          error: service.formatError(error),
        },
      }));
      return null;
    }
  }

  async function setSpeed(speed: number) {
    const requestId = playbackRequestId + 1;
    playbackRequestId = requestId;
    const entry = await ensurePlaybackReadyForRequest(requestId);
    if (!entry) {
      return null;
    }

    try {
      const nextPlaybackState = await service.setSpeed(speed);
      if (playbackRequestId !== requestId) {
        return null;
      }

      updateState((state) => ({
        ...state,
        playback: {
          ...state.playback,
          error: null,
          state: normalizePlaybackState(nextPlaybackState, entry.entry_id),
        },
      }));
      return nextPlaybackState;
    } catch (error) {
      updateState((state) => ({
        ...state,
        lastError: service.formatError(error),
        playback: {
          ...state.playback,
          error: service.formatError(error),
        },
      }));
      return null;
    }
  }

  async function stopReplay() {
    const requestId = playbackRequestId + 1;
    playbackRequestId = requestId;
    acceptPlaybackEvents = false;

    try {
      const nextPlaybackState = await service.stop();
      if (playbackRequestId !== requestId) {
        return null;
      }

      updateState((state) => ({
        ...state,
        playback: {
          ...state.playback,
          envelope: null,
          bootstrapping: false,
          error: null,
          openedSummary: null,
          state: normalizePlaybackState(nextPlaybackState, null),
        },
        library: {
          ...state.library,
          loadedEntryId: null,
        },
      }));

      if (get(store).effectiveSource === "playback") {
        await sessionStore.bootstrapSource("live");
      }

      return nextPlaybackState;
    } catch (error) {
      if (playbackRequestId !== requestId) {
        return null;
      }

      updateState((state) => ({
        ...state,
        lastError: service.formatError(error),
        playback: {
          ...state.playback,
          error: service.formatError(error),
        },
      }));
      acceptPlaybackEvents = get(store).effectiveSource === "playback";
      return null;
    }
  }

  async function runRawQuery(request: Omit<RawMessageQuery, "entry_id"> & { entry_id?: string }) {
    const selectedEntryId = request.entry_id ?? get(store).library.selectedEntryId;
    if (!selectedEntryId) {
      updateState((state) => ({
        ...state,
        rawBrowser: {
          ...state.rawBrowser,
          phase: "failed",
          error: "Select a log before querying raw messages.",
        },
      }));
      return null;
    }

    const requestId = rawRequestId + 1;
    rawRequestId = requestId;
    const nextRequest: RawMessageQuery = {
      entry_id: selectedEntryId,
      ...request,
    };

    updateState((state) => ({
      ...state,
      rawBrowser: {
        ...state.rawBrowser,
        phase: "loading",
        error: null,
        request: nextRequest,
      },
    }));

    try {
      const page = await service.queryRaw(nextRequest);
      if (rawRequestId !== requestId) {
        return null;
      }

      updateState((state) => ({
        ...state,
        rawBrowser: {
          ...state.rawBrowser,
          phase: "ready",
          request: nextRequest,
          page,
          selectedSequence: page.items[0]?.sequence ?? null,
          savedSelectionByEntryId: {
            ...state.rawBrowser.savedSelectionByEntryId,
            [selectedEntryId]: page.items[0]?.sequence ?? null,
          },
        },
      }));

      return page;
    } catch (error) {
      if (rawRequestId !== requestId) {
        return null;
      }

      updateState((state) => ({
        ...state,
        lastError: service.formatError(error),
        rawBrowser: {
          ...state.rawBrowser,
          phase: "failed",
          error: service.formatError(error),
          request: nextRequest,
        },
      }));
      return null;
    }
  }

  async function runChartQuery(request: Omit<ChartSeriesRequest, "entry_id"> & { entry_id?: string }) {
    const selectedEntryId = request.entry_id ?? get(store).library.selectedEntryId;
    if (!selectedEntryId) {
      updateState((state) => ({
        ...state,
        charts: {
          ...state.charts,
          phase: "failed",
          error: "Select a log before querying chart series.",
        },
      }));
      return null;
    }

    const requestId = chartRequestId + 1;
    chartRequestId = requestId;
    const nextRequest: ChartSeriesRequest = {
      entry_id: selectedEntryId,
      ...request,
    };

    updateState((state) => ({
      ...state,
      charts: {
        ...state.charts,
        phase: "loading",
        error: null,
        request: nextRequest,
      },
    }));

    try {
      const page = await service.queryCharts(nextRequest);
      if (chartRequestId !== requestId) {
        return null;
      }

      updateState((state) => ({
        ...state,
        charts: {
          ...state.charts,
          phase: "ready",
          request: nextRequest,
          page,
        },
      }));

      return page;
    } catch (error) {
      if (chartRequestId !== requestId) {
        return null;
      }

      updateState((state) => ({
        ...state,
        lastError: service.formatError(error),
        charts: {
          ...state.charts,
          phase: "failed",
          error: service.formatError(error),
          request: nextRequest,
        },
      }));
      return null;
    }
  }

  async function runExport(
    request: Omit<LogExportRequest, "entry_id" | "instance_id"> & { entry_id?: string },
    options: { origin?: LogsExportOrigin } = {},
  ) {
    const selectedEntryId = request.entry_id ?? get(store).library.selectedEntryId;
    if (!selectedEntryId) {
      updateState((state) => ({
        ...state,
        export: {
          ...state.export,
          origin: null,
          phase: "failed",
          error: "Select a log before exporting.",
        },
      }));
      return null;
    }

    const requestId = exportRequestId + 1;
    exportRequestId = requestId;
    exportOrigin = options.origin ?? "raw-browser";
    const instance_id = `export-${requestId}`;
    const nextRequest: LogExportRequest = {
      entry_id: selectedEntryId,
      instance_id,
      ...request,
    };

    updateState((state) => ({
      ...state,
      export: {
        origin: exportOrigin,
        phase: "exporting",
        error: null,
        request: nextRequest,
        progress: null,
        result: null,
      },
    }));

    try {
      const result = await service.exportLog(nextRequest);
      if (exportRequestId !== requestId) {
        return null;
      }

      updateState((state) => ({
        ...state,
        export: {
          ...state.export,
          origin: exportOrigin,
          phase: "completed",
          request: nextRequest,
          result,
        },
      }));

      return result;
    } catch (error) {
      if (exportRequestId !== requestId) {
        return null;
      }

      updateState((state) => ({
        ...state,
        lastError: service.formatError(error),
        export: {
          ...state.export,
          origin: exportOrigin,
          phase: "failed",
          error: service.formatError(error),
          request: nextRequest,
        },
      }));
      return null;
    }
  }

  async function saveSettings(settings: RecordingSettings) {
    const requestId = recordingSettingsRequestId + 1;
    recordingSettingsRequestId = requestId;

    updateState((state) => ({
      ...state,
      recording: {
        ...state.recording,
        settingsPhase: "loading",
        error: null,
      },
    }));

    try {
      const result = await service.saveRecordingSettings(settings);
      if (recordingSettingsRequestId !== requestId) {
        return null;
      }

      updateState((state) => ({
        ...state,
        recording: {
          ...state.recording,
          settingsPhase: "ready",
          settings: result.settings,
        },
      }));

      return result.settings;
    } catch (error) {
      if (recordingSettingsRequestId !== requestId) {
        return null;
      }

      updateState((state) => ({
        ...state,
        lastError: service.formatError(error),
        recording: {
          ...state.recording,
          settingsPhase: "failed",
          error: service.formatError(error),
        },
      }));
      return null;
    }
  }

  async function startRecordingAt(path: string) {
    try {
      await service.startRecording(path);
      await refreshRecordingStatus();
      return get(store).recording.status;
    } catch (error) {
      updateState((state) => ({
        ...state,
        lastError: service.formatError(error),
        recording: {
          ...state.recording,
          statusPhase: "failed",
          error: service.formatError(error),
        },
      }));
      return null;
    }
  }

  async function stopActiveRecording() {
    try {
      await service.stopRecording();
      await refreshRecordingStatus();
      return get(store).recording.status;
    } catch (error) {
      updateState((state) => ({
        ...state,
        lastError: service.formatError(error),
        recording: {
          ...state.recording,
          statusPhase: "failed",
          error: service.formatError(error),
        },
      }));
      return null;
    }
  }

  async function cancelOperation() {
    return service.cancelOperation();
  }

  function reset() {
    clearRecordingRefreshTimer();
    stopSubscriptions?.();
    stopSubscriptions = null;
    stopSession?.();
    stopSession = null;
    initializePromise = null;
    libraryRequestId += 1;
    recordingStatusRequestId += 1;
    recordingSettingsRequestId += 1;
    rawRequestId += 1;
    chartRequestId += 1;
    exportRequestId += 1;
    invalidatePlaybackFlow();
    store.set(createInitialState());
  }

  return {
    subscribe: store.subscribe,
    initialize,
    refreshLibrary,
    selectEntry,
    setChartGroup,
    setChartCursor,
    setChartRange,
    setChartExportDestination,
    setRawFilters,
    selectRawMessage,
    registerEntry,
    registerEntryFromPicker,
    removeEntry,
    relinkEntry,
    reindexEntry,
    cancelOperation,
    ensurePlaybackReady,
    playSelected,
    pause,
    seek,
    setSpeed,
    stopReplay,
    runRawQuery,
    runChartQuery,
    runExport,
    refreshRecordingStatus,
    refreshRecordingSettings,
    saveSettings,
    startRecordingAt,
    stopActiveRecording,
    reset,
  };
}

export type LogsWorkspaceStore = ReturnType<typeof createLogsWorkspaceStore>;

export const logsWorkspace = createLogsWorkspaceStore();
