import { useState, useMemo, useCallback } from "react";
import uPlot from "uplot";
import { UPlotChart } from "./UPlotChart";
import type { LogDataPoint, LogType } from "../../logs";

type ChartDef = {
  id: string;
  label: string;
  msgType: string;
  fields: string[];
  unit: string;
  colors: string[];
};

const TLOG_CHART_DEFS: ChartDef[] = [
  {
    id: "altitude",
    label: "Altitude",
    msgType: "VFR_HUD",
    fields: ["alt", "climb"],
    unit: "m",
    colors: ["#12b9ff", "#57e38b"],
  },
  {
    id: "speed",
    label: "Speed",
    msgType: "VFR_HUD",
    fields: ["airspeed", "groundspeed"],
    unit: "m/s",
    colors: ["#ff9f43", "#ff6b6b"],
  },
  {
    id: "attitude",
    label: "Attitude",
    msgType: "ATTITUDE",
    fields: ["roll", "pitch", "yaw"],
    unit: "rad",
    colors: ["#ff4444", "#57e38b", "#12b9ff"],
  },
  {
    id: "battery",
    label: "Battery",
    msgType: "SYS_STATUS",
    fields: ["voltage_battery", "current_battery"],
    unit: "V / A",
    colors: ["#ffb020", "#ff6b6b"],
  },
  {
    id: "throttle",
    label: "Throttle",
    msgType: "VFR_HUD",
    fields: ["throttle", "heading"],
    unit: "% / deg",
    colors: ["#a78bfa", "#f472b6"],
  },
  {
    id: "gps",
    label: "GPS",
    msgType: "GPS_RAW_INT",
    fields: ["satellites_visible", "eph"],
    unit: "sats / m",
    colors: ["#34d399", "#fbbf24"],
  },
  {
    id: "rc_input",
    label: "RC Input",
    msgType: "RC_CHANNELS",
    fields: ["chan1_raw", "chan2_raw", "chan3_raw", "chan4_raw"],
    unit: "\u00b5s",
    colors: ["#ff4444", "#57e38b", "#12b9ff", "#ff9f43"],
  },
  {
    id: "servo_output",
    label: "Servo Output",
    msgType: "SERVO_OUTPUT_RAW",
    fields: ["servo1_raw", "servo2_raw", "servo3_raw", "servo4_raw"],
    unit: "\u00b5s",
    colors: ["#ff4444", "#57e38b", "#12b9ff", "#ff9f43"],
  },
  {
    id: "nav",
    label: "Nav Controller",
    msgType: "NAV_CONTROLLER_OUTPUT",
    fields: ["wp_dist", "alt_error", "xtrack_error"],
    unit: "m",
    colors: ["#38bdf8", "#fb923c", "#e879f9"],
  },
];

const BIN_CHART_DEFS: ChartDef[] = [
  {
    id: "altitude",
    label: "Altitude",
    msgType: "CTUN",
    fields: ["Alt", "DAlt", "CRt"],
    unit: "m",
    colors: ["#12b9ff", "#57e38b", "#ff9f43"],
  },
  {
    id: "speed",
    label: "Speed",
    msgType: "GPS",
    fields: ["Spd"],
    unit: "m/s",
    colors: ["#ff9f43"],
  },
  {
    id: "attitude",
    label: "Attitude",
    msgType: "ATT",
    fields: ["Roll", "Pitch", "Yaw"],
    unit: "deg",
    colors: ["#ff4444", "#57e38b", "#12b9ff"],
  },
  {
    id: "battery",
    label: "Battery",
    msgType: "BAT",
    fields: ["Volt", "Curr", "CurrTot"],
    unit: "V / A / mAh",
    colors: ["#ffb020", "#ff6b6b", "#c084fc"],
  },
  {
    id: "throttle",
    label: "Throttle",
    msgType: "CTUN",
    fields: ["ThO"],
    unit: "%",
    colors: ["#a78bfa"],
  },
  {
    id: "gps",
    label: "GPS",
    msgType: "GPS",
    fields: ["NSats", "HDop"],
    unit: "sats / hdop",
    colors: ["#34d399", "#fbbf24"],
  },
  {
    id: "rc_input",
    label: "RC Input",
    msgType: "RCIN",
    fields: ["C1", "C2", "C3", "C4"],
    unit: "\u00b5s",
    colors: ["#ff4444", "#57e38b", "#12b9ff", "#ff9f43"],
  },
  {
    id: "servo_output",
    label: "Servo Output",
    msgType: "RCOU",
    fields: ["C1", "C2", "C3", "C4"],
    unit: "\u00b5s",
    colors: ["#ff4444", "#57e38b", "#12b9ff", "#ff9f43"],
  },
  {
    id: "vibration",
    label: "Vibration",
    msgType: "VIBE",
    fields: ["VibeX", "VibeY", "VibeZ"],
    unit: "m/s\u00b2",
    colors: ["#ff4444", "#57e38b", "#12b9ff"],
  },
  {
    id: "nav",
    label: "Nav Controller",
    msgType: "NTUN",
    fields: ["WpDist", "AltErr"],
    unit: "m",
    colors: ["#38bdf8", "#fb923c"],
  },
];

