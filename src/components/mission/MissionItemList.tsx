import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { MapPin } from "lucide-react";
import { MissionItemCard } from "./MissionItemCard";
import type { MissionItem } from "../../lib/mavkit-types";
import type { useMission } from "../../hooks/use-mission";

type MissionItemListProps = {
  mission: ReturnType<typeof useMission>;
  onSelectAndClose?: () => void;
  onCardSelect?: (seq: number) => void;
};

type JumpArc = {
  source: number;
  target: number;
  lane: number;
};

/** Extract DoJump source→target pairs from mission items. */
function extractJumps(items: ReturnType<typeof useMission>["current"]["draftItems"]): Array<{ source: number; target: number }> {
  const jumps: Array<{ source: number; target: number }> = [];
  for (const item of items) {
    if (!("command" in item.document)) continue;
    const cmd = (item.document as MissionItem).command;
    if ("Do" in cmd && typeof cmd.Do === "object" && cmd.Do !== null && "Jump" in cmd.Do) {
      jumps.push({ source: item.index, target: cmd.Do.Jump.target_index });
    }
  }
  return jumps;
}

/** Assign non-overlapping lanes to jump arcs. */
function assignLanes(jumps: Array<{ source: number; target: number }>): JumpArc[] {
  if (jumps.length === 0) return [];

  const arcs: JumpArc[] = jumps.map((j) => ({ ...j, lane: 0 }));
  // Sort by span size (smaller spans get inner lanes)
  const sorted = [...arcs].sort(
    (a, b) => Math.abs(a.target - a.source) - Math.abs(b.target - b.source),
  );

  for (let i = 0; i < sorted.length; i++) {
    const arc = sorted[i];
    const minRow = Math.min(arc.source, arc.target);
    const maxRow = Math.max(arc.source, arc.target);

    // Find the first lane that doesn't overlap with any already-assigned arc
    let lane = 0;
    let conflict = true;
    while (conflict) {
      conflict = false;
      for (let j = 0; j < i; j++) {
        const other = sorted[j];
        if (other.lane !== lane) continue;
        const otherMin = Math.min(other.source, other.target);
        const otherMax = Math.max(other.source, other.target);
        // Overlap: ranges intersect
        if (minRow <= otherMax && maxRow >= otherMin) {
          conflict = true;
          lane++;
          break;
        }
      }
    }
    arc.lane = lane;
  }

  return arcs;
}

const LANE_WIDTH = 10;
const GUTTER_BASE = 6;
const ARROW_SIZE = 4;

function JumpGutter({
  arcs,
  rowCount,
  listRef,
}: {
  arcs: JumpArc[];
  rowCount: number;
  listRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [rowCenters, setRowCenters] = useState<number[]>([]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const cards = list.querySelectorAll("[data-mission-waypoint-card]");
    if (cards.length === 0) return;

    const listRect = list.getBoundingClientRect();
    const centers: number[] = [];
    cards.forEach((card) => {
      const rect = card.getBoundingClientRect();
      centers.push(rect.top - listRect.top + rect.height / 2);
    });
    setRowCenters(centers);
  }, [rowCount, listRef]);

  if (rowCenters.length === 0 || arcs.length === 0) return null;

  const maxLane = Math.max(...arcs.map((a) => a.lane));
  const gutterWidth = GUTTER_BASE + (maxLane + 1) * LANE_WIDTH;
  const listHeight = rowCenters.length > 0
    ? rowCenters[rowCenters.length - 1] + 16
    : 0;

  return (
    <svg
      className="pointer-events-none absolute top-0 right-0"
      width={gutterWidth}
      height={listHeight}
      style={{ overflow: "visible" }}
    >
      {arcs.map((arc, i) => {
        const sy = rowCenters[arc.source];
        const ty = rowCenters[arc.target];
        if (sy === undefined || ty === undefined) return null;

        const x = gutterWidth - GUTTER_BASE - arc.lane * LANE_WIDTH;
        const goingUp = ty < sy;
        const tipY = ty;
        const dashEnd = goingUp ? ty + ARROW_SIZE + 1 : ty - ARROW_SIZE - 1;

        return (
          <g key={i}>
            {/* Dashed vertical line from source to near target */}
            <line
              x1={x}
              y1={sy}
              x2={x}
              y2={dashEnd}
              stroke="currentColor"
              className="text-text-muted/40"
              strokeWidth={1.5}
              strokeDasharray="3 2"
            />
            {/* Solid arrow tip */}
            <polygon
              points={
                goingUp
                  ? `${x},${tipY} ${x - ARROW_SIZE},${tipY + ARROW_SIZE * 1.5} ${x + ARROW_SIZE},${tipY + ARROW_SIZE * 1.5}`
                  : `${x},${tipY} ${x - ARROW_SIZE},${tipY - ARROW_SIZE * 1.5} ${x + ARROW_SIZE},${tipY - ARROW_SIZE * 1.5}`
              }
              fill="currentColor"
              className="text-text-muted/60"
            />
            {/* Small horizontal ticks at source and target */}
            <line
              x1={0}
              y1={sy}
              x2={x}
              y2={sy}
              stroke="currentColor"
              className="text-text-muted/25"
              strokeWidth={1}
            />
          </g>
        );
      })}
    </svg>
  );
}

