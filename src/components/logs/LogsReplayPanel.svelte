<script lang="ts">
import type { LogLibraryEntry, LogSummary } from "../../logs";
import type { PlaybackStateSnapshot, ReplayStatus } from "../../playback";
import { Button, Panel, StatusPill } from "../ui";
import { formatCount, formatUsec } from "./logs-format";

type PillTone = "neutral" | "info" | "success" | "warning" | "danger";

function mapTone(tone: "neutral" | "positive" | "caution" | "critical"): PillTone {
  switch (tone) {
    case "positive":
      return "success";
    case "caution":
      return "warning";
    case "critical":
      return "danger";
    default:
      return "neutral";
  }
}

type Props = {
  selectedEntry: LogLibraryEntry | null;
  canPreparePlayback: boolean;
  canPlayPlayback: boolean;
  playbackState: PlaybackStateSnapshot;
  playbackStatus: ReplayStatus;
  playbackError: string | null;
  openedSummary: LogSummary | null;
  playbackLabel: string;
  replaySessionActive: boolean;
  canSeekTimeline: boolean;
  playbackCursorUsec: number;
  playbackRangeStartUsec: number;
  playbackRangeEndUsec: number;
  syncedChartCursorUsec: number;
  playbackProgress: number;
  chartSelectedRangeStart: number | null;
  chartSelectedRangeEnd: number | null;
  chartSelectedRangeLeft: number;
  chartSelectedRangeWidth: number;
  onPrepare: () => void;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onSeek: (event: Event) => void;
  onSpeedChange: (speed: number) => void;
  onSendPathToMap: () => void;
  onSendReplayMarker: () => void;
};

let {
  selectedEntry,
  canPreparePlayback,
  canPlayPlayback,
  playbackState,
  playbackStatus,
  playbackError,
  openedSummary,
  playbackLabel,
  replaySessionActive,
  canSeekTimeline,
  playbackCursorUsec,
  playbackRangeStartUsec,
  playbackRangeEndUsec,
  syncedChartCursorUsec,
  playbackProgress,
  chartSelectedRangeStart,
  chartSelectedRangeEnd,
  chartSelectedRangeLeft,
  chartSelectedRangeWidth,
  onPrepare,
  onPlay,
  onPause,
  onStop,
  onSeek,
  onSpeedChange,
  onSendPathToMap,
  onSendReplayMarker,
}: Props = $props();

let playbackTone = $derived(
  playbackStatus === "playing"
    ? "positive"
    : playbackStatus === "error"
      ? "critical"
      : playbackStatus === "seeking" || playbackStatus === "loading"
        ? "caution"
        : "neutral",
);
</script>

