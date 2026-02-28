import { useEffect, useRef } from "react";
import uPlot from "uplot";

type UPlotChartProps = {
  options: Omit<uPlot.Options, "width" | "height">;
  data: uPlot.AlignedData;
  cursorTimeUsec?: number;
  height?: number;
};

export function UPlotChart({
  options,
  data,
  cursorTimeUsec,
  height = 150,
}: UPlotChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);

  // Create / destroy chart
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const fullOpts: uPlot.Options = {
      ...options,
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
    // Recreate only when options identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, height]);

  // Update data without recreating chart
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.setData(data);
    }
  }, [data]);

  // Programmatic cursor position for playback
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || cursorTimeUsec == null) return;

    const timeSec = cursorTimeUsec / 1e6;
    const ts = chart.data[0];
    if (!ts || ts.length === 0) return;

    // Find nearest index
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
