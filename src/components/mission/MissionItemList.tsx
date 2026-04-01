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
import { SurveyRegionCard } from "./SurveyRegionCard";
import type { MissionItem } from "../../lib/mavkit-types";
import type { TerrainWarning } from "../../lib/mission-terrain-profile";
import type { useMission } from "../../hooks/use-mission";
import type { SurveyRegion, SurveyRegionBlock } from "../../lib/survey-region";

type MissionItemListProps = {
  mission: ReturnType<typeof useMission>;
  terrainWarnings?: Map<number, TerrainWarning>;
  surveyRegions?: Map<string, SurveyRegion>;
  surveyRegionOrder?: SurveyRegionBlock[];
  activeSurveyRegionId?: string | null;
  onSelectSurveyRegion?: (regionId: string) => void;
  onDissolveSurveyRegion?: (regionId: string) => void;
  onDeleteSurveyRegion?: (regionId: string) => void;
  onSelectAndClose?: () => void;
  onCardSelect?: (seq: number) => void;
};

type JumpArc = {
  source: number;
  target: number;
  lane: number;
};

type OrderedSurveyRegion = {
  region: SurveyRegion;
  position: number;
  orderIndex: number;
};

type MissionListEntry =
  | { kind: "item"; draftItem: ReturnType<typeof useMission>["current"]["draftItems"][number] }
  | { kind: "survey_region"; orderedRegion: OrderedSurveyRegion };

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
  const sorted = [...arcs].sort(
    (a, b) => Math.abs(a.target - a.source) - Math.abs(b.target - b.source),
  );

  for (let i = 0; i < sorted.length; i++) {
    const arc = sorted[i];
    const minRow = Math.min(arc.source, arc.target);
    const maxRow = Math.max(arc.source, arc.target);

    let lane = 0;
    let conflict = true;
    while (conflict) {
      conflict = false;
      for (let j = 0; j < i; j++) {
        const other = sorted[j];
        if (other.lane !== lane) continue;
        const otherMin = Math.min(other.source, other.target);
        const otherMax = Math.max(other.source, other.target);
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
            <polygon
              points={
                goingUp
                  ? `${x},${tipY} ${x - ARROW_SIZE},${tipY + ARROW_SIZE * 1.5} ${x + ARROW_SIZE},${tipY + ARROW_SIZE * 1.5}`
                  : `${x},${tipY} ${x - ARROW_SIZE},${tipY - ARROW_SIZE * 1.5} ${x + ARROW_SIZE},${tipY - ARROW_SIZE * 1.5}`
              }
              fill="currentColor"
              className="text-text-muted/60"
            />
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
  terrainWarnings,
  surveyRegions,
  surveyRegionOrder,
  activeSurveyRegionId,
  onSelectSurveyRegion,
  onDissolveSurveyRegion,
  onDeleteSurveyRegion,
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

  const orderedSurveyRegions = useMemo<OrderedSurveyRegion[]>(() => {
    if (!surveyRegions || !surveyRegionOrder || current.tab !== "mission") {
      return [];
    }

    return surveyRegionOrder
      .map((block, orderIndex) => {
        const region = surveyRegions.get(block.regionId);
        if (!region) {
          return null;
        }
        return {
          region,
          position: Math.max(0, Math.trunc(block.position)),
          orderIndex,
        } satisfies OrderedSurveyRegion;
      })
      .filter((entry): entry is OrderedSurveyRegion => entry !== null)
      .sort((left, right) => left.position - right.position || left.orderIndex - right.orderIndex);
  }, [current.tab, surveyRegionOrder, surveyRegions]);

  const listEntries = useMemo<MissionListEntry[]>(() => {
    if (orderedSurveyRegions.length === 0) {
      return current.draftItems.map((draftItem) => ({ kind: "item", draftItem }));
    }

    const entries: MissionListEntry[] = [];
    let regionIndex = 0;

    const appendRegionsAt = (position: number) => {
      while (regionIndex < orderedSurveyRegions.length && orderedSurveyRegions[regionIndex]?.position === position) {
        entries.push({
          kind: "survey_region",
          orderedRegion: orderedSurveyRegions[regionIndex]!,
        });
        regionIndex += 1;
      }
    };

    appendRegionsAt(0);

    current.draftItems.forEach((draftItem, index) => {
      entries.push({ kind: "item", draftItem });
      appendRegionsAt(index + 1);
    });

    while (regionIndex < orderedSurveyRegions.length) {
      entries.push({
        kind: "survey_region",
        orderedRegion: orderedSurveyRegions[regionIndex]!,
      });
      regionIndex += 1;
    }

    return entries;
  }, [current.draftItems, orderedSurveyRegions]);

  const finalizeSelection = useCallback((seq: number) => {
    onCardSelect?.(seq);
    onSelectAndClose?.();
  }, [onCardSelect, onSelectAndClose]);

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
      finalizeSelection(seq);
    },
    [current, finalizeSelection],
  );

  const handleRangeSelect = useCallback(
    (seq: number) => {
      const anchorIndex = current.selectionAnchorIndex ?? current.selectedIndex ?? seq;
      current.selectRange(anchorIndex, seq);
      finalizeSelection(seq);
    },
    [current, finalizeSelection],
  );

  const handleToggleSelect = useCallback(
    (seq: number) => {
      current.toggleSelect(seq);
      finalizeSelection(seq);
    },
    [current, finalizeSelection],
  );

  const handleSetCurrent = useCallback(
    async (seq: number) => {
      current.select(seq);
      await mission.mission.setCurrent(seq);
    },
    [current, mission.mission],
  );

  if (listEntries.length === 0) {
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
            {listEntries.map((entry) => {
              if (entry.kind === "survey_region") {
                const { orderedRegion } = entry;
                return (
                  <SurveyRegionCard
                    key={orderedRegion.region.id}
                    region={orderedRegion.region}
                    label={`Region ${orderedRegion.orderIndex + 1}`}
                    selected={activeSurveyRegionId === orderedRegion.region.id}
                    onSelect={() => {
                      onSelectSurveyRegion?.(orderedRegion.region.id);
                      onSelectAndClose?.();
                    }}
                    onDissolve={() => onDissolveSurveyRegion?.(orderedRegion.region.id)}
                    onDelete={() => onDeleteSurveyRegion?.(orderedRegion.region.id)}
                  />
                );
              }

              const { draftItem } = entry;
              const isPrimarySelected = current.selectedIndex === draftItem.index;
              const isMultiSelected = current.selectedUiIds.has(draftItem.uiId) && !isPrimarySelected;

              return (
                <MissionItemCard
                  key={draftItem.uiId}
                  draftItem={draftItem}
                  displayIndex={draftItem.index + 1}
                  isPrimarySelected={isPrimarySelected}
                  isMultiSelected={isMultiSelected}
                  isActive={mission.vehicle.activeSeq === draftItem.index}
                  missionType={current.tab}
                  readOnly={current.readOnly}
                  terrainWarning={terrainWarnings?.get(draftItem.index) ?? "none"}
                  onSelect={() => handleSelect(draftItem.index)}
                  onShiftClick={() => handleRangeSelect(draftItem.index)}
                  onCtrlClick={() => handleToggleSelect(draftItem.index)}
                  onInsertBefore={() => current.insertBefore(draftItem.index)}
                  onInsertAfter={() => current.insertAfter(draftItem.index)}
                  onDelete={() => current.deleteAt(draftItem.index)}
                  onSetCurrent={() => handleSetCurrent(draftItem.index)}
                />
              );
            })}
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