<Panel testId="logs-replay-panel">
  <div class="logs-replay">
    <div class="logs-card__header">
      <div>
        <p class="logs-card__eyebrow">Replay</p>
        <h3 class="logs-card__title">Playback controls and timeline cursor</h3>
        <p class="logs-card__copy">Replay bootstraps through the shared session store, then keeps speed, seeking, and stop on the Task 11 controller boundary.</p>
      </div>

      <StatusPill tone={mapTone(playbackTone)} testId="logs-playback-status-pill">
        {playbackStatus}
      </StatusPill>
    </div>

    <div class="logs-replay__status-row">
      <div>
        <p class="logs-replay__status" data-testid="logs-playback-label">{playbackLabel}</p>
        {#if playbackError}
          <p aria-live={playbackStatus === "error" ? "assertive" : "polite"} aria-atomic="true" class="logs-card__copy" data-testid="logs-playback-error" role={playbackStatus === "error" ? "alert" : "status"}>{playbackError}</p>
        {:else if openedSummary}
          <p class="logs-card__copy">{openedSummary.file_name} · {formatCount(openedSummary.total_entries)} entries</p>
        {/if}
      </div>

      <div class="logs-replay__actions">
        <Button testId="logs-prepare-playback" disabled={!canPreparePlayback} onclick={onPrepare}>
          Prepare
        </Button>
        <Button tone="accent" testId="logs-play-button" disabled={!canPlayPlayback} onclick={onPlay}>
          {playbackStatus === "playing" ? "Replay active" : "Play"}
        </Button>
        <Button testId="logs-pause-button" disabled={!replaySessionActive || playbackStatus === "paused"} onclick={onPause}>
          Pause
        </Button>
        <Button tone="danger" testId="logs-stop-button" disabled={!replaySessionActive} onclick={onStop}>
          Stop
        </Button>
      </div>
    </div>

    <div class="logs-timeline">
      <div class="logs-timeline__header">
        <span class="logs-card__eyebrow">Timeline</span>
        <span class="logs-timeline__time" data-testid="logs-timeline-time">
          {formatUsec(syncedChartCursorUsec, playbackRangeStartUsec)} / {formatUsec(playbackRangeEndUsec, playbackRangeStartUsec)}
        </span>
      </div>

      <div class="logs-timeline__track" aria-hidden="true">
        {#if chartSelectedRangeStart != null && chartSelectedRangeEnd != null}
          <div
            class="logs-timeline__selection"
            data-testid="logs-timeline-selection"
            style={`left: ${chartSelectedRangeLeft}%; width: ${chartSelectedRangeWidth}%`}
          ></div>
        {/if}
        <div class="logs-timeline__track-fill" style={`width: ${playbackProgress}%`}></div>
        <div class="logs-timeline__cursor" style={`left: ${playbackProgress}%`}></div>
      </div>

      <input
        class="logs-timeline__range"
        data-testid="logs-timeline-range"
        disabled={!canSeekTimeline}
        max={playbackRangeEndUsec}
        min={playbackRangeStartUsec}
        onchange={onSeek}
        step="100000"
        type="range"
        value={playbackCursorUsec}
      />

      <div class="logs-timeline__footer">
        <label class="logs-field logs-field--compact">
          <span class="logs-field__label">Speed</span>
          <select
            class="logs-select"
            data-testid="logs-speed-select"
            disabled={selectedEntry == null}
            onchange={(event) => onSpeedChange(Number.parseFloat((event.currentTarget as HTMLSelectElement).value))}
            value={String(playbackState.speed)}
          >
            {#each playbackState.available_speeds as speed (speed)}
              <option value={speed}>{speed}x</option>
            {/each}
          </select>
        </label>

        <div class="logs-timeline__handoff">
          <Button testId="logs-map-path-button" disabled={selectedEntry == null} onclick={onSendPathToMap}>
            Send path to map
          </Button>
          <Button testId="logs-map-marker-button" disabled={selectedEntry == null || !replaySessionActive} onclick={onSendReplayMarker}>
            Send replay marker
          </Button>
        </div>
      </div>
    </div>
  </div>
</Panel>

<style>
  .logs-replay {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
  }

  .logs-card__header,
  .logs-replay__status-row,
  .logs-timeline__header,
  .logs-timeline__footer {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .logs-card__eyebrow,
  .logs-field__label {
    margin: 0;
    color: var(--color-text-muted);
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .logs-card__title {
    margin: 4px 0 0;
    color: var(--color-text-primary);
    font-size: 0.98rem;
    font-weight: 600;
  }

  .logs-card__copy,
  .logs-replay__status {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: 0.8rem;
    line-height: 1.5;
  }

  .logs-replay__status {
    color: var(--color-text-primary);
    font-size: 0.86rem;
    font-weight: 600;
  }

  .logs-replay__actions,
  .logs-timeline__handoff {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .logs-timeline {
    display: flex;
    flex-direction: column;
    gap: 10px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-bg-primary);
    padding: 12px;
  }

  .logs-timeline__track {
    position: relative;
    width: 100%;
    height: 6px;
    border-radius: 999px;
    background: var(--color-border);
    overflow: hidden;
  }

  .logs-timeline__track-fill {
    position: absolute;
    inset: 0 auto 0 0;
    background: var(--color-accent);
  }

  .logs-timeline__selection {
    position: absolute;
    top: 0;
    bottom: 0;
    border-radius: 999px;
    background: color-mix(in srgb, var(--color-warning) 35%, transparent);
  }

  .logs-timeline__cursor {
    position: absolute;
    top: -3px;
    bottom: -3px;
    width: 2px;
    background: color-mix(in srgb, var(--color-warning) 80%, white);
    transform: translateX(-50%);
  }

  .logs-timeline__range {
    width: 100%;
  }

  .logs-timeline__time {
    color: var(--color-text-muted);
    font-family: "JetBrains Mono", monospace;
    font-size: 0.73rem;
    font-variant-numeric: tabular-nums;
  }

  .logs-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .logs-field--compact {
    min-width: 100px;
  }

  .logs-select {
    width: 100%;
    min-width: 0;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    background: var(--color-bg-input);
    color: var(--color-text-primary);
    font-size: 0.8rem;
    padding: 0.55rem 0.7rem;
  }

  @media (max-width: 720px) {
    .logs-card__header,
    .logs-replay__status-row,
    .logs-timeline__header,
    .logs-timeline__footer {
      flex-direction: column;
      align-items: stretch;
    }
  }
</style>
