<script lang="ts">
import { onDestroy, onMount } from "svelte";

import { logsWorkspace, type LogsWorkspaceStore } from "../../lib/stores/logs-workspace";
import LogCharts from "./LogCharts.svelte";
import LogsRawMessagesPanel from "./LogsRawMessagesPanel.svelte";
import LogsDetailsPanel from "./LogsDetailsPanel.svelte";
import LogsLibraryPanel from "./LogsLibraryPanel.svelte";
import LogsRecordingPanel from "./LogsRecordingPanel.svelte";
import LogsReplayPanel from "./LogsReplayPanel.svelte";
import { createLogRecordingFileIo, defaultManualRecordingPath, type LogRecordingFileIo } from "./log-recording-file-io";
import { isReplayableEntry } from "./log-entry-capabilities";
import type { LogsWorkspaceMapHandoff } from "./logs-workspace-types";

type Props = {
  store?: LogsWorkspaceStore;
  recordingFileIo?: LogRecordingFileIo;
  onMapHandoff?: (handoff: LogsWorkspaceMapHandoff) => void;
};

let {
  store = logsWorkspace,
  recordingFileIo = createLogRecordingFileIo(),
  onMapHandoff = () => {},
}: Props = $props();

let importPath = $state("");
let relinkPath = $state("");
let recordingPath = $state("");
let manualRecordingError = $state<string | null>(null);

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
  workspace.library.catalog?.entries.find((entry) => entry.entry_id === playbackState.entry_id)
  ?? loadedEntry
  ?? null,
);
let playbackStatus = $derived(playbackState.status);
let playbackRangeStartUsec = $derived(playbackState.start_usec ?? playbackEntry?.metadata.start_usec ?? selectedEntry?.metadata.start_usec ?? 0);
let playbackRangeEndUsec = $derived(playbackState.end_usec ?? playbackEntry?.metadata.end_usec ?? selectedEntry?.metadata.end_usec ?? playbackRangeStartUsec);
let playbackCursorUsec = $derived(playbackState.cursor_usec ?? playbackRangeStartUsec);
let syncedChartCursorUsec = $derived(workspace.charts.hoveredCursorUsec ?? playbackCursorUsec);
let playbackProgress = $derived(
  playbackRangeEndUsec > playbackRangeStartUsec
    ? Math.max(
        0,
        Math.min(100, ((syncedChartCursorUsec - playbackRangeStartUsec) / (playbackRangeEndUsec - playbackRangeStartUsec)) * 100),
      )
    : 0,
);
let chartSelectedRangeStart = $derived(workspace.charts.selectedRange?.startUsec ?? null);
let chartSelectedRangeEnd = $derived(workspace.charts.selectedRange?.endUsec ?? null);
let chartSelectedRangeLeft = $derived(
  chartSelectedRangeStart == null || playbackRangeEndUsec <= playbackRangeStartUsec
    ? 0
    : Math.max(0, Math.min(100, ((chartSelectedRangeStart - playbackRangeStartUsec) / (playbackRangeEndUsec - playbackRangeStartUsec)) * 100)),
);
let chartSelectedRangeWidth = $derived(
  chartSelectedRangeStart == null || chartSelectedRangeEnd == null || playbackRangeEndUsec <= playbackRangeStartUsec
    ? 0
    : Math.max(0, Math.min(100, ((chartSelectedRangeEnd - chartSelectedRangeStart) / (playbackRangeEndUsec - playbackRangeStartUsec)) * 100)),
);
let recordingStatus = $derived(workspace.recording.status);
let selectedEntryReplayable = $derived(isReplayableEntry(selectedEntry));
let supportsRecordingPicker = $derived(recordingFileIo.supportsManualPicker());
let replaySessionActive = $derived(
  workspace.effectiveSource === "playback"
  && playbackStatus !== "idle",
);
let replayTargetEntry = $derived(replaySessionActive ? playbackEntry : selectedEntry);
let canSeekTimeline = $derived(playbackRangeEndUsec > playbackRangeStartUsec && replayTargetEntry !== null);
let recordingAndReplayOverlap = $derived(
  replaySessionActive
  && (recordingStatus.kind === "recording" || recordingStatus.kind === "stopping"),
);
let hasCancelableOperation = $derived(
  workspace.operationProgress !== null
  && workspace.operationProgress.phase !== "completed"
  && workspace.operationProgress.phase !== "failed"
  && workspace.operationProgress.phase !== "cancelled",
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
  }
}

async function handleRegisterEntryFromPicker() {
  await store.registerEntryFromPicker();
}

async function handleRelinkEntry() {
  if (!selectedEntry) {
    return;
  }

  const nextPath = relinkPath.trim();
  if (nextPath.length === 0) {
    return;
  }

  await store.relinkEntry(selectedEntry.entry_id, nextPath);
}

async function handleToggleAutoRecord() {
  if (!workspace.recording.settings) {
    return;
  }

  await store.saveSettings({
    ...workspace.recording.settings,
    auto_record_on_connect: !workspace.recording.settings.auto_record_on_connect,
  });
}

