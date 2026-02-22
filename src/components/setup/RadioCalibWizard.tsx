import { useState, useEffect, useCallback, useRef } from "react";
import { Check, Play, Square } from "lucide-react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

type Telemetry = {
  rc_channels?: number[];
};

type ChannelMinMax = {
  min: number;
  max: number;
  current: number;
};

type CalibState = "idle" | "recording" | "done";

const CHANNEL_PARAM_PREFIX = "RC";
const CHANNEL_COUNT = 8; // Show first 8 channels

export function RadioCalibWizard({
  connected,
  onStageParams,
}: {
  connected: boolean;
  onStageParams: (params: [string, number][]) => void;
}) {
  const [state, setState] = useState<CalibState>("idle");
  const [channels, setChannels] = useState<ChannelMinMax[]>([]);
  const recordingRef = useRef(false);
  const minMaxRef = useRef<{ min: number[]; max: number[] }>({
    min: new Array(18).fill(65535),
    max: new Array(18).fill(0),
  });

  // Subscribe to telemetry for live RC channels
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;

    (async () => {
      unlisten = await listen<Telemetry>("telemetry://tick", (event) => {
        const rc = event.payload.rc_channels;
        if (!rc || rc.length === 0) return;

        if (recordingRef.current) {
          // Update min/max
          const mm = minMaxRef.current;
          for (let i = 0; i < rc.length; i++) {
            const v = rc[i];
            if (v > 0 && v < 65535) {
              if (v < mm.min[i]) mm.min[i] = v;
              if (v > mm.max[i]) mm.max[i] = v;
            }
          }
        }

        // Update display
        const display: ChannelMinMax[] = [];
        const mm = minMaxRef.current;
        for (let i = 0; i < Math.min(rc.length, CHANNEL_COUNT); i++) {
          display.push({
            min: mm.min[i] < 65535 ? mm.min[i] : rc[i],
            max: mm.max[i] > 0 ? mm.max[i] : rc[i],
            current: rc[i],
          });
        }
        setChannels(display);
      });
    })();

    return () => { unlisten?.(); };
  }, []);

  const startRecording = useCallback(() => {
    minMaxRef.current = {
      min: new Array(18).fill(65535),
      max: new Array(18).fill(0),
    };
    recordingRef.current = true;
    setState("recording");
  }, []);

  const stopRecording = useCallback(() => {
    recordingRef.current = false;
    setState("done");

    // Stage RC*_MIN, RC*_MAX, RC*_TRIM params
    const params: [string, number][] = [];
    const mm = minMaxRef.current;

    for (let i = 0; i < CHANNEL_COUNT; i++) {
      const ch = i + 1;
      const min = mm.min[i];
      const max = mm.max[i];
      if (min >= 65535 || max <= 0 || min >= max) continue;

      const trim = Math.round((min + max) / 2);
      params.push([`${CHANNEL_PARAM_PREFIX}${ch}_MIN`, min]);
      params.push([`${CHANNEL_PARAM_PREFIX}${ch}_MAX`, max]);
      params.push([`${CHANNEL_PARAM_PREFIX}${ch}_TRIM`, trim]);
    }

    if (params.length > 0) {
      onStageParams(params);
    }
  }, [onStageParams]);

  const reset = () => {
    recordingRef.current = false;
    minMaxRef.current = { min: new Array(18).fill(65535), max: new Array(18).fill(0) };
    setState("idle");
  };

  const barWidth = (value: number) => {
    const clamped = Math.max(800, Math.min(2200, value));
    return ((clamped - 800) / 1400) * 100;
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-text-primary">Radio Calibration</h3>
          <p className="text-[11px] text-text-muted">Move all sticks and switches to their extremes</p>
        </div>
        {state === "idle" && (
          <button
            onClick={startRecording}
            disabled={!connected || channels.length === 0}
            className="flex items-center gap-1.5 rounded-md bg-accent-blue px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
          >
            <Play size={12} />
            Start
          </button>
        )}
        {state === "recording" && (
          <button
            onClick={stopRecording}
            className="flex items-center gap-1.5 rounded-md bg-warning px-3 py-1.5 text-xs font-medium text-white"
          >
            <Square size={12} />
            Stop
          </button>
        )}
        {state === "done" && (
          <button
            onClick={reset}
            className="flex items-center gap-1.5 rounded-md border border-border bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-primary"
          >
            Reset
          </button>
        )}
      </div>

      {channels.length === 0 ? (
        <div className="text-xs text-text-muted">Waiting for RC channel data...</div>
      ) : (
        <div className="flex flex-col gap-1">
          {channels.map((ch, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px]">
              <span className="w-10 shrink-0 font-mono text-text-muted">CH{i + 1}</span>
              <div className="relative flex-1 h-3 rounded bg-bg-tertiary overflow-hidden">
                {/* Min/Max range */}
                {state !== "idle" && ch.min < ch.max && (
                  <div
                    className="absolute top-0 h-full bg-accent-blue/20 rounded"
                    style={{
                      left: `${barWidth(ch.min)}%`,
                      width: `${barWidth(ch.max) - barWidth(ch.min)}%`,
                    }}
                  />
                )}
                {/* Current value */}
                <div
                  className="absolute top-0 h-full w-0.5 bg-accent-blue rounded"
                  style={{ left: `${barWidth(ch.current)}%` }}
                />
              </div>
              <span className="w-10 shrink-0 text-right font-mono text-text-muted">{ch.current}</span>
            </div>
          ))}
        </div>
      )}

      {state === "done" && (
        <div className="flex items-center gap-2 rounded bg-success/10 px-3 py-2 text-xs text-success">
          <Check size={14} />
          RC calibration recorded. Review staged parameters and click Apply.
        </div>
      )}
    </div>
  );
}
