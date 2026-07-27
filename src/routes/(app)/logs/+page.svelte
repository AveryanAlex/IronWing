<script lang="ts">
import { onDestroy, onMount } from "svelte";
import { get } from "svelte/store";

import { getLogsWorkspaceRouteContext, type LogsWorkspaceRouteContext } from "../../../app/shell/runtime-context";
import { logsWorkspace, type LogsWorkspaceStore } from "../../../lib/stores/logs-workspace";
import { notifyError, notifyInfo, notifySuccess, notifyWarning } from "../../../lib/notifications";
import { Button, Panel, Progress, WorkspaceShell } from "../../../components/ui";
import LogCharts from "../../../features/logs/components/LogCharts.svelte";
import LogsRawMessagesPanel from "../../../features/logs/components/LogsRawMessagesPanel.svelte";
import LogsDetailsPanel from "../../../features/logs/components/LogsDetailsPanel.svelte";
import LogsLibraryPanel from "../../../features/logs/components/LogsLibraryPanel.svelte";
import LogsRecordingPanel from "../../../features/logs/components/LogsRecordingPanel.svelte";
import LogsReplayPanel from "../../../features/logs/components/LogsReplayPanel.svelte";
import {
  createLogRecordingFileIo,
  defaultManualRecordingPath,
  type LogRecordingFileIo,
} from "../../../features/logs/log-recording-file-io";
import { isReplayableEntry } from "../../../features/logs/log-entry-capabilities";
import type { LogsWorkspaceMapHandoff } from "../../../features/logs/logs-workspace-types";

const defaultRouteContext = resolveLogsWorkspaceRouteContext();

function resolveLogsWorkspaceRouteContext(): LogsWorkspaceRouteContext {
  try {
    return getLogsWorkspaceRouteContext();
  } catch {
    return {
      async handleLogsMapHandoff() {},
    };
  }
}

type Props = {
  store?: LogsWorkspaceStore;
  recordingFileIo?: LogRecordingFileIo;
  onMapHandoff?: (handoff: LogsWorkspaceMapHandoff) => void;
};

let {
  store = logsWorkspace,
  recordingFileIo = createLogRecordingFileIo(),
  onMapHandoff = defaultRouteContext.handleLogsMapHandoff,
}: Props = $props();

let importPath = $state("");
let relinkPath = $state("");
let recordingPath = $state("");

let workspace = $derived($store);
let entries = $derived(workspace.library.catalog?.entries ?? []);
let selectedEntry = $derived(
  workspace.library.catalog?.entries.find((entry) => entry.entry_id === workspace.library.selectedEntryId) ?? null,
);
let loadedEntry = $derived(
  workspace.library.catalog?.entries.find((entry) => entry.entry_id === workspace.library.loadedEntryId) ?? null,
);
let playbackState = $derived(workspace.playback.state);
let playbackEntry = $derived(
  workspace.library.catalog?.entries.find((entry) => entry.entry_id === playbackState.entry_id) ?? loadedEntry ?? null,
);
let playbackStatus = $derived(playbackState.status);
let playbackRangeStartUsec = $derived(
  playbackState.start_usec ?? playbackEntry?.metadata.start_usec ?? selectedEntry?.metadata.start_usec ?? 0,
);
let playbackRangeEndUsec = $derived(
  playbackState.end_usec ??
    playbackEntry?.metadata.end_usec ??
    selectedEntry?.metadata.end_usec ??
    playbackRangeStartUsec,
);
let playbackCursorUsec = $derived(playbackState.cursor_usec ?? playbackRangeStartUsec);
let syncedChartCursorUsec = $derived(workspace.charts.hoveredCursorUsec ?? playbackCursorUsec);
let playbackProgress = $derived(
  playbackRangeEndUsec > playbackRangeStartUsec
    ? Math.max(
        0,
        Math.min(
          100,
          ((syncedChartCursorUsec - playbackRangeStartUsec) / (playbackRangeEndUsec - playbackRangeStartUsec)) * 100,
        ),
      )
    : 0,
);
let chartSelectedRangeStart = $derived(workspace.charts.selectedRange?.startUsec ?? null);
let chartSelectedRangeEnd = $derived(workspace.charts.selectedRange?.endUsec ?? null);
let chartSelectedRangeLeft = $derived(
  chartSelectedRangeStart == null || playbackRangeEndUsec <= playbackRangeStartUsec
    ? 0
    : Math.max(
        0,
        Math.min(
          100,
          ((chartSelectedRangeStart - playbackRangeStartUsec) / (playbackRangeEndUsec - playbackRangeStartUsec)) * 100,
        ),
      ),
);
let chartSelectedRangeWidth = $derived(
  chartSelectedRangeStart == null || chartSelectedRangeEnd == null || playbackRangeEndUsec <= playbackRangeStartUsec
    ? 0
    : Math.max(
        0,
        Math.min(
          100,
          ((chartSelectedRangeEnd - chartSelectedRangeStart) / (playbackRangeEndUsec - playbackRangeStartUsec)) * 100,
        ),
      ),
);
let recordingStatus = $derived(workspace.recording.status);
let selectedEntryReplayable = $derived(isReplayableEntry(selectedEntry));
let supportsRecordingPicker = $derived(recordingFileIo.supportsManualPicker());
let replaySessionActive = $derived(workspace.effectiveSource === "playback" && playbackStatus !== "idle");
let replayTargetEntry = $derived(replaySessionActive ? playbackEntry : selectedEntry);
let canSeekTimeline = $derived(playbackRangeEndUsec > playbackRangeStartUsec && replayTargetEntry !== null);
let recordingAndReplayOverlap = $derived(
  replaySessionActive && (recordingStatus.kind === "recording" || recordingStatus.kind === "stopping"),
);
let hasCancelableOperation = $derived(
  workspace.operationProgress !== null &&
    workspace.operationProgress.phase !== "completed" &&
    workspace.operationProgress.phase !== "failed" &&
    workspace.operationProgress.phase !== "cancelled",
);
let canPreparePlayback = $derived(selectedEntryReplayable);
let canPlayPlayback = $derived(selectedEntryReplayable && !workspace.playback.bootstrapping);

