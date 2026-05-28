<script lang="ts">
import type { RecordingStatus } from "../../../recording";
import { Banner, Button, Card, Checkbox, Eyebrow, HelperText, Input, MonoValue, Panel, StatusPill } from "../../../components/ui";
import { formatBytes } from "../logs-format";

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

const titleClass = "mt-1 m-0 text-base font-semibold text-text-primary";
</script>

<Panel testId="logs-recording-panel">
  <div class="flex min-h-0 flex-col gap-3">
    <div class="flex items-start justify-between gap-3 max-md:flex-col max-md:items-stretch">
      <div class="min-w-0">
        <Eyebrow>Recording</Eyebrow>
        <h3 class={titleClass}>Capture state and auto-record setting</h3>
        <HelperText>Surface idle, recording, stopping, and failure states honestly while the library registration settles in the background.</HelperText>
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

    <div class="flex items-start justify-between gap-3 max-md:flex-col max-md:items-stretch">
      <div class="min-w-0">
        <p class="m-0 text-sm font-semibold text-text-primary" data-testid="logs-recording-status">{recordingLabel}</p>
        {#if recordingStatus.kind === "recording" || recordingStatus.kind === "stopping"}
          <MonoValue as="p" class="logs-content-wrap" size="sm" tone="secondary" wrap testId="logs-recording-status-copy" value={`${recordingStatus.destination_path} · ${formatBytes(recordingStatus.bytes_written)}`} />
        {:else if recordingStatus.kind === "failed"}
          <MonoValue as="p" class="logs-content-wrap" size="sm" tone="secondary" wrap testId="logs-recording-status-copy" value={`operation · ${recordingStatus.failure.operation_id} · ${recordingStatus.failure.reason.kind}`} />
        {/if}
      </div>

      <Button
        variant={recordingStatus.kind === "recording" || recordingStatus.kind === "stopping" ? "destructive" : "default"}
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

    <div class="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
      <Card.Root layout="block" density="compact">
        <Eyebrow as="span">Manual destination</Eyebrow>
        <MonoValue
          class="logs-content-wrap mt-1 block leading-6"
          size="xs"
          testId="logs-recording-destination-value"
          value={recordingStatus.kind === "recording" || recordingStatus.kind === "stopping"
            ? recordingStatus.destination_path
            : recordingPath || "not chosen yet"}
          wrap
        />
      </Card.Root>
      <Card.Root layout="block" density="compact">
        <Eyebrow as="span">Active file</Eyebrow>
        <MonoValue
          class="logs-content-wrap mt-1 block leading-6"
          size="xs"
          testId="logs-recording-file-value"
          value={recordingStatus.kind === "recording" || recordingStatus.kind === "stopping"
            ? recordingStatus.file_name
            : "—"}
          wrap
        />
      </Card.Root>
      <Card.Root layout="block" density="compact">
        <Eyebrow as="span">Bytes written</Eyebrow>
        <MonoValue
          class="mt-1 block leading-6"
          testId="logs-recording-bytes-value"
          value={recordingStatus.kind === "recording" || recordingStatus.kind === "stopping"
            ? formatBytes(recordingStatus.bytes_written)
            : "—"}
        />
      </Card.Root>
      <Card.Root layout="block" density="compact">
        <Eyebrow as="span">Auto-record on connect</Eyebrow>
        <HelperText class="mt-1 text-text-primary" testId="logs-auto-record-value">{autoRecordEnabled ? "enabled" : "disabled"}</HelperText>
      </Card.Root>
    </div>

    <label class="flex flex-col gap-1.5">
      <Eyebrow as="span">Manual destination path</Eyebrow>
      <Input
        testId="logs-recording-path-input"
        disabled={recordingStatus.kind === "recording" || recordingStatus.kind === "stopping"}
        oninput={(event) => onRecordingPathChange((event.currentTarget as HTMLInputElement).value)}
        placeholder="/data/recordings/manual-capture.tlog"
        type="text"
        value={recordingPath}
      />
    </label>

    <HelperText class="logs-content-wrap" testId="logs-recording-path-help">
      {supportsRecordingPicker
        ? "The start button uses the browser save picker when available, then records to the chosen filename on this path. Edit the path first to override the suggested directory or fallback destination."
        : "If save picking is unavailable on this surface, start uses the typed destination path directly."}
    </HelperText>

    <Checkbox
      checked={autoRecordEnabled}
      disabled={!hasSettings || settingsLoading}
      label="Auto-record on connect"
      onCheckedChange={onToggleAutoRecord}
      testId="logs-auto-record-toggle"
    />

    <HelperText class="logs-content-wrap" testId="logs-auto-record-help">
      Default remains off. When enabled, connect requests forward this opt-in through <code>ironwing.settings</code> and auto recordings land in <code>{autoRecordDirectory ?? "—"}</code>.
    </HelperText>
  </div>
</Panel>