function getChartDefs(logType: LogType): ChartDef[] {
  return logType === "bin" ? BIN_CHART_DEFS : TLOG_CHART_DEFS;
}

function toAligned(
  points: LogDataPoint[],
  fields: string[],
): uPlot.AlignedData {
  const ts = new Float64Array(points.length);
  const cols = fields.map(() => new Float64Array(points.length));
  for (let i = 0; i < points.length; i++) {
    ts[i] = points[i].timestamp_usec / 1e6;
    for (let f = 0; f < fields.length; f++) {
      cols[f][i] = points[i].fields[fields[f]] ?? 0;
    }
  }
  return [ts, ...cols] as unknown as uPlot.AlignedData;
}

export type TimeRange = { startUsec: number; endUsec: number };

type LogChartsProps = {
  chartData: Map<string, LogDataPoint[]>;
  currentTimeUsec: number;
  logType: LogType;
  onRangeSelect?: (range: TimeRange | null) => void;
};

export { getChartDefs, toAligned };
export type { ChartDef };

export function LogCharts({ chartData, currentTimeUsec, logType, onRangeSelect }: LogChartsProps) {
  const chartDefs = getChartDefs(logType);

  const [visible, setVisible] = useState<Set<string>>(
    () => new Set(chartDefs.map((d) => d.id)),
  );

  const toggleChart = (id: string) => {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-2 overflow-hidden">
      {/* Toggle pills */}
      <div className="flex flex-wrap gap-1.5">
        {chartDefs.map((def) => {
          const hasData = chartData.has(def.msgType);
          const isOn = visible.has(def.id);
          return (
            <button
              key={def.id}
              onClick={() => toggleChart(def.id)}
              disabled={!hasData}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                isOn && hasData
                  ? "bg-accent/20 text-accent"
                  : "bg-bg-tertiary text-text-muted"
              } disabled:opacity-40`}
            >
              {def.label}
            </button>
          );
        })}
      </div>

      {/* Stacked charts */}
      <div className="flex-1 space-y-2 overflow-y-auto">
        {chartDefs.filter((d) => visible.has(d.id)).map((def) => {
          const points = chartData.get(def.msgType);
          if (!points || points.length === 0) return null;
          return (
            <ChartPanel
              key={def.id}
              def={def}
              points={points}
              currentTimeUsec={currentTimeUsec}
              onRangeSelect={onRangeSelect}
            />
          );
        })}
      </div>
    </div>
  );
}

function ChartPanel({
  def,
  points,
  currentTimeUsec,
  onRangeSelect,
}: {
  def: ChartDef;
  points: LogDataPoint[];
  currentTimeUsec: number;
  onRangeSelect?: (range: TimeRange | null) => void;
}) {
  const data = useMemo(() => toAligned(points, def.fields), [points, def.fields]);

  const handleSelect = useCallback(
    (startSec: number, endSec: number) => {
      if (startSec === 0 && endSec === 0) {
        onRangeSelect?.(null);
      } else {
        onRangeSelect?.({
          startUsec: Math.round(startSec * 1e6),
          endUsec: Math.round(endSec * 1e6),
        });
      }
    },
    [onRangeSelect],
  );

  const opts = useMemo((): Omit<uPlot.Options, "width" | "height"> => {
    const syncKey = uPlot.sync("log");
    const startSec = data[0]?.[0] ?? 0;
    return {
      cursor: {
        lock: false,
        sync: { key: syncKey.key, setSeries: false },
      },
      select: { show: true, left: 0, top: 0, width: 0, height: 0 },
      legend: { show: true },
      axes: [
        {
          stroke: "rgba(156, 178, 199, 0.3)",
          grid: { stroke: "rgba(156, 178, 199, 0.08)" },
          ticks: { stroke: "rgba(156, 178, 199, 0.1)" },
          font: "10px system-ui",
          values: (_u: uPlot, vals: number[]) =>
            vals.map((v) => {
              const rel = v - startSec;
              const m = Math.floor(rel / 60);
              const s = Math.floor(rel % 60);
              return `${m}:${s.toString().padStart(2, "0")}`;
            }),
        },
        {
          stroke: "rgba(156, 178, 199, 0.3)",
          grid: { stroke: "rgba(156, 178, 199, 0.08)" },
          ticks: { stroke: "rgba(156, 178, 199, 0.1)" },
          font: "10px system-ui",
          size: 55,
        },
      ],
      series: [
        {},
        ...def.fields.map((fieldName, i) => ({
          label: fieldName,
          stroke: def.colors[i] ?? "#12b9ff",
          width: 1.5,
        })),
      ],
    };
  }, [def.fields, def.colors, data]);

  return (
    <div className="rounded-md border border-border bg-bg-secondary">
      <div className="flex items-center gap-1.5 border-b border-border/50 px-2.5 py-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          {def.label}
        </span>
        <span className="text-[10px] text-text-muted">({def.unit})</span>
      </div>
      <UPlotChart
        options={opts}
        data={data}
        cursorTimeUsec={currentTimeUsec}
        height={140}
        onSelect={handleSelect}
      />
    </div>
  );
}