onMount(() => {
  void store.initialize();
});

onDestroy(() => {
  if (store === logsWorkspace) {
    store.reset();
  }
});

$effect(() => {
  relinkPath = selectedEntry?.source.original_path ?? "";
});

$effect(() => {
  if (recordingPath.length > 0 || workspace.recording.settings?.auto_record_directory == null) {
    return;
  }

  recordingPath = defaultManualRecordingPath(workspace.recording.settings.auto_record_directory);
});

function playbackLabel(): string {
  switch (playbackStatus) {
    case "idle":
      return workspace.effectiveSource === "playback" ? "Stopping replay and restoring live data" : "Replay idle";
    case "loading":
      return "Opening replay source";
    case "ready":
      return "Replay ready";
    case "playing":
      return "Replaying telemetry";
    case "paused":
      return "Replay paused";
    case "seeking":
      return "Seeking replay cursor";
    case "ended":
      return "Replay reached the final frame";
    case "error":
      return "Replay error";
  }
}

function recordingLabel(): string {
  switch (recordingStatus.kind) {
    case "idle":
      return "Recorder idle";
    case "recording":
      return `Recording ${recordingStatus.file_name}`;
    case "stopping":
      return `Finalizing ${recordingStatus.file_name}`;
    case "failed":
      return `Recording failed: ${recordingStatus.failure.reason}`;
  }
}

async function handleRegisterEntry() {
  const nextPath = importPath.trim();
  if (nextPath.length === 0) {
    return;
  }

  const result = await store.registerEntry(nextPath);
  if (result) {
    importPath = "";
    notifySuccess("Log registered", {
      id: "logs-library-register",
      description: result.metadata.display_name,
    });
  } else {
    notifyActionError("Could not register the log", "logs-library-register", get(store).library.error);
  }
}

async function handleRegisterEntryFromPicker() {
  const result = await store.registerEntryFromPicker();
  if (result) {
    notifySuccess("Log registered", {
      id: "logs-library-register",
      description: result.metadata.display_name,
    });
  } else {
    notifyActionError("Could not register the log", "logs-library-register", get(store).library.error);
  }
}

async function handleRelinkEntry() {
  if (!selectedEntry) {
    return;
  }

  const nextPath = relinkPath.trim();
  if (nextPath.length === 0) {
    return;
  }

  const result = await store.relinkEntry(selectedEntry.entry_id, nextPath);
  if (result) {
    notifySuccess("Log relinked", {
      id: "logs-library-relink",
      description: result.metadata.display_name,
    });
  } else {
    notifyActionError("Could not relink the log", "logs-library-relink", get(store).library.error);
  }
}

