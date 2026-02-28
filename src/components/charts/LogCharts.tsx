import { useState, useMemo } from "react";
import uPlot from "uplot";
import { UPlotChart } from "./UPlotChart";
import type { LogDataPoint } from "../../logs";

type ChartDef = {
  id: string;
  label: string;
  msgType: string;
  fields: string[];
  unit: string;
  colors: string[];
};

const CHART_DEFS: ChartDef[] = [
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
    fields: ["voltage_battery"],
    unit: "V",
    colors: ["#ffb020"],
  },
];

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

type LogChartsProps = {
  chartData: Map<string, LogDataPoint[]>;
  currentTimeUsec: number;
};

export { CHART_DEFS, toAligned };

export function LogCharts({ chartData, currentTimeUsec }: LogChartsProps) {
  const [visible, setVisible] = useState<Set<string>>(
    () => new Set(CHART_DEFS.map((d) => d.id)),
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
        {CHART_DEFS.map((def) => {
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
        {CHART_DEFS.filter((d) => visible.has(d.id)).map((def) => {
          const points = chartData.get(def.msgType);
          if (!points || points.length === 0) return null;
          return (
            <ChartPanel
              key={def.id}
              def={def}
              points={points}
              currentTimeUsec={currentTimeUsec}
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
}: {
  def: ChartDef;
  points: LogDataPoint[];
  currentTimeUsec: number;
}) {
  const data = useMemo(() => toAligned(points, def.fields), [points, def.fields]);

  const opts = useMemo((): Omit<uPlot.Options, "width" | "height"> => {
    const syncKey = uPlot.sync("log");
    return {
      cursor: {
        lock: false,
        sync: { key: syncKey.key, setSeries: false },
      },
      select: { show: false, left: 0, top: 0, width: 0, height: 0 },
      legend: { show: true },
      axes: [
        {
          stroke: "rgba(156, 178, 199, 0.3)",
          grid: { stroke: "rgba(156, 178, 199, 0.08)" },
          ticks: { stroke: "rgba(156, 178, 199, 0.1)" },
          font: "10px system-ui",
        },
        {
          stroke: "rgba(156, 178, 199, 0.3)",
          grid: { stroke: "rgba(156, 178, 199, 0.08)" },
          ticks: { stroke: "rgba(156, 178, 199, 0.1)" },
          font: "10px system-ui",
          size: 50,
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
  }, [def.fields, def.colors]);

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
      />
    </div>
  );
}
