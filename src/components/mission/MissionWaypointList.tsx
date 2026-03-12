import { useCallback, useMemo } from "react";
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
import { MissionWaypointCard } from "./MissionWaypointCard";
import type { useMission } from "../../hooks/use-mission";

type MissionWaypointListProps = {
  mission: ReturnType<typeof useMission>;
  onSelectAndClose?: () => void;
  onCardSelect?: (seq: number) => void;
};

export function MissionWaypointList({
  mission,
  onSelectAndClose,
  onCardSelect,
}: MissionWaypointListProps) {
  const {
    draftItems,
    selectedSeq,
    activeSeq,
    missionType,
    setSelectedSeq,
    insertBefore,
    insertAfter,
    deleteAt,
    setCurrent,
    reorderItems,
  } = mission;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const sortableIds = useMemo(
    () => draftItems.map((d) => d.uiId),
    [draftItems],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        reorderItems(active.id as number, over.id as number);
      }
    },
    [reorderItems],
  );

  const handleSelect = useCallback(
    (seq: number) => {
      setSelectedSeq(seq);
      onCardSelect?.(seq);
      onSelectAndClose?.();
    },
    [setSelectedSeq, onCardSelect, onSelectAndClose],
  );

  const handleSetCurrent = useCallback(
    async (seq: number) => {
      setSelectedSeq(seq);
      await setCurrent(seq);
    },
    [setSelectedSeq, setCurrent],
  );

  if (draftItems.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <MapPin className="h-8 w-8 text-text-muted/30" />
        <p className="text-sm text-text-muted">No items yet</p>
        <p className="text-xs text-text-muted/70">
          {missionType === "mission"
            ? "Right-click on the map to add waypoints"
            : missionType === "fence"
              ? "Right-click on the map to add fence points"
              : "Right-click on the map to add rally points"}
        </p>
      </div>
    );
  }

  return (
    <div data-mission-waypoint-list className="space-y-1">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        modifiers={[restrictToVerticalAxis]}
      >
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          {draftItems.map((draftItem) => (
            <MissionWaypointCard
              key={draftItem.uiId}
              draftItem={draftItem}
              displayIndex={draftItem.item.seq + 1}
              isSelected={selectedSeq === draftItem.item.seq}
              isActive={activeSeq === draftItem.item.seq}
              missionType={missionType}
              onSelect={() => handleSelect(draftItem.item.seq)}
              onInsertBefore={() => insertBefore(draftItem.item.seq)}
              onInsertAfter={() => insertAfter(draftItem.item.seq)}
              onDelete={() => deleteAt(draftItem.item.seq)}
              onSetCurrent={() => handleSetCurrent(draftItem.item.seq)}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}
