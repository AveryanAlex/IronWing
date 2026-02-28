import { useMemo, useCallback } from "react";
import { Play, Pause } from "lucide-react";
import uPlot from "uplot";
import { UPlotChart } from "./UPlotChart";

type TimelineProps = {
  startUsec: number;
  endUsec: number;
  currentUsec: number;
  isPlaying: boolean;
  speed: number;
  altitudeData: uPlot.AlignedData | null;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (usec: number) => void;
  onSpeedChange: (speed: number) => void;
};

const SPEEDS = [0.5, 1, 2, 4, 8, 16];

function formatTime(usec: number, startUsec: number): string {
  const totalSec = Math.floor((usec - startUsec) / 1e6);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function Timeline({
  startUsec,
  endUsec,
  currentUsec,
  isPlaying,
  speed,
  altitudeData,
  onPlay,
  onPause,
  onSeek,
  onSpeedChange,
}: TimelineProps) {
  const timelineOpts = useMemo((): Omit<uPlot.Options, "width" | "height"> => {
    const syncKey = uPlot.sync("log");
    return {
      cursor: {
        lock: false,
        sync: { key: syncKey.key, setSeries: false },
        drag: { x: false, y: false },
      },
      select: { show: false, left: 0, top: 0, width: 0, height: 0 },
      legend: { show: false },
      axes: [
        { show: false },
        { show: false },
      ],
      series: [
        {},
        {
          stroke: "rgba(156, 178, 199, 0.4)",
          fill: "rgba(156, 178, 199, 0.08)",
          width: 1,
        },
      ],
      hooks: {
        ready: [
          (u: uPlot) => {
            const over = u.over;
            const handleClick = (e: MouseEvent) => {
              const rect = over.getBoundingClientRect();
              const pxX = e.clientX - rect.left;
              const timeSec = u.posToVal(pxX, "x");
              onSeek(timeSec * 1e6);
            };
            over.addEventListener("click", handleClick);
          },
        ],
      },
    };
  }, [onSeek]);

  const handleToggle = useCallback(() => {
    if (isPlaying) onPause();
    else onPlay();
  }, [isPlaying, onPlay, onPause]);

  const emptyData: uPlot.AlignedData = useMemo(() => [[0], [0]], []);

  return (
    <div className="space-y-1">
      {/* Mini altitude chart */}
      <div className="relative rounded-md border border-border bg-bg-secondary">
        <UPlotChart
          options={timelineOpts}
          data={altitudeData ?? emptyData}
          cursorTimeUsec={currentUsec}
          height={48}
        />
        {/* Playhead overlay */}
        {endUsec > startUsec && (
          <div
            className="pointer-events-none absolute inset-y-0 w-px bg-accent"
            style={{
              left: `${((currentUsec - startUsec) / (endUsec - startUsec)) * 100}%`,
            }}
          />
        )}
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleToggle}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent text-white transition-colors hover:bg-accent-hover"
        >
          {isPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
        </button>

        <select
          value={speed}
          onChange={(e) => onSpeedChange(Number(e.target.value))}
          className="h-7 rounded-md border border-border bg-bg-input pl-2 pr-6 text-xs text-text-primary"
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}x
            </option>
          ))}
        </select>

        <span className="ml-auto text-xs tabular-nums text-text-secondary">
          {formatTime(currentUsec, startUsec)} / {formatTime(endUsec, startUsec)}
        </span>
      </div>
    </div>
  );
}
