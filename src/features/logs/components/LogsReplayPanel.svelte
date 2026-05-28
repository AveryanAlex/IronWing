<script lang="ts">
import type { LogLibraryEntry, LogSummary } from "../../../logs";
import type { PlaybackStateSnapshot, ReplayStatus } from "../../../playback";
import { ActionRow, Button, Eyebrow, HelperText, MonoValue, NativeSelect, Panel, StatusPill } from "../../../components/ui";
import { formatCount, formatUsec } from "../logs-format";

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

let playbackTone = $derived<"neutral" | "positive" | "caution" | "critical">(
  playbackStatus === "playing"
    ? "positive"
    : playbackStatus === "error"
      ? "critical"
      : playbackStatus === "seeking" || playbackStatus === "loading"
        ? "caution"
        : "neutral",
);

const titleClass = "mt-1 m-0 text-base font-semibold text-text-primary";
</script>

<Panel testId="logs-replay-panel">
  <div class="flex min-h-0 flex-col gap-3">
    <div class="flex items-start justify-between gap-3 max-md:flex-col max-md:items-stretch">
      <div>
        <Eyebrow>Replay</Eyebrow>
        <h3 class={titleClass}>Playback controls and timeline cursor</h3>
        <HelperText>Replay bootstraps through the shared session store, then keeps speed, seeking, and stop on the Task 11 controller boundary.</HelperText>
      </div>

      <StatusPill tone={mapTone(playbackTone)} testId="logs-playback-status-pill">
        {playbackStatus}
      </StatusPill>
    </div>

    <div class="flex items-start justify-between gap-3 max-md:flex-col max-md:items-stretch">
      <div>
        <p class="m-0 text-sm font-semibold text-text-primary" data-testid="logs-playback-label">{playbackLabel}</p>
        {#if playbackError}
          <HelperText aria-live={playbackStatus === "error" ? "assertive" : "polite"} aria-atomic="true" testId="logs-playback-error" role={playbackStatus === "error" ? "alert" : "status"}>{playbackError}</HelperText>
        {:else if openedSummary}
          <HelperText>{openedSummary.file_name} · {formatCount(openedSummary.total_entries)} entries</HelperText>
        {/if}
      </div>

      <ActionRow align="start" class="max-md:items-stretch">
        <Button testId="logs-prepare-playback" disabled={!canPreparePlayback} onclick={onPrepare}>
          Prepare
        </Button>
        <Button variant="default" testId="logs-play-button" disabled={!canPlayPlayback} onclick={onPlay}>
          {playbackStatus === "playing" ? "Replay active" : "Play"}
        </Button>
        <Button testId="logs-pause-button" disabled={!replaySessionActive || playbackStatus === "paused"} onclick={onPause}>
          Pause
        </Button>
        <Button variant="destructive" testId="logs-stop-button" disabled={!replaySessionActive} onclick={onStop}>
          Stop
        </Button>
      </ActionRow>
    </div>

    <div class="logs-timeline rounded-lg border border-border bg-bg-primary p-3">
      <div class="flex items-start justify-between gap-3 max-md:flex-col max-md:items-stretch">
        <Eyebrow as="span">Timeline</Eyebrow>
        <MonoValue
          size="xs"
          tone="muted"
          testId="logs-timeline-time"
          value={`${formatUsec(syncedChartCursorUsec, playbackRangeStartUsec)} / ${formatUsec(playbackRangeEndUsec, playbackRangeStartUsec)}`}
        />
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

      <div class="flex items-start justify-between gap-3 max-md:flex-col max-md:items-stretch">
        <label class="flex min-w-24 flex-col gap-1.5">
          <Eyebrow as="span">Speed</Eyebrow>
          <NativeSelect
            testId="logs-speed-select"
            disabled={selectedEntry == null}
            onchange={(event) => onSpeedChange(Number.parseFloat((event.currentTarget as HTMLSelectElement).value))}
            value={String(playbackState.speed)}
          >
            {#each playbackState.available_speeds as speed (speed)}
              <option value={speed}>{speed}x</option>
            {/each}
          </NativeSelect>
        </label>

        <ActionRow align="start">
          <Button testId="logs-map-path-button" disabled={selectedEntry == null} onclick={onSendPathToMap}>
            Send path to map
          </Button>
          <Button testId="logs-map-marker-button" disabled={selectedEntry == null || !replaySessionActive} onclick={onSendReplayMarker}>
            Send replay marker
          </Button>
        </ActionRow>
      </div>
    </div>
  </div>
</Panel>

<style>
  .logs-timeline {
    display: flex;
    flex-direction: column;
    gap: 10px;
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
</style>
