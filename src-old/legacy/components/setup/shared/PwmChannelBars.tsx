import { cn } from "../../../lib/utils";

export type PwmChannelBarItem = {
  key?: string;
  channel: number;
  value: number;
  label?: string;
  annotations?: string[];
};

export function pwmValuePercent(value: number, min = 800, max = 2200): number {
  const clamped = Math.max(min, Math.min(max, value));
  return ((clamped - min) / (max - min)) * 100;
}

export function PwmChannelBars({
  items,
  className,
}: {
  items: PwmChannelBarItem[];
  className?: string;
}) {
  if (items.length === 0) {
    return <p className="text-xs text-text-muted">No channel data available.</p>;
  }

  return (
    <div className={cn("grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3", className)}>
      {items.map((item) => {
        const label = item.label ?? `CH${item.channel}`;
        const percent = pwmValuePercent(item.value);

        return (
          <div
            key={item.key ?? item.channel}
            className="rounded-md border border-border/70 bg-bg-secondary/60 px-2.5 py-2"
          >
            <div className="mb-1.5 flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                    {label}
                  </span>
                  {item.annotations?.map((annotation) => (
                    <span
                      key={annotation}
                      aria-label={`${annotation} mapped to channel ${item.channel}`}
                      className="rounded bg-accent/10 px-1.5 py-0.5 text-[9px] font-medium text-accent"
                    >
                      {annotation}
                    </span>
                  ))}
                </div>
              </div>
              <span className="shrink-0 font-mono text-[11px] text-text-primary">
                {Math.round(item.value)}
              </span>
            </div>

            <div className="relative h-2.5 overflow-hidden rounded-full bg-bg-tertiary">
              <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border/80" />
              <div
                className="absolute top-0 h-full w-1 rounded-full bg-accent"
                style={{ left: `calc(${percent}% - 2px)` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
