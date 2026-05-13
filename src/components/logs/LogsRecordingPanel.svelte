<script lang="ts">
import type { RecordingStatus } from "../../recording";
import { Banner, Button, Panel, StatusPill } from "../ui";
import { formatBytes } from "./logs-format";

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
  recordingStatus: RecordingStatus;
  recordingError: string | null;
  manualRecordingError: string | null;
  recordingPath: string;
  recordingLabel: string;
  supportsRecordingPicker: boolean;
  recordingAndReplayOverlap: boolean;
  autoRecordEnabled: boolean;
  autoRecordDirectory: string | null;
  settingsLoading: boolean;
  hasSettings: boolean;
  onToggleRecording: () => void;
  onRecordingPathChange: (path: string) => void;
  onToggleAutoRecord: () => void;
};

let {
  recordingStatus,
  recordingError,
  manualRecordingError,
  recordingPath,
  recordingLabel,
  supportsRecordingPicker,
  recordingAndReplayOverlap,
  autoRecordEnabled,
  autoRecordDirectory,
  settingsLoading,
  hasSettings,
  onToggleRecording,
  onRecordingPathChange,
  onToggleAutoRecord,
}: Props = $props();

let recordingStatusTone = $derived<"neutral" | "positive" | "caution" | "critical">(
  recordingStatus.kind === "recording"
    ? "critical"
    : recordingStatus.kind === "stopping"
      ? "caution"
      : recordingStatus.kind === "failed"
        ? "critical"
      : "neutral",
);

const eyebrowClass = "m-0 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]";
const titleClass = "mt-1 m-0 text-[0.98rem] font-semibold text-[var(--color-text-primary)]";
const copyClass = "m-0 text-[0.8rem] leading-[1.5] text-[var(--color-text-secondary)]";
const valueCardClass = "flex min-w-0 flex-col gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2.5";
const inputClass = "w-full min-w-0 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-bg-input)] px-[0.7rem] py-[0.55rem] text-[0.8rem] text-[var(--color-text-primary)]";
</script>

