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
import { commandName } from "../../lib/mav-commands";
import { cn } from "../../lib/utils";
import type { DraftItem } from "../../lib/mission-draft";
import type { MissionType } from "../../mission";

type MissionWaypointCardProps = {
  draftItem: DraftItem;
  displayIndex: number;
  isSelected: boolean;
  isActive: boolean;
  missionType: MissionType;
  onSelect: () => void;
  onInsertBefore: () => void;
  onInsertAfter: () => void;
  onDelete: () => void;
  onSetCurrent: () => void;
};

export function MissionWaypointCard({
  draftItem,
  displayIndex,
  isSelected,
  isActive: isActiveRaw,
  missionType,
  onSelect,
  onInsertBefore,
  onInsertAfter,
  onDelete,
  onSetCurrent,
}: MissionWaypointCardProps) {
  const isMission = missionType === "mission";
  // Active WP emphasis only applies in Mission mode
  const isActive = isMission && isActiveRaw;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: draftItem.uiId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const { item } = draftItem;
  const latDeg = item.x / 1e7;
  const lonDeg = item.y / 1e7;
  const hasCoords = item.x !== 0 || item.y !== 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-mission-waypoint-card
      data-seq={item.seq}
      className={cn(
        "group relative flex items-stretch rounded-md border text-xs transition-colors",
        isDragging && "z-50 opacity-70 shadow-lg",
        isSelected
          ? "border-accent/50 bg-accent/10"
          : isActive
            ? "border-success/40 bg-success/5"
            : "border-border bg-bg-primary hover:border-border-light hover:bg-bg-tertiary/50",
      )}
      onClick={onSelect}
    >
      {/* Drag handle */}
      <button
        data-mission-drag-handle
        className="flex w-6 shrink-0 cursor-grab items-center justify-center rounded-l-md text-text-muted/50 transition-colors hover:bg-bg-tertiary hover:text-text-muted active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5">
        {/* Index badge */}
        <div
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold tabular-nums",
            isActive
              ? "bg-success/20 text-success"
              : isSelected
                ? "bg-accent/20 text-accent"
                : "bg-bg-tertiary text-text-muted",
          )}
        >
          {displayIndex}
        </div>

        {/* Command name */}
        <span className="shrink-0 font-medium text-text-primary">
          {commandName(item.command)}
        </span>

        {/* Coordinate preview */}
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

        {/* Altitude */}
        <span className="ml-auto shrink-0 tabular-nums text-text-muted">
          {item.z}m
        </span>

        {/* Active indicator */}
        {isActive && (
          <Navigation className="h-3 w-3 shrink-0 fill-success text-success" />
        )}
      </div>

      {/* Action buttons — visible on hover or when selected */}
      <div
        className={cn(
          "flex shrink-0 items-center gap-0.5 border-l border-border/50 px-1 transition-opacity",
          isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
        onClick={(e) => e.stopPropagation()}
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
