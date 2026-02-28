import { useEffect, useState, useCallback } from "react";
import { FolderOpen, X, Loader2, Circle, Square } from "lucide-react";
import { Timeline } from "./charts/Timeline";
import { LogCharts, CHART_DEFS, toAligned } from "./charts/LogCharts";
import { getFlightPath, type FlightPathPoint } from "../playback";
import type { LogDataPoint } from "../logs";
import type { useLogs } from "../hooks/use-logs";
import type { useRecording } from "../hooks/use-recording";
import type { usePlayback } from "../hooks/use-playback";
import type uPlot from "uplot";

type LogsPanelProps = {
  logs: ReturnType<typeof useLogs>;
  recording: ReturnType<typeof useRecording>;
  connected: boolean;
  playback: ReturnType<typeof usePlayback>;
  onFlightPath: (path: FlightPathPoint[] | null) => void;
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

export function LogsPanel({
  logs,
  recording,
  connected,
  playback,
  onFlightPath,
}: LogsPanelProps) {
  const { summary, progress, loading, openFile, closeFile, queryMessages } =
    logs;

  const [chartData, setChartData] = useState<Map<string, LogDataPoint[]>>(
    new Map(),
  );
  const [altitudeData, setAltitudeData] = useState<uPlot.AlignedData | null>(
    null,
  );

  // Fetch chart data + flight path when summary changes
  useEffect(() => {
    if (!summary) {
      setChartData(new Map());
      setAltitudeData(null);
      onFlightPath(null);
      return;
    }

    // Configure playback time range
    playback.configure(summary.start_usec, summary.end_usec);

    // Unique message types needed
    const msgTypes = [...new Set(CHART_DEFS.map((d) => d.msgType))];

    // Parallel queries
    const queries = msgTypes.map(async (mt): Promise<[string, LogDataPoint[]]> => {
      try {
        const pts = await queryMessages(mt, undefined, undefined, 2000);
        return [mt, pts];
      } catch {
        return [mt, []];
      }
    });

    const flightPathQuery = getFlightPath(1000).catch(() => null);

    Promise.all([Promise.all(queries), flightPathQuery]).then(
      ([results, fp]) => {
        const map = new Map<string, LogDataPoint[]>();
        for (const [mt, pts] of results) {
          if (pts.length > 0) map.set(mt, pts);
        }
        setChartData(map);

        // Build altitude data for timeline
        const vfrPoints = map.get("VFR_HUD");
        if (vfrPoints && vfrPoints.length > 0) {
          setAltitudeData(toAligned(vfrPoints, ["alt"]));
        } else {
          setAltitudeData(null);
        }

        onFlightPath(fp);
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary]);

  const handleClose = useCallback(() => {
    playback.stop();
    onFlightPath(null);
    closeFile();
  }, [playback, closeFile, onFlightPath]);

  const recordingInfo =
    recording.status !== "idle" ? recording.status.recording : null;

  // Recording bar (shown when connected)
  const recordingBar = connected ? (
    <div className="flex items-center justify-between rounded-md border border-border bg-bg-secondary px-3 py-2">
      {recording.isRecording && recordingInfo ? (
        <>
          <div className="flex min-w-0 items-center gap-2">
            <Circle
              size={10}
              className="shrink-0 animate-pulse fill-danger text-danger"
            />
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
          <span className="text-xs text-text-secondary">
            Record incoming MAVLink to file
          </span>
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

  // Log loaded — timeline + charts view
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
            onClick={handleClose}
            className="flex items-center gap-1.5 rounded-md bg-bg-tertiary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            <X size={14} />
            Close
          </button>
        </div>
      </div>

      {/* Timeline + playback controls */}
      <Timeline
        startUsec={summary.start_usec}
        endUsec={summary.end_usec}
        currentUsec={playback.currentTimeUsec}
        isPlaying={playback.isPlaying}
        speed={playback.speed}
        altitudeData={altitudeData}
        onPlay={playback.play}
        onPause={playback.pause}
        onSeek={playback.seek}
        onSpeedChange={playback.setSpeed}
      />

      {/* Charts */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <LogCharts
          chartData={chartData}
          currentTimeUsec={playback.currentTimeUsec}
        />
      </div>
    </div>
  );
}