<Panel testId="logs-recording-panel">
  <div class="flex min-h-0 flex-col gap-3">
    <div class="flex items-start justify-between gap-3 max-[720px]:flex-col max-[720px]:items-stretch">
      <div class="min-w-0">
        <p class={eyebrowClass}>Recording</p>
        <h3 class={titleClass}>Capture state and auto-record setting</h3>
        <p class={copyClass}>Surface idle, recording, stopping, and failure states honestly while the library registration settles in the background.</p>
      </div>

      <StatusPill tone={mapTone(recordingStatusTone)}>{recordingStatus.kind}</StatusPill>
    </div>

    {#if recordingError}
      <Banner severity="danger" title={recordingError} testId="logs-recording-error" />
    {/if}

    {#if manualRecordingError}
      <Banner severity="danger" title={manualRecordingError} testId="logs-recording-picker-error" />
    {/if}

    {#if recordingAndReplayOverlap}
      <Banner
        severity="warning"
        title={`Replay is still active while this recording ${recordingStatus.kind === "stopping" ? "finishes and registers in the library" : "continues writing"}. Stop remains available even during replay.`}
        testId="logs-recording-replay-overlap"
      />
    {/if}

    <div class="flex items-start justify-between gap-3 max-[720px]:flex-col max-[720px]:items-stretch">
      <div class="min-w-0">
        <p class="m-0 text-[0.86rem] font-semibold text-[var(--color-text-primary)]" data-testid="logs-recording-status">{recordingLabel}</p>
        {#if recordingStatus.kind === "recording" || recordingStatus.kind === "stopping"}
          <p class={`min-w-0 overflow-wrap-anywhere break-words ${copyClass}`} data-testid="logs-recording-status-copy">{recordingStatus.destination_path} · {formatBytes(recordingStatus.bytes_written)}</p>
        {:else if recordingStatus.kind === "failed"}
          <p class={`min-w-0 overflow-wrap-anywhere break-words ${copyClass}`} data-testid="logs-recording-status-copy">operation · {recordingStatus.failure.operation_id} · {recordingStatus.failure.reason.kind}</p>
        {/if}
      </div>

      <Button
        tone={recordingStatus.kind === "recording" || recordingStatus.kind === "stopping" ? "danger" : "accent"}
        testId="logs-recording-toggle"
        disabled={recordingStatus.kind === "stopping" || (recordingStatus.kind === "idle" && !supportsRecordingPicker && recordingPath.trim().length === 0)}
        onclick={onToggleRecording}
      >
        {recordingStatus.kind === "recording"
          ? "Stop recording"
          : recordingStatus.kind === "stopping"
            ? "Finalizing"
            : supportsRecordingPicker
              ? "Choose destination and start"
              : "Start recording"}
      </Button>
    </div>

    <div class="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
      <div class={valueCardClass}>
        <span class={eyebrowClass}>Manual destination</span>
        <span class="min-w-0 overflow-wrap-anywhere break-words font-mono text-[0.74rem] leading-[1.5] text-[var(--color-text-primary)]" data-testid="logs-recording-destination-value">
        {recordingStatus.kind === "recording" || recordingStatus.kind === "stopping"
          ? recordingStatus.destination_path
          : recordingPath || "not chosen yet"}
        </span>
      </div>
      <div class={valueCardClass}>
        <span class={eyebrowClass}>Active file</span>
        <span class="min-w-0 overflow-wrap-anywhere break-words font-mono text-[0.74rem] leading-[1.5] text-[var(--color-text-primary)]" data-testid="logs-recording-file-value">
        {recordingStatus.kind === "recording" || recordingStatus.kind === "stopping"
          ? recordingStatus.file_name
          : "—"}
        </span>
      </div>
      <div class={valueCardClass}>
        <span class={eyebrowClass}>Bytes written</span>
        <span class="text-[0.8rem] leading-[1.5] text-[var(--color-text-primary)]" data-testid="logs-recording-bytes-value">
        {recordingStatus.kind === "recording" || recordingStatus.kind === "stopping"
          ? formatBytes(recordingStatus.bytes_written)
          : "—"}
        </span>
      </div>
      <div class={valueCardClass}>
        <span class={eyebrowClass}>Auto-record on connect</span>
        <span class="text-[0.8rem] leading-[1.5] text-[var(--color-text-primary)]" data-testid="logs-auto-record-value">
        {autoRecordEnabled ? "enabled" : "disabled"}
        </span>
      </div>
    </div>

    <label class="flex flex-col gap-1.5">
      <span class={eyebrowClass}>Manual destination path</span>
      <input
        class={inputClass}
        data-testid="logs-recording-path-input"
        disabled={recordingStatus.kind === "recording" || recordingStatus.kind === "stopping"}
        oninput={(event) => onRecordingPathChange((event.currentTarget as HTMLInputElement).value)}
      placeholder="/data/recordings/manual-capture.tlog"
      type="text"
        value={recordingPath}
      />
    </label>

    <p class={`min-w-0 overflow-wrap-anywhere break-words ${copyClass}`} data-testid="logs-recording-path-help">
      {supportsRecordingPicker
        ? "The start button uses the browser save picker when available, then records to the chosen filename on this path. Edit the path first to override the suggested directory or fallback destination."
        : "If save picking is unavailable on this surface, start uses the typed destination path directly."}
    </p>

    <label class="inline-flex items-center gap-2 text-[0.82rem] text-[var(--color-text-secondary)]">
      <input
        checked={autoRecordEnabled}
        data-testid="logs-auto-record-toggle"
        disabled={!hasSettings || settingsLoading}
        onchange={onToggleAutoRecord}
        type="checkbox"
      />
      <span>Auto-record on connect</span>
    </label>

    <p class={`min-w-0 overflow-wrap-anywhere break-words ${copyClass}`} data-testid="logs-auto-record-help">
      Default remains off. When enabled, connect requests forward this opt-in through <code>ironwing.settings</code> and auto recordings land in <code>{autoRecordDirectory ?? "—"}</code>.
    </p>
  </div>
</Panel>
