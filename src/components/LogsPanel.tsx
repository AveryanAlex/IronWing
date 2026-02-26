import { FolderOpen, X, Loader2 } from "lucide-react";
import type { useLogs } from "../hooks/use-logs";

type LogsPanelProps = {
  logs: ReturnType<typeof useLogs>;
};

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function LogsPanel({ logs }: LogsPanelProps) {
  const { summary, progress, loading, openFile, closeFile } = logs;

  // Loading state
  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-text-secondary">
        <Loader2 size={32} className="animate-spin text-accent" />
        <p className="text-sm">
          {progress?.phase === "parsing"
            ? `Parsing... ${progress.parsed.toLocaleString()} entries`
            : progress?.phase === "indexing"
              ? `Indexing... ${progress.parsed.toLocaleString()} entries`
              : "Loading..."}
        </p>
      </div>
    );
  }

  // No log loaded
  if (!summary) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-sm text-text-secondary">No log file loaded</p>
        <button
          onClick={openFile}
          className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/80"
        >
          <FolderOpen size={16} />
          Open TLOG
        </button>
      </div>
    );
  }

  // Summary view
  const sortedTypes = Object.entries(summary.message_types).sort(
    (a, b) => b[1] - a[1],
  );

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden">
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
