<script lang="ts">
import type { RecordingStatus } from "../../recording";
import { formatBytes } from "./logs-format";

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

let recordingStatusTone = $derived(
  recordingStatus.kind === "recording"
    ? "critical"
    : recordingStatus.kind === "stopping"
      ? "caution"
      : recordingStatus.kind === "failed"
        ? "critical"
        : "neutral",
);
</script>

<section class="logs-card" data-testid="logs-recording-panel">
  <div class="logs-card__header">
    <div>
      <p class="logs-card__eyebrow">Recording</p>
      <h3 class="logs-card__title">Capture state and auto-record setting</h3>
      <p class="logs-card__copy">Surface idle, recording, stopping, and failure states honestly while the library registration settles in the background.</p>
    </div>

    <span class="logs-pill" data-tone={recordingStatusTone}>
      {recordingStatus.kind}
    </span>
  </div>

  {#if recordingError}
    <div aria-live="assertive" aria-atomic="true" class="logs-banner" data-tone="critical" data-testid="logs-recording-error" role="alert">
      {recordingError}
    </div>
  {/if}

  {#if manualRecordingError}
    <div aria-live="assertive" aria-atomic="true" class="logs-banner" data-tone="critical" data-testid="logs-recording-picker-error" role="alert">
      {manualRecordingError}
    </div>
  {/if}

  {#if recordingAndReplayOverlap}
    <div class="logs-banner" data-tone="caution" data-testid="logs-recording-replay-overlap">
      Replay is still active while this recording {recordingStatus.kind === "stopping" ? "finishes and registers in the library" : "continues writing"}. Stop remains available even during replay.
    </div>
  {/if}

  <div class="logs-recording__row">
    <div>
      <p class="logs-recording__status" data-testid="logs-recording-status">{recordingLabel}</p>
      {#if recordingStatus.kind === "recording" || recordingStatus.kind === "stopping"}
        <p class="logs-card__copy logs-content-wrap" data-testid="logs-recording-status-copy">{recordingStatus.destination_path} · {formatBytes(recordingStatus.bytes_written)}</p>
      {:else if recordingStatus.kind === "failed"}
        <p class="logs-card__copy logs-content-wrap" data-testid="logs-recording-status-copy">operation · {recordingStatus.failure.operation_id} · {recordingStatus.failure.reason.kind}</p>
      {/if}
    </div>

    <button
      class={`logs-button ${recordingStatus.kind === "recording" || recordingStatus.kind === "stopping" ? "logs-button--danger" : ""}`}
      data-testid="logs-recording-toggle"
      disabled={recordingStatus.kind === "stopping" || (recordingStatus.kind === "idle" && !supportsRecordingPicker && recordingPath.trim().length === 0)}
      onclick={onToggleRecording}
      type="button"
    >
      {recordingStatus.kind === "recording"
        ? "Stop recording"
        : recordingStatus.kind === "stopping"
          ? "Finalizing"
          : supportsRecordingPicker
            ? "Choose destination and start"
            : "Start recording"}
    </button>
  </div>

  <div class="logs-facts-grid logs-facts-grid--compact">
    <div class="logs-fact">
      <span class="logs-fact__label">Manual destination</span>
      <span class="logs-fact__value logs-fact__value--mono logs-content-wrap" data-testid="logs-recording-destination-value">
        {recordingStatus.kind === "recording" || recordingStatus.kind === "stopping"
          ? recordingStatus.destination_path
          : recordingPath || "not chosen yet"}
      </span>
    </div>
    <div class="logs-fact">
      <span class="logs-fact__label">Active file</span>
      <span class="logs-fact__value logs-fact__value--mono logs-content-wrap" data-testid="logs-recording-file-value">
        {recordingStatus.kind === "recording" || recordingStatus.kind === "stopping"
          ? recordingStatus.file_name
          : "—"}
      </span>
    </div>
    <div class="logs-fact">
      <span class="logs-fact__label">Bytes written</span>
      <span class="logs-fact__value" data-testid="logs-recording-bytes-value">
        {recordingStatus.kind === "recording" || recordingStatus.kind === "stopping"
          ? formatBytes(recordingStatus.bytes_written)
          : "—"}
      </span>
    </div>
    <div class="logs-fact">
      <span class="logs-fact__label">Auto-record on connect</span>
      <span class="logs-fact__value" data-testid="logs-auto-record-value">
        {autoRecordEnabled ? "enabled" : "disabled"}
      </span>
    </div>
  </div>

  <label class="logs-field">
    <span class="logs-field__label">Manual destination path</span>
    <input
      class="logs-input"
      data-testid="logs-recording-path-input"
      disabled={recordingStatus.kind === "recording" || recordingStatus.kind === "stopping"}
      oninput={(event) => onRecordingPathChange((event.currentTarget as HTMLInputElement).value)}
      placeholder="/data/recordings/manual-capture.tlog"
      type="text"
      value={recordingPath}
    />
  </label>

  <p class="logs-card__copy logs-content-wrap" data-testid="logs-recording-path-help">
    {supportsRecordingPicker
      ? "The start button uses the browser save picker when available, then records to the chosen filename on this path. Edit the path first to override the suggested directory or fallback destination."
      : "If save picking is unavailable on this surface, start uses the typed destination path directly."}
  </p>

  <label class="logs-checkbox">
    <input
      checked={autoRecordEnabled}
      data-testid="logs-auto-record-toggle"
      disabled={!hasSettings || settingsLoading}
      onchange={onToggleAutoRecord}
      type="checkbox"
    />
    <span>Auto-record on connect</span>
  </label>

  <p class="logs-card__copy logs-content-wrap" data-testid="logs-auto-record-help">
    Default remains off. When enabled, connect requests forward this opt-in through <code>ironwing.settings</code> and auto recordings land in <code>{autoRecordDirectory ?? "—"}</code>.
  </p>
</section>

<style>
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

  .logs-card__header,
  .logs-recording__row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .logs-card__header > div,
  .logs-recording__row > div,
  .logs-fact {
    min-width: 0;
  }

  .logs-card__eyebrow,
  .logs-fact__label,
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
  .logs-fact__value,
  .logs-recording__status,
  .logs-banner {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: 0.8rem;
    line-height: 1.5;
  }

  .logs-recording__status,
  .logs-fact__value {
    color: var(--color-text-primary);
  }

  .logs-recording__status {
    font-size: 0.86rem;
    font-weight: 600;
  }

  .logs-banner {
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-bg-primary);
    padding: 10px 12px;
  }

  .logs-banner[data-tone="critical"] {
    border-color: color-mix(in srgb, var(--color-danger) 45%, var(--color-border));
    background: color-mix(in srgb, var(--color-danger) 10%, var(--color-bg-primary));
    color: var(--color-danger);
  }

  .logs-banner[data-tone="caution"] {
    border-color: color-mix(in srgb, var(--color-warning) 45%, var(--color-border));
    background: color-mix(in srgb, var(--color-warning) 10%, var(--color-bg-primary));
    color: var(--color-warning);
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

  .logs-pill[data-tone="caution"] {
    border-color: color-mix(in srgb, var(--color-warning) 40%, var(--color-border-light));
    color: var(--color-warning);
  }

  .logs-pill[data-tone="critical"] {
    border-color: color-mix(in srgb, var(--color-danger) 40%, var(--color-border-light));
    color: var(--color-danger);
  }

  .logs-facts-grid {
    display: grid;
    gap: 10px;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  }

  .logs-facts-grid--compact {
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  }

  .logs-fact {
    display: flex;
    flex-direction: column;
    gap: 4px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-bg-primary);
    padding: 10px 12px;
  }

  .logs-fact__value--mono {
    font-family: "JetBrains Mono", monospace;
    font-size: 0.74rem;
  }

  .logs-content-wrap {
    min-width: 0;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .logs-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .logs-input {
    width: 100%;
    min-width: 0;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    background: var(--color-bg-input);
    color: var(--color-text-primary);
    font-size: 0.8rem;
    padding: 0.55rem 0.7rem;
  }

  .logs-checkbox {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--color-text-secondary);
    font-size: 0.82rem;
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

  .logs-button:disabled {
    opacity: 0.45;
  }

  .logs-button--danger {
    border-color: color-mix(in srgb, var(--color-danger) 45%, var(--color-border-light));
    background: color-mix(in srgb, var(--color-danger) 14%, var(--color-bg-primary));
    color: var(--color-danger);
  }

  @media (max-width: 720px) {
    .logs-card__header,
    .logs-recording__row {
      flex-direction: column;
      align-items: stretch;
    }
  }
</style>
