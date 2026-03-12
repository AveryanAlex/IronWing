import { useMemo } from "react";
import { MapPin } from "lucide-react";
import { MissionPlannerSummary } from "./MissionPlannerSummary";
import { MissionWaypointList } from "./MissionWaypointList";
import { MissionInspector } from "./MissionInspector";
import type { useMission } from "../../hooks/use-mission";

type MissionDesktopShellProps = {
  mission: ReturnType<typeof useMission>;
  connected: boolean;
  onCardSelect?: (seq: number) => void;
};

export function MissionDesktopShell({ mission, connected, onCardSelect }: MissionDesktopShellProps) {
  const selectedDraftItem = useMemo(() => {
    if (mission.selectedSeq === null) return null;
    return mission.draftItems[mission.selectedSeq] ?? null;
  }, [mission.draftItems, mission.selectedSeq]);

  const previousItem = useMemo(() => {
    if (mission.selectedSeq === null || mission.selectedSeq === 0) return null;
    return mission.items[mission.selectedSeq - 1] ?? null;
  }, [mission.items, mission.selectedSeq]);

  return (
    <div
      data-mission-side-panel
      className="flex h-full min-w-[280px] flex-col overflow-hidden rounded-lg border border-border bg-bg-secondary"
    >
      <div className="flex-1 overflow-y-auto">
        <div className="p-2.5">
          <MissionPlannerSummary mission={mission} connected={connected} />
        </div>

        <div className="mx-2.5 border-t border-border" />

        <div className="sticky top-0 z-10 flex items-center gap-2 bg-bg-secondary px-3 py-2">
          <MapPin className="h-3.5 w-3.5 text-accent" />
          <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            {mission.missionType === "mission" ? "Waypoints" : mission.missionType === "fence" ? "Fence" : "Rally"}
          </span>
          <span className="ml-auto text-xs tabular-nums text-text-muted">
            {mission.items.length} item{mission.items.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="px-2.5 pb-2.5">
          <MissionWaypointList mission={mission} onCardSelect={onCardSelect} />

          {selectedDraftItem && mission.selectedSeq !== null && (
            <div className="mt-2">
              <MissionInspector
                draftItem={selectedDraftItem}
                index={mission.selectedSeq}
                previousItem={previousItem}
                homePosition={mission.homePosition}
                isSelected={true}
                onUpdateField={mission.updateField}
                onUpdateFrame={mission.updateFrame}
                onUpdateCoordinate={mission.updateCoordinate}
                onSelect={mission.setSelectedSeq}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