async function handleToggleAutoRecord() {
  if (!workspace.recording.settings) {
    return;
  }

  const enabled = !workspace.recording.settings.auto_record_on_connect;
  const result = await store.saveSettings({
    ...workspace.recording.settings,
    auto_record_on_connect: enabled,
  });
  const error = get(store).recording.error;
  if (result && !error) {
    notifySuccess(`Auto-record ${enabled ? "enabled" : "disabled"}`, {
      id: "logs-recording-settings",
    });
  } else {
    notifyActionError("Could not update auto-record", "logs-recording-settings", error);
  }
}

async function handleTimelineSeek(event: Event) {
  const target = event.currentTarget as HTMLInputElement;
  const nextCursorUsec = Number.parseInt(target.value, 10);
  if (Number.isNaN(nextCursorUsec)) {
    return;
  }

  const result = await store.seek(nextCursorUsec);
  if (!result) {
    notifyActionError("Could not seek replay", "logs-replay-action", get(store).playback.error);
  }
}

async function handleStartRecording() {
  try {
    const nextPath = supportsRecordingPicker
      ? await recordingFileIo.pickManualRecordingPath({
          suggestedPath: recordingPath.trim(),
        })
      : recordingPath.trim();

    if (!nextPath || nextPath.trim().length === 0) {
      return;
    }

    recordingPath = nextPath;
    const result = await store.startRecordingAt(nextPath);
    const error = get(store).recording.error;
    if (result && !error) {
      notifySuccess("Recording started", {
        id: "logs-recording-action",
        description: nextPath,
      });
    } else {
      notifyActionError("Could not start recording", "logs-recording-action", error);
    }
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim().length > 0
        ? error.message
        : typeof error === "string" && error.trim().length > 0
          ? error
          : "Unable to choose a recording destination.";
    notifyError("Could not choose a recording destination", {
      id: "logs-recording-picker",
      description: message,
    });
  }
}

function notifyActionError(title: string, id: string, error: string | null): void {
  if (!error) {
    return;
  }

  notifyError(title, { id, description: error });
}

async function handleRefreshLibrary() {
  await store.refreshLibrary();
  notifyActionError("Could not refresh the log library", "logs-library-refresh", get(store).library.error);
}

async function handleRemoveEntry() {
  if (!selectedEntry) {
    return;
  }

  const displayName = selectedEntry.metadata.display_name;
  const result = await store.removeEntry(selectedEntry.entry_id);
  if (result) {
    notifySuccess("Log removed from the library", {
      id: "logs-library-remove",
      description: displayName,
    });
  } else {
    notifyActionError("Could not remove the log", "logs-library-remove", get(store).library.error);
  }
}

async function handleReindexEntry() {
  if (!selectedEntry) {
    return;
  }

  const result = await store.reindexEntry(selectedEntry.entry_id);
  if (result) {
    notifySuccess("Log reindexed", {
      id: "logs-library-reindex",
      description: result.metadata.display_name,
    });
  } else {
    notifyActionError("Could not reindex the log", "logs-library-reindex", get(store).library.error);
  }
}

async function handlePlaybackAction(action: () => Promise<unknown>, failureTitle: string): Promise<void> {
  const result = await action();
  if (!result) {
    notifyActionError(failureTitle, "logs-replay-action", get(store).playback.error);
  }
}

async function handleRawQuery(request: Parameters<LogsWorkspaceStore["runRawQuery"]>[0]) {
  const result = await store.runRawQuery(request);
  if (!result) {
    notifyActionError("Raw-message query failed", "logs-raw-query", get(store).rawBrowser.error);
  }
}

async function handleChartQuery(request: Parameters<LogsWorkspaceStore["runChartQuery"]>[0]) {
  const result = await store.runChartQuery(request);
  if (!result) {
    notifyActionError("Chart query failed", "logs-chart-query", get(store).charts.error);
  }
}

async function handleExport(request: Parameters<LogsWorkspaceStore["runExport"]>[0], origin: "raw-browser" | "chart") {
  const result = await store.runExport(request, { origin });
  if (result) {
    notifySuccess("Log export complete", {
      id: `logs-${origin}-export`,
      description: `${result.rows_written.toLocaleString()} rows written to ${result.destination_path}.`,
    });
  } else {
    notifyActionError("Log export failed", `logs-${origin}-export`, get(store).export.error);
  }
}

