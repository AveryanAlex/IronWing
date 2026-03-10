import { useEffect, useRef } from "react";
import uPlot from "uplot";

type UPlotChartProps = {
  options: Omit<uPlot.Options, "width" | "height">;
  data: uPlot.AlignedData;
  cursorTimeUsec?: number;
  height?: number;
  onSelect?: (startSec: number, endSec: number) => void;
};

export function UPlotChart({
  options,
  data,
  cursorTimeUsec,
  height = 150,
  onSelect,
}: UPlotChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const hooks: uPlot.Options["hooks"] = { ...(options.hooks ?? {}) };

    if (onSelectRef.current) {
      hooks.setSelect = [
        (u: uPlot) => {
          const left = u.select.left;
          const width = u.select.width;
          if (width < 3) {
            onSelectRef.current?.(0, 0);
            return;
          }
          const startSec = u.posToVal(left, "x");
          const endSec = u.posToVal(left + width, "x");
          onSelectRef.current?.(startSec, endSec);
          u.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false);
        },
      ];
    }

    const fullOpts: uPlot.Options = {
      ...options,
      hooks,
      width: el.clientWidth,
      height,
    };

    const chart = new uPlot(fullOpts, data, el);
    chartRef.current = chart;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.setSize({
          width: entry.contentRect.width,
          height,
        });
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.destroy();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, height]);

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.setData(data);
    }
  }, [data]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || cursorTimeUsec == null) return;

    const timeSec = cursorTimeUsec / 1e6;
    const ts = chart.data[0];
    if (!ts || ts.length === 0) return;

    let lo = 0;
    let hi = ts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ts[mid] < timeSec) lo = mid + 1;
      else hi = mid;
    }

    const left = chart.valToPos(ts[lo], "x");
    chart.setCursor({ left, top: -1 });
  }, [cursorTimeUsec]);

  return (
    <div
      ref={containerRef}
      className="w-full"
      style={{ minHeight: height }}
    />
  );
}
