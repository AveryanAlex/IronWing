import { useEffect, useState, useCallback } from "react";
import { FolderOpen, X, Loader2, Circle, Square, Download } from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { Timeline } from "./charts/Timeline";
import { LogCharts, getChartDefs, toAligned, type TimeRange } from "./charts/LogCharts";
import { getFlightPath, getLogTelemetryTrack, type FlightPathPoint, type TelemetrySnapshot } from "../playback";
import { getFlightSummary, exportLogCsv, type LogDataPoint, type FlightSummary } from "../logs";
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
  onTelemetryTrack: (track: TelemetrySnapshot[] | null) => void;
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

function fmtVal(v: number | null, decimals = 1, suffix = ""): string {
  if (v == null) return "\u2014";
  return `${v.toFixed(decimals)}${suffix}`;
}

function fmtDist(m: number | null): string {
  if (m == null) return "\u2014";
  if (m >= 1000) return `${(m / 1000).toFixed(2)} km`;
  return `${m.toFixed(0)} m`;
}

type StatProps = { label: string; value: string };

function Stat({ label, value }: StatProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-text-muted">{label}</span>
      <span className="text-xs font-medium tabular-nums text-text-primary">{value}</span>
    </div>
  );
}

function SummaryBar({ data }: { data: FlightSummary }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-md border border-border bg-bg-secondary px-3 py-2">
      <Stat label="Duration" value={formatDuration(data.duration_secs)} />
      <Stat label="Max Alt" value={fmtVal(data.max_alt_m, 1, " m")} />
      <Stat label="Avg Alt" value={fmtVal(data.avg_alt_m, 1, " m")} />
      <Stat label="Max Spd" value={fmtVal(data.max_speed_mps, 1, " m/s")} />
      <Stat label="Distance" value={fmtDist(data.total_distance_m)} />
      <Stat label="Max Range" value={fmtDist(data.max_distance_from_home_m)} />
      {data.battery_start_v != null && (
        <Stat
          label="Battery"
          value={`${fmtVal(data.battery_start_v, 1)}→${fmtVal(data.battery_end_v, 1)} V`}
        />
      )}
      {data.mah_consumed != null && (
        <Stat label="Consumed" value={fmtVal(data.mah_consumed, 0, " mAh")} />
      )}
      {data.gps_sats_min != null && (
        <Stat label="Sats" value={`${data.gps_sats_min}–${data.gps_sats_max}`} />
      )}
    </div>
  );
}

export function LogsPanel({
  logs,
  recording,
  connected,
  playback,
  onFlightPath,
  onTelemetryTrack,
}: LogsPanelProps) {
  const { summary, progress, loading, openFile, closeFile, queryMessages } =
    logs;

  const [chartData, setChartData] = useState<Map<string, LogDataPoint[]>>(
    new Map(),
  );
  const [altitudeData, setAltitudeData] = useState<uPlot.AlignedData | null>(
    null,
  );
  const [flightSummary, setFlightSummary] = useState<FlightSummary | null>(null);
  const [exporting, setExporting] = useState(false);
  const [selectedRange, setSelectedRange] = useState<TimeRange | null>(null);

  useEffect(() => {
    if (!summary) {
      setChartData(new Map());
      setAltitudeData(null);
      setFlightSummary(null);
      onFlightPath(null);
      onTelemetryTrack(null);
      return;
    }

    playback.configure(summary.start_usec, summary.end_usec);

    const chartDefs = getChartDefs(summary.log_type);
    const msgTypes = [...new Set(chartDefs.map((d) => d.msgType))];

    const queries = msgTypes.map(async (mt): Promise<[string, LogDataPoint[]]> => {
      try {
        const pts = await queryMessages(mt, undefined, undefined, 2000);
        return [mt, pts];
      } catch {
        return [mt, []];
      }
    });

    const flightPathQuery = getFlightPath(1000).catch(() => null);
    const telemetryTrackQuery = getLogTelemetryTrack().catch(() => null);
    const summaryQuery = getFlightSummary().catch(() => null);

    Promise.all([Promise.all(queries), flightPathQuery, telemetryTrackQuery, summaryQuery]).then(
      ([results, fp, tt, fs]) => {
        const map = new Map<string, LogDataPoint[]>();
        for (const [mt, pts] of results) {
          if (pts.length > 0) map.set(mt, pts);
        }
        setChartData(map);

        const altDef = summary.log_type === "bin"
          ? { msgType: "CTUN", field: "Alt" }
          : { msgType: "VFR_HUD", field: "alt" };
        const altPoints = map.get(altDef.msgType);
        if (altPoints && altPoints.length > 0) {
          setAltitudeData(toAligned(altPoints, [altDef.field]));
        } else {
          setAltitudeData(null);
        }

        onFlightPath(fp);
        onTelemetryTrack(tt);
        setFlightSummary(fs);
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary]);

  const handleClose = useCallback(() => {
    playback.stop();
    onFlightPath(null);
    onTelemetryTrack(null);
    closeFile();
  }, [playback, closeFile, onFlightPath, onTelemetryTrack]);

  const handleExport = useCallback(async () => {
    if (!summary) return;
    const path = await save({
      defaultPath: summary.file_name.replace(/\.(tlog|bin)$/i, ".csv"),
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (!path) return;

    setExporting(true);
    try {
      const rows = await exportLogCsv(
        path,
        selectedRange?.startUsec,
        selectedRange?.endUsec,
      );
      toast.success("CSV exported", { description: `${rows.toLocaleString()} rows written` });
    } catch (err) {
      toast.error("Export failed", {
        description: typeof err === "string" ? err : err instanceof Error ? err.message : "unexpected error",
      });
    } finally {
      setExporting(false);
    }
  }, [summary]);

  const recordingInfo =
    recording.status !== "idle" ? recording.status.recording : null;

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
            Open Log
          </button>
        </div>
      </div>
    );
  }

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
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 rounded-md bg-bg-tertiary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary disabled:opacity-40"
          >
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {selectedRange ? "Export Range" : "CSV"}
          </button>
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

      {/* Flight summary */}
      {flightSummary && <SummaryBar data={flightSummary} />}

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
      {selectedRange && (
        <div className="flex items-center gap-2 rounded-md border border-accent/30 bg-accent/10 px-3 py-1.5">
          <span className="text-xs text-accent">
            Range selected: {formatDuration((selectedRange.endUsec - selectedRange.startUsec) / 1e6)}
          </span>
          <button
            onClick={() => setSelectedRange(null)}
            className="ml-auto text-[10px] font-medium text-text-muted transition-colors hover:text-text-primary"
          >
            Clear
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden">
        <LogCharts
          chartData={chartData}
          currentTimeUsec={playback.currentTimeUsec}
          logType={summary.log_type}
          onRangeSelect={setSelectedRange}
        />
      </div>
    </div>
  );
}