async function handleStopRecording() {
  const result = await store.stopActiveRecording();
  const error = get(store).recording.error;
  if (result && !error) {
    notifySuccess("Recording stopped", { id: "logs-recording-action" });
  } else {
    notifyActionError("Could not stop recording", "logs-recording-action", error);
  }
}

async function handleCancelOperation() {
  const cancelled = await store.cancelOperation();
  if (cancelled) {
    notifyInfo("Cancellation requested", { id: "logs-operation-cancel" });
  } else {
    notifyWarning("The log operation could not be cancelled", { id: "logs-operation-cancel" });
  }
}

function emitPathHandoff() {
  if (!replayTargetEntry) {
    return;
  }

  onMapHandoff({
    kind: "path",
    entryId: replayTargetEntry.entry_id,
    startUsec: playbackState.start_usec ?? replayTargetEntry.metadata.start_usec,
    endUsec: playbackState.end_usec ?? replayTargetEntry.metadata.end_usec,
  });
}

function emitMarkerHandoff() {
  if (!replaySessionActive || !playbackEntry) {
    return;
  }

  onMapHandoff({
    kind: "replay_marker",
    entryId: playbackEntry.entry_id,
    cursorUsec: playbackState.cursor_usec,
  });
}
</script>

<WorkspaceShell mode="inset" testId="logs-workspace-root">
  {#if workspace.operationProgress}
    <Panel testId="logs-progress-banner">
      <div aria-atomic="true" aria-live="polite" class="flex flex-col gap-3" role="status">
        <div class="flex items-start justify-between gap-3 max-md:flex-col max-md:items-stretch">
          <div>
            <p class="m-0 text-xs font-semibold uppercase tracking-wide text-text-muted">Operation progress</p>
            <h3 class="mt-1 m-0 text-base font-semibold text-text-primary">{workspace.operationProgress.phase.replace(/_/g, " ")}</h3>
            {#if workspace.operationProgress.message}
              <p class="m-0 text-sm leading-6 text-text-secondary">{workspace.operationProgress.message}</p>
            {/if}
          </div>

          {#if hasCancelableOperation}
            <Button onclick={() => void handleCancelOperation()}>Cancel</Button>
          {/if}
        </div>

        <Progress value={workspace.operationProgress.percent ?? undefined} ariaLabel="Log operation progress" />

        <div class="flex items-start justify-between gap-3 text-sm leading-6 text-text-secondary max-md:flex-col max-md:items-stretch">
          <span>{workspace.operationProgress.completed_items.toLocaleString()} completed</span>
          <span>{workspace.operationProgress.total_items == null ? "total pending" : `${workspace.operationProgress.total_items.toLocaleString()} total`}</span>
          <span>{workspace.operationProgress.percent == null ? "estimating" : `${workspace.operationProgress.percent}%`}</span>
        </div>
      </div>
    </Panel>
  {/if}

  <div class="mb-2 grid min-h-0 items-start gap-3 [grid-template-columns:minmax(300px,0.9fr)_minmax(0,1.65fr)] max-lg:grid-cols-1">
    <div class="flex min-w-0 flex-col gap-3 self-start max-lg:self-stretch">
      <LogsLibraryPanel
        {entries}
        importPath={importPath}
        libraryError={workspace.library.error}
        libraryPhase={workspace.library.phase}
        loadedEntryId={workspace.library.loadedEntryId}
        onImportPathChange={(path) => (importPath = path)}
        onRefresh={() => void handleRefreshLibrary()}
        onRegisterFromPicker={() => void handleRegisterEntryFromPicker()}
        onRegisterPath={() => void handleRegisterEntry()}
        onSelectEntry={(entryId) => store.selectEntry(entryId)}
        selectedEntryId={workspace.library.selectedEntryId}
      />

      <LogsDetailsPanel
        libraryPhase={workspace.library.phase}
        loadedEntryId={loadedEntry?.entry_id ?? null}
        onReindex={() => void handleReindexEntry()}
        onRelink={() => void handleRelinkEntry()}
        onRelinkPathChange={(path) => (relinkPath = path)}
        onRemove={() => void handleRemoveEntry()}
        relinkPath={relinkPath}
        {selectedEntry}
      />
    </div>

    <div class="flex min-w-0 flex-col gap-3 self-start pb-6 max-lg:self-stretch">
      <LogsRecordingPanel
        autoRecordDirectory={workspace.recording.settings?.auto_record_directory ?? null}
        autoRecordEnabled={workspace.recording.settings?.auto_record_on_connect ?? false}
        hasSettings={workspace.recording.settings != null}
        onRecordingPathChange={(path) => (recordingPath = path)}
        onToggleAutoRecord={() => void handleToggleAutoRecord()}
        onToggleRecording={() => void (recordingStatus.kind === "recording" ? handleStopRecording() : handleStartRecording())}
        recordingAndReplayOverlap={recordingAndReplayOverlap}
        recordingError={workspace.recording.error}
        recordingLabel={recordingLabel()}
        recordingPath={recordingPath}
        recordingStatus={recordingStatus}
        settingsLoading={workspace.recording.settingsPhase === "loading"}
        supportsRecordingPicker={supportsRecordingPicker}
      />

      <LogsReplayPanel
        {canPlayPlayback}
        {canPreparePlayback}
        canSeekTimeline={canSeekTimeline}
        chartSelectedRangeEnd={chartSelectedRangeEnd}
        chartSelectedRangeLeft={chartSelectedRangeLeft}
        chartSelectedRangeStart={chartSelectedRangeStart}
        chartSelectedRangeWidth={chartSelectedRangeWidth}
        onPause={() => void handlePlaybackAction(() => store.pause(), "Could not pause replay")}
        onPlay={() => void handlePlaybackAction(() => store.playSelected(), "Could not start replay")}
        onPrepare={() => void handlePlaybackAction(() => store.ensurePlaybackReady(), "Could not prepare replay")}
        onSeek={handleTimelineSeek}
        onSendPathToMap={emitPathHandoff}
        onSendReplayMarker={emitMarkerHandoff}
        onSpeedChange={(speed) => void handlePlaybackAction(() => store.setSpeed(speed), "Could not change replay speed")}
        onStop={() => void handlePlaybackAction(() => store.stopReplay(), "Could not stop replay")}
        openedSummary={workspace.playback.openedSummary}
        playbackCursorUsec={playbackCursorUsec}
        playbackError={workspace.playback.error}
        playbackLabel={playbackLabel()}
        playbackProgress={playbackProgress}
        playbackRangeEndUsec={playbackRangeEndUsec}
        playbackRangeStartUsec={playbackRangeStartUsec}
        {playbackState}
        {playbackStatus}
        replaySessionActive={replaySessionActive}
        {selectedEntry}
        syncedChartCursorUsec={syncedChartCursorUsec}
      />

      <LogsRawMessagesPanel
        entry={selectedEntry}
        exportState={workspace.export}
        onExport={(request) => void handleExport(request, "raw-browser")}
        onFiltersChange={(filters) => store.setRawFilters(filters)}
        onRunQuery={(request) => void handleRawQuery(request)}
        onSelectSequence={(sequence) => store.selectRawMessage(sequence)}
        rawBrowser={workspace.rawBrowser}
      />

      <LogCharts
        chartState={workspace.charts}
        entry={selectedEntry}
        exportState={workspace.export}
        onExportDestinationChange={(path) => store.setChartExportDestination(path)}
        onExportSelectedRange={({ destinationPath, startUsec, endUsec, messageTypes }) =>
          void handleExport({
            destination_path: destinationPath,
            format: "csv",
            start_usec: startUsec,
            end_usec: endUsec,
            message_types: messageTypes,
            text: null,
            field_filters: [],
          }, "chart")}
        onHoverCursor={(cursorUsec) => store.setChartCursor(cursorUsec)}
        onRequestChartRange={({ selectors, start_usec, end_usec, max_points }) =>
          void handleChartQuery({
            selectors,
            start_usec,
            end_usec,
            max_points,
          })}
        onSelectGroup={(groupKey) => store.setChartGroup(groupKey)}
        onSelectRange={(startUsec, endUsec) => store.setChartRange(startUsec, endUsec)}
        playbackCursorUsec={playbackCursorUsec}
        playbackRangeEndUsec={playbackRangeEndUsec}
        playbackRangeStartUsec={playbackRangeStartUsec}
      />
    </div>
  </div>
</WorkspaceShell>