export function MissionItemList({
  mission,
  onSelectAndClose,
  onCardSelect,
}: MissionItemListProps) {
  const current = mission.current;
  const listRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const sortableIds = useMemo(
    () => current.draftItems.map((d) => d.uiId),
    [current.draftItems],
  );

  const jumps = useMemo(
    () => (current.tab === "mission" ? extractJumps(current.draftItems) : []),
    [current.draftItems, current.tab],
  );

  const arcs = useMemo(() => assignLanes(jumps), [jumps]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        current.reorderItems(active.id as number, over.id as number);
      }
    },
    [current],
  );

  const handleSelect = useCallback(
    (seq: number) => {
      current.select(seq);
      onCardSelect?.(seq);
      onSelectAndClose?.();
    },
    [current, onCardSelect, onSelectAndClose],
  );

  const handleSetCurrent = useCallback(
    async (seq: number) => {
      current.select(seq);
      await mission.mission.setCurrent(seq);
    },
    [current, mission.mission],
  );

  if (current.draftItems.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <MapPin className="h-8 w-8 text-text-muted/30" />
        <p className="text-sm text-text-muted">No items yet</p>
        <p className="text-xs text-text-muted/70">
          {current.tab === "mission"
            ? "Right-click on the map to add waypoints"
            : current.tab === "fence"
              ? "Right-click on the map to add fence points"
              : "Right-click on the map to add rally points"}
        </p>
      </div>
    );
  }

  const hasJumps = arcs.length > 0;
  const maxLane = hasJumps ? Math.max(...arcs.map((a) => a.lane)) : 0;
  const gutterPadding = hasJumps ? GUTTER_BASE + (maxLane + 1) * LANE_WIDTH : 0;

  return (
    <div data-mission-waypoint-list className="relative" ref={listRef}>
      <div className="space-y-1" style={gutterPadding > 0 ? { paddingRight: gutterPadding } : undefined}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          autoScroll={!current.readOnly}
          modifiers={[restrictToVerticalAxis]}
        >
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            {current.draftItems.map((draftItem) => (
              <MissionItemCard
                key={draftItem.uiId}
                draftItem={draftItem}
                displayIndex={draftItem.index + 1}
                isSelected={current.selectedIndex === draftItem.index}
                isActive={mission.vehicle.activeSeq === draftItem.index}
                missionType={current.tab}
                readOnly={current.readOnly}
                onSelect={() => handleSelect(draftItem.index)}
                onInsertBefore={() => current.insertBefore(draftItem.index)}
                onInsertAfter={() => current.insertAfter(draftItem.index)}
                onDelete={() => current.deleteAt(draftItem.index)}
                onSetCurrent={() => handleSetCurrent(draftItem.index)}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
      {hasJumps && (
        <JumpGutter
          arcs={arcs}
          rowCount={current.draftItems.length}
          listRef={listRef}
        />
      )}
    </div>
  );
}
