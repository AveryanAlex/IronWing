import type { ReactNode } from "react";

export type PreviewRow = {
  key: string;
  label: string;
  paramName?: string;
  detail?: string;
  willChange: boolean;
};

export type PreviewStagePanelProps = {
  rows: PreviewRow[];
  headerLabel?: string;
  stageLabel?: string;
  onStage: () => void;
  onCancel: () => void;
  onRowClick?: (row: PreviewRow) => void;
  footer?: ReactNode;
};

export function PreviewStagePanel({
  rows,
  headerLabel,
  stageLabel,
  onStage,
  onCancel,
  onRowClick,
  footer,
}: PreviewStagePanelProps) {
  const changeCount = rows.filter((r) => r.willChange).length;
  const resolvedHeader =
    headerLabel ?? `Preview: ${changeCount} of ${rows.length} will change`;
  const resolvedStageLabel =
    stageLabel ?? `Stage ${changeCount} Change${changeCount !== 1 ? "s" : ""}`;

  return (
    <div className="rounded-lg border border-accent/20 bg-accent/5 p-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        {resolvedHeader}
      </div>
      <div className="flex flex-col gap-1">
        {rows.map((row) => {
          const interactive = row.willChange && onRowClick;
          return (
            <div
              key={row.key}
              role={interactive ? "button" : undefined}
              tabIndex={interactive ? 0 : undefined}
              onClick={interactive ? () => onRowClick(row) : undefined}
              onKeyDown={
                interactive
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onRowClick(row);
                      }
                    }
                  : undefined
              }
              className={`flex items-center gap-2 rounded px-1.5 py-0.5 text-xs transition-colors ${
                row.willChange
                  ? interactive
                    ? "cursor-pointer text-text-primary hover:bg-accent/10"
                    : "text-text-primary"
                  : "text-text-muted"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  row.willChange ? "bg-accent" : "bg-text-muted/30"
                }`}
              />
              <span className="font-medium">{row.label}</span>
              {row.detail && (
                <span className="text-text-secondary">{row.detail}</span>
              )}
              {row.paramName && (
                <span className="font-mono text-[10px] text-text-muted">
                  {row.paramName}
                </span>
              )}
              {!row.willChange && (
                <span className="ml-auto text-[10px] text-text-muted/70">
                  already set
                </span>
              )}
            </div>
          );
        })}
      </div>
      {footer}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onStage}
          disabled={changeCount === 0}
          className="rounded-md bg-accent/15 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {resolvedStageLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:text-text-secondary"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
