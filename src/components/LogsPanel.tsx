import { FolderOpen, X, Loader2, Circle, Square } from "lucide-react";
import type { useLogs } from "../hooks/use-logs";
import type { useRecording } from "../hooks/use-recording";

type LogsPanelProps = {
  logs: ReturnType<typeof useLogs>;
  recording: ReturnType<typeof useRecording>;
  connected: boolean;
};

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function LogsPanel({ logs, recording, connected }: LogsPanelProps) {
  const { summary, progress, loading, openFile, closeFile } = logs;

  const recordingInfo =
    recording.status !== "idle" ? recording.status.recording : null;

  // Recording bar (shown when connected)
  const recordingBar = connected ? (
    <div className="flex items-center justify-between rounded-md border border-border bg-bg-secondary px-3 py-2">
      {recording.isRecording && recordingInfo ? (
        <>
          <div className="flex items-center gap-2 min-w-0">
            <Circle size={10} className="shrink-0 fill-danger text-danger animate-pulse" />
            <span className="truncate text-xs font-medium text-text-primary">
              {recordingInfo.file_name}
            </span>
            <span className="shrink-0 text-xs text-text-secondary">
              {formatBytes(recordingInfo.bytes_written)}
            </span>
          </div>
          <button
            onClick={recording.stop}
            className="flex shrink-0 items-center gap-1.5 rounded-md bg-danger/20 px-3 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/30"
          >
            <Square size={12} />
            Stop
          </button>
        </>
      ) : (
        <>
          <span className="text-xs text-text-secondary">Record incoming MAVLink to file</span>
          <button
            onClick={recording.start}
            className="flex shrink-0 items-center gap-1.5 rounded-md bg-danger/20 px-3 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/30"
          >
            <Circle size={12} className="fill-danger" />
            Record TLOG
          </button>
        </>
      )}
    </div>
  ) : null;

  // Loading state
  if (loading) {
    return (
      <div className="flex h-full flex-col gap-3">
        {recordingBar}
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-text-secondary">
          <Loader2 size={32} className="animate-spin text-accent" />
          <p className="text-sm">
            {progress?.phase === "parsing"
              ? `Parsing... ${progress.parsed.toLocaleString()} entries`
              : progress?.phase === "indexing"
                ? `Indexing... ${progress.parsed.toLocaleString()} entries`
                : "Loading..."}
          </p>
        </div>
      </div>
    );
  }

  // No log loaded
  if (!summary) {
    return (
      <div className="flex h-full flex-col gap-3">
        {recordingBar}
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <p className="text-sm text-text-secondary">No log file loaded</p>
          <button
            onClick={openFile}
            className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/80"
          >
            <FolderOpen size={16} />
            Open TLOG
          </button>
        </div>
      </div>
    );
  }

  // Summary view
  const sortedTypes = Object.entries(summary.message_types).sort(
    (a, b) => b[1] - a[1],
  );

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden">
      {recordingBar}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-text-primary">
            {summary.file_name}
          </h2>
          <p className="text-xs text-text-secondary">
            {summary.total_entries.toLocaleString()} entries &middot;{" "}
            {formatDuration(summary.duration_secs)}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={openFile}
            className="flex items-center gap-1.5 rounded-md bg-bg-tertiary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            <FolderOpen size={14} />
            Open
          </button>
          <button
            onClick={closeFile}
            className="flex items-center gap-1.5 rounded-md bg-bg-tertiary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            <X size={14} />
            Close
          </button>
        </div>
      </div>

      {/* Message type table */}
      <div className="flex-1 overflow-auto rounded-md border border-border bg-bg-secondary">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-left text-text-muted">
              <th className="px-3 py-2 font-medium">Message Type</th>
              <th className="px-3 py-2 text-right font-medium">Count</th>
            </tr>
          </thead>
          <tbody>
            {sortedTypes.map(([type_, count]) => (
              <tr
                key={type_}
                className="border-b border-border/50 last:border-0"
              >
                <td className="px-3 py-1.5 font-mono text-text-primary">
                  {type_}
                </td>
                <td className="px-3 py-1.5 text-right text-text-secondary">
                  {count.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
