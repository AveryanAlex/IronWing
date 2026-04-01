import { AlertTriangle, ChevronRight, Layers3 } from "lucide-react";

import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import {
  regionHasManualEdits,
  type SurveyRegion,
} from "../../lib/survey-region";

type SurveyRegionCardProps = {
  region: SurveyRegion;
  label: string;
  selected: boolean;
  onSelect: () => void;
  onDissolve: () => void;
  onDelete: () => void;
};

function formatArea(area_m2: number | null | undefined): string {
  if (!Number.isFinite(area_m2 ?? NaN)) {
    return "—";
  }

  if ((area_m2 ?? 0) >= 1_000_000) {
    return `${((area_m2 ?? 0) / 1_000_000).toFixed(2)} km²`;
  }

  return `${Math.round(area_m2 ?? 0).toLocaleString()} m²`;
}

export function SurveyRegionCard({
  region,
  label,
  selected,
  onSelect,
  onDissolve,
  onDelete,
}: SurveyRegionCardProps) {
  const hasManualEdits = regionHasManualEdits(region);
  const patternLabel = region.params.crosshatch ? "Crosshatch" : "Single-pass";
  const photoCount = region.generatedStats?.photoCount?.toLocaleString() ?? "0";

  return (
    <div
      data-survey-region-card={region.id}
      className={cn(
        "group relative flex items-stretch rounded-md border text-xs transition-colors",
        selected
          ? "border-accent bg-accent/12 shadow-[inset_0_0_0_1px_rgba(123,213,251,0.25)]"
          : "border-border bg-bg-primary hover:border-border-light hover:bg-bg-tertiary/50",
      )}
    >
      <button
        type="button"
        aria-label={`Select ${label}`}
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left"
      >
        <div
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
            selected ? "bg-accent/25 text-accent" : "bg-bg-tertiary text-text-muted",
          )}
          aria-hidden="true"
        >
          <Layers3 className="h-3.5 w-3.5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <span className="truncate">{label}</span>
            {hasManualEdits ? (
              <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
                Edited
              </span>
            ) : null}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
            <span>{patternLabel}</span>
            <span>•</span>
            <span>{photoCount} photos</span>
            <span>•</span>
            <span>{formatArea(region.generatedStats?.area_m2)}</span>
          </div>
        </div>

        <ChevronRight
          className={cn(
            "h-4 w-4 shrink-0 text-text-muted transition-transform",
            selected && "text-accent",
          )}
          aria-hidden="true"
        />
      </button>

      <div
        className={cn(
          "flex shrink-0 items-center gap-1 border-l border-border/50 px-1 transition-opacity",
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onDissolve}
          aria-label={`Dissolve ${label}`}
        >
          Dissolve
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onDelete}
          aria-label={`Delete ${label}`}
        >
          Delete
        </Button>
      </div>

      {hasManualEdits ? (
        <div className="pointer-events-none absolute right-2 top-2 text-warning" aria-hidden="true">
          <AlertTriangle className="h-3.5 w-3.5" />
        </div>
      ) : null}
    </div>
  );
}
