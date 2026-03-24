import { MapPin } from "lucide-react";
import { MissionPlannerSummary } from "./MissionPlannerSummary";
import { MissionItemList } from "./MissionItemList";
import { MissionInspector } from "./MissionInspector";
import type { useMission } from "../../hooks/use-mission";

type MissionDesktopShellProps = {
  mission: ReturnType<typeof useMission>;
  connected: boolean;
  onCardSelect?: (seq: number) => void;
};

export function MissionDesktopShell({ mission, connected, onCardSelect }: MissionDesktopShellProps) {
  const current = mission.current;

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
            {current.tab === "mission" ? "Waypoints" : current.tab === "fence" ? "Fence" : "Rally"}
          </span>
          <span className="ml-auto text-xs tabular-nums text-text-muted">
            {current.displayTotal} item{current.displayTotal !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="px-2.5 pb-2.5">
          <MissionItemList mission={mission} onCardSelect={onCardSelect} />

          {current.selectedItem && current.selectedIndex !== null && (
            <div className="mt-2">
              <MissionInspector
                missionType={current.tab}
                draftItem={current.selectedItem}
                index={current.selectedIndex}
                previousItem={current.previousItem}
                homePosition={current.homePosition}
                readOnly={current.readOnly}
                isSelected={true}
                onUpdateCommand={current.tab === "mission" ? mission.mission.updateCommand : undefined}
                onUpdateAltitude={current.updateAltitude}
                onUpdateCoordinate={current.updateCoordinate}
                onSelect={current.select}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