async function handleTimelineSeek(event: Event) {
  const target = event.currentTarget as HTMLInputElement;
  const nextCursorUsec = Number.parseInt(target.value, 10);
  if (Number.isNaN(nextCursorUsec)) {
    return;
  }

  await store.seek(nextCursorUsec);
}

async function handleStartRecording() {
  manualRecordingError = null;

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
    await store.startRecordingAt(nextPath);
  } catch (error) {
    manualRecordingError = error instanceof Error && error.message.trim().length > 0
      ? error.message
      : typeof error === "string" && error.trim().length > 0
        ? error
        : "Unable to choose a recording destination.";
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

<section class="logs-workspace" data-testid="logs-workspace-root">
  <header class="logs-workspace__header">
    <div>
      <p class="logs-workspace__eyebrow">Logs workspace</p>
      <h2 class="logs-workspace__title">Referenced library, replay control, and map handoff</h2>
      <p class="logs-workspace__copy">
        Browse the indexed library, preserve truthful missing or corrupt states, and drive replay without hiding the active live session boundary.
      </p>
    </div>

    <div class="logs-workspace__header-status">
      <span class="logs-pill" data-tone={workspace.effectiveSource === "playback" ? "caution" : "neutral"}>
        effective source · {workspace.effectiveSource}
      </span>
      <span class="logs-pill" data-tone={workspace.phase === "ready" ? "positive" : "neutral"}>
        workspace · {workspace.phase}
      </span>
    </div>
  </header>

  {#if workspace.lastError}
    <div aria-live="assertive" aria-atomic="true" class="logs-banner" data-tone="critical" data-testid="logs-workspace-last-error" role="alert">
      {workspace.lastError}
    </div>
  {/if}

  {#if workspace.operationProgress}
    <section aria-atomic="true" aria-live="polite" class="logs-card logs-progress" data-testid="logs-progress-banner" role="status">
      <div class="logs-progress__summary">
        <div>
          <p class="logs-card__eyebrow">Operation progress</p>
          <h3 class="logs-card__title">{workspace.operationProgress.phase.replace(/_/g, " ")}</h3>
          {#if workspace.operationProgress.message}
            <p class="logs-card__copy">{workspace.operationProgress.message}</p>
          {/if}
        </div>

        {#if hasCancelableOperation}
          <button class="logs-button logs-button--ghost" onclick={() => void store.cancelOperation()} type="button">
            Cancel
          </button>
        {/if}
      </div>

      <div class="logs-progress__meter" aria-hidden="true">
        <div class="logs-progress__fill" style={`width: ${workspace.operationProgress.percent ?? 0}%`}></div>
      </div>

      <div class="logs-progress__meta">
        <span>{workspace.operationProgress.completed_items.toLocaleString()} completed</span>
        <span>{workspace.operationProgress.total_items == null ? "total pending" : `${workspace.operationProgress.total_items.toLocaleString()} total`}</span>
        <span>{workspace.operationProgress.percent == null ? "estimating" : `${workspace.operationProgress.percent}%`}</span>
      </div>
    </section>
  {/if}

  <div class="logs-workspace__layout">
    <div class="logs-workspace__library-column">
      <LogsLibraryPanel
        {entries}
        importPath={importPath}
        libraryError={workspace.library.error}
        libraryPhase={workspace.library.phase}
        loadedEntryId={workspace.library.loadedEntryId}
        onImportPathChange={(path) => (importPath = path)}
        onRefresh={() => void store.refreshLibrary()}
        onRegisterFromPicker={() => void handleRegisterEntryFromPicker()}
        onRegisterPath={() => void handleRegisterEntry()}
        onSelectEntry={(entryId) => store.selectEntry(entryId)}
        selectedEntryId={workspace.library.selectedEntryId}
      />

      <LogsDetailsPanel
        libraryPhase={workspace.library.phase}
        loadedEntryId={loadedEntry?.entry_id ?? null}
        onReindex={() => selectedEntry && void store.reindexEntry(selectedEntry.entry_id)}
        onRelink={() => void handleRelinkEntry()}
        onRelinkPathChange={(path) => (relinkPath = path)}
        onRemove={() => selectedEntry && void store.removeEntry(selectedEntry.entry_id)}
        relinkPath={relinkPath}
        {selectedEntry}
      />
    </div>

    <div class="logs-workspace__detail-column">
      <LogsRecordingPanel
        autoRecordDirectory={workspace.recording.settings?.auto_record_directory ?? null}
        autoRecordEnabled={workspace.recording.settings?.auto_record_on_connect ?? false}
        hasSettings={workspace.recording.settings != null}
        manualRecordingError={manualRecordingError}
        onRecordingPathChange={(path) => (recordingPath = path)}
        onToggleAutoRecord={() => void handleToggleAutoRecord()}
        onToggleRecording={() => void (recordingStatus.kind === "recording" ? store.stopActiveRecording() : handleStartRecording())}
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
        onPause={() => void store.pause()}
        onPlay={() => void store.playSelected()}
        onPrepare={() => void store.ensurePlaybackReady()}
        onSeek={handleTimelineSeek}
        onSendPathToMap={emitPathHandoff}
        onSendReplayMarker={emitMarkerHandoff}
        onSpeedChange={(speed) => void store.setSpeed(speed)}
        onStop={() => void store.stopReplay()}
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
        onExport={(request) => void store.runExport(request)}
        onFiltersChange={(filters) => store.setRawFilters(filters)}
        onRunQuery={(request) => void store.runRawQuery(request)}
        onSelectSequence={(sequence) => store.selectRawMessage(sequence)}
        rawBrowser={workspace.rawBrowser}
      />

      <LogCharts
        chartState={workspace.charts}
        entry={selectedEntry}
        exportState={workspace.export}
        onExportDestinationChange={(path) => store.setChartExportDestination(path)}
        onExportSelectedRange={({ destinationPath, startUsec, endUsec, messageTypes }) =>
          void store.runExport({
            destination_path: destinationPath,
            format: "csv",
            start_usec: startUsec,
            end_usec: endUsec,
            message_types: messageTypes,
            text: null,
            field_filters: [],
          }, { origin: "chart" })}
        onHoverCursor={(cursorUsec) => store.setChartCursor(cursorUsec)}
        onRequestChartRange={({ selectors, start_usec, end_usec, max_points }) =>
          void store.runChartQuery({
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
</section>

<style>
  .logs-workspace {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    box-sizing: border-box;
    padding: 16px 16px 28px;
    scroll-padding-bottom: 28px;
    overflow-y: auto;
  }

  .logs-workspace__header,
  .logs-progress__summary,
  .logs-progress__meta {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .logs-workspace__eyebrow,
  .logs-card__eyebrow {
    margin: 0;
    color: var(--color-text-muted);
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .logs-workspace__title,
  .logs-card__title {
    margin: 0;
    color: var(--color-text-primary);
    font-weight: 600;
    letter-spacing: -0.02em;
  }

  .logs-workspace__title {
    margin-top: 6px;
    font-size: 1.4rem;
  }

  .logs-card__title {
    margin-top: 4px;
    font-size: 0.98rem;
  }

  .logs-workspace__copy,
  .logs-card__copy,
  .logs-progress__meta {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: 0.8rem;
    line-height: 1.5;
  }

  .logs-workspace__copy {
    margin-top: 8px;
    max-width: 56rem;
  }

  .logs-workspace__header-status {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .logs-workspace__layout {
    min-height: 0;
    display: grid;
    align-items: start;
    gap: 12px;
    grid-template-columns: minmax(300px, 0.9fr) minmax(0, 1.65fr);
    flex: 1;
  }

  .logs-workspace__library-column,
  .logs-workspace__detail-column {
    min-height: 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-self: start;
  }

  .logs-card {
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-bg-secondary);
    padding: 12px;
  }

  .logs-banner {
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-bg-primary);
    padding: 10px 12px;
    color: var(--color-text-secondary);
    font-size: 0.8rem;
    line-height: 1.5;
  }

  .logs-banner[data-tone="critical"] {
    border-color: color-mix(in srgb, var(--color-danger) 45%, var(--color-border));
    background: color-mix(in srgb, var(--color-danger) 10%, var(--color-bg-primary));
    color: var(--color-danger);
  }

  .logs-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--color-border-light);
    border-radius: 999px;
    background: var(--color-bg-primary);
    color: var(--color-text-secondary);
    font-size: 0.69rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 0.25rem 0.55rem;
  }

  .logs-pill[data-tone="positive"] {
    border-color: color-mix(in srgb, var(--color-success) 40%, var(--color-border-light));
    color: var(--color-success);
  }

  .logs-pill[data-tone="caution"] {
    border-color: color-mix(in srgb, var(--color-warning) 40%, var(--color-border-light));
    color: var(--color-warning);
  }

  .logs-button {
    border: 1px solid var(--color-accent);
    border-radius: 6px;
    background: color-mix(in srgb, var(--color-accent) 14%, var(--color-bg-primary));
    color: var(--color-text-primary);
    font-size: 0.78rem;
    font-weight: 600;
    padding: 0.5rem 0.8rem;
  }

  .logs-button--ghost {
    border-color: var(--color-border);
    background: var(--color-bg-primary);
    color: var(--color-text-secondary);
  }

  .logs-progress__meter {
    width: 100%;
    height: 8px;
    border-radius: 999px;
    background: var(--color-bg-primary);
    overflow: hidden;
  }

  .logs-progress__fill {
    height: 100%;
    background: var(--color-accent);
  }

  @media (max-width: 980px) {
    .logs-workspace__layout {
      grid-template-columns: 1fr;
    }

    .logs-workspace__library-column,
    .logs-workspace__detail-column {
      align-self: stretch;
    }
  }

  @media (max-width: 720px) {
    .logs-workspace__header,
    .logs-progress__summary,
    .logs-progress__meta {
      flex-direction: column;
      align-items: stretch;
    }
  }
</style>
