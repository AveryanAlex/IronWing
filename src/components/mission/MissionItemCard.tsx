import type { MouseEvent as ReactMouseEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  ChevronLeft,
  ChevronRight,
  Trash2,
  SkipForward,
  Navigation,
  MapPin,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { commandDisplayName, commandCategory } from "../../lib/mavkit-types";
import type { MissionItem } from "../../lib/mavkit-types";
import type { FenceRegion } from "../../lib/mavkit-types";
import type { TypedDraftItem } from "../../lib/mission-draft-typed";
import type { MissionType } from "../../mission";

const CATEGORY_BADGE: Record<string, { label: string; className: string }> = {
  nav: { label: "NAV", className: "bg-accent-blue/15 text-accent-blue" },
  do: { label: "DO", className: "bg-warning/15 text-warning" },
  condition: { label: "CND", className: "bg-purple-500/15 text-purple-400" },
  other: { label: "RAW", className: "bg-bg-tertiary text-text-muted" },
};

function fenceRegionLabel(region: FenceRegion): string {
  if ("inclusion_polygon" in region) return "Incl. Polygon";
  if ("exclusion_polygon" in region) return "Excl. Polygon";
  if ("inclusion_circle" in region) return "Incl. Circle";
  return "Excl. Circle";
}

type MissionItemCardProps = {
  draftItem: TypedDraftItem;
  displayIndex: number;
  isPrimarySelected: boolean;
  isMultiSelected: boolean;
  isActive: boolean;
  missionType: MissionType;
  readOnly: boolean;
  onSelect: () => void;
  onShiftClick: () => void;
  onCtrlClick: () => void;
  onInsertBefore: () => void;
  onInsertAfter: () => void;
  onDelete: () => void;
  onSetCurrent: () => void;
};

export function MissionItemCard({
  draftItem,
  displayIndex,
  isPrimarySelected,
  isMultiSelected,
  isActive: isActiveRaw,
  missionType,
  readOnly,
  onSelect,
  onShiftClick,
  onCtrlClick,
  onInsertBefore,
  onInsertAfter,
  onDelete,
  onSetCurrent,
}: MissionItemCardProps) {
  const isMission = missionType === "mission";
  const isSelected = isPrimarySelected || isMultiSelected;
  const selectionState = isPrimarySelected ? "primary" : isMultiSelected ? "multi" : "none";
  // Active WP emphasis only applies in Mission mode.
  const isActive = isMission && isActiveRaw;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: draftItem.uiId, disabled: readOnly });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const latDeg = draftItem.preview.latitude_deg;
  const lonDeg = draftItem.preview.longitude_deg;
  const altitudeM = draftItem.preview.altitude_m;
  const hasCoords = latDeg !== null && lonDeg !== null;

  const handleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.shiftKey) {
      onShiftClick();
      return;
    }
    if (event.metaKey || event.ctrlKey) {
      onCtrlClick();
      return;
    }
    onSelect();
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-mission-waypoint-card
      data-seq={draftItem.index}
      data-selection-state={selectionState}
      className={cn(
        "group relative flex items-stretch rounded-md border text-xs transition-colors",
        isDragging && "z-50 opacity-70 shadow-lg",
        isPrimarySelected
          ? "border-accent bg-accent/12 shadow-[inset_0_0_0_1px_rgba(123,213,251,0.25)]"
          : isMultiSelected
            ? "border-accent/40 bg-accent/6"
            : isActive
              ? "border-success/40 bg-success/5"
              : "border-border bg-bg-primary hover:border-border-light hover:bg-bg-tertiary/50",
      )}
      onClick={handleClick}
    >
      <button
        data-mission-drag-handle
        className={cn(
          "flex w-6 shrink-0 items-center justify-center rounded-l-md text-text-muted/50 transition-colors hover:bg-bg-tertiary hover:text-text-muted",
          readOnly ? "cursor-not-allowed opacity-40" : "cursor-grab active:cursor-grabbing",
        )}
        {...attributes}
        {...listeners}
        disabled={readOnly}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5">
        <div
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold tabular-nums",
            isPrimarySelected
              ? "bg-accent/25 text-accent"
              : isMultiSelected
                ? "bg-accent/12 text-accent/90"
                : isActive
                  ? "bg-success/20 text-success"
                  : "bg-bg-tertiary text-text-muted",
          )}
        >
          {displayIndex}
        </div>

        {"command" in draftItem.document ? (() => {
          const cmd = (draftItem.document as MissionItem).command;
          const cat = commandCategory(cmd);
          const badge = CATEGORY_BADGE[cat];
          return (
            <>
              <span className={cn("shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase leading-none tracking-wide", badge.className)}>
                {badge.label}
              </span>
              <span className="shrink-0 font-medium text-text-primary">
                {commandDisplayName(cmd)}
              </span>
            </>
          );
        })() : (
          <>
            <span className={cn("shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase leading-none tracking-wide", missionType === "fence" ? "bg-orange-500/15 text-orange-400" : "bg-emerald-500/15 text-emerald-400")}>
              {missionType === "fence" ? "FNC" : "RLY"}
            </span>
            <span className="shrink-0 font-medium text-text-primary">
              {missionType === "fence"
                ? fenceRegionLabel(draftItem.document as FenceRegion)
                : "Rally Point"}
            </span>
          </>
        )}
        {draftItem.readOnly && (
          <span className="rounded bg-warning/10 px-1 py-0.5 text-[9px] uppercase tracking-wide text-warning">
            Raw
          </span>
        )}

        {hasCoords ? (
          <span className="flex items-center gap-0.5 truncate text-text-muted">
            <MapPin className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate tabular-nums">
              {latDeg.toFixed(5)}, {lonDeg.toFixed(5)}
            </span>
          </span>
        ) : (
          <span className="text-text-muted/50">—</span>
        )}

        <span className="ml-auto shrink-0 tabular-nums text-text-muted">
          {altitudeM === null ? "—" : `${altitudeM}m`}
        </span>

        {isActive && (
          <Navigation className="h-3 w-3 shrink-0 fill-success text-success" />
        )}
      </div>

      <div
        className={cn(
          "flex shrink-0 items-center gap-0.5 border-l border-border/50 px-1 transition-opacity",
          isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          data-mission-insert-before
          onClick={onInsertBefore}
          className="rounded p-0.5 text-text-muted hover:bg-bg-tertiary hover:text-text-primary"
          title="Insert before"
        >
          <ChevronLeft className="h-3 w-3" />
        </button>
        <button
          data-mission-insert-after
          onClick={onInsertAfter}
          className="rounded p-0.5 text-text-muted hover:bg-bg-tertiary hover:text-text-primary"
          title="Insert after"
        >
          <ChevronRight className="h-3 w-3" />
        </button>
        <button
          data-mission-set-current
          onClick={isMission ? onSetCurrent : undefined}
          disabled={!isMission}
          className={cn(
            "rounded p-0.5",
            isMission
              ? "text-text-muted hover:bg-bg-tertiary hover:text-accent"
              : "cursor-not-allowed text-text-muted/30",
          )}
          title={isMission ? "Set current" : "Set Current is only available in Mission mode"}
        >
          <SkipForward className="h-3 w-3" />
        </button>
        <button
          data-mission-delete
          onClick={onDelete}
          className="rounded p-0.5 text-text-muted hover:bg-bg-tertiary hover:text-danger"
          title="Delete"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
