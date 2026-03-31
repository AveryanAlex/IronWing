import { MapPin } from "lucide-react";
import { MissionPlannerSummary } from "./MissionPlannerSummary";
import { MissionItemList } from "./MissionItemList";
import { MissionInspector } from "./MissionInspector";
import { FenceInspector } from "./FenceInspector";
import { RallyInspector } from "./RallyInspector";
import { BulkEditPanel } from "./BulkEditPanel";
import type { useMission } from "../../hooks/use-mission";
import type { TerrainWarning } from "../../lib/mission-terrain-profile";

type MissionDesktopShellProps = {
  mission: ReturnType<typeof useMission>;
  connected: boolean;
  terrainWarnings?: Map<number, TerrainWarning>;
  onCardSelect?: (seq: number) => void;
};

export function MissionDesktopShell({ mission, connected, terrainWarnings, onCardSelect }: MissionDesktopShellProps) {
  const current = mission.current;
  const showBulkEditor = current.selectedCount > 1;

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
          <MissionItemList mission={mission} terrainWarnings={terrainWarnings} onCardSelect={onCardSelect} />

          {showBulkEditor ? (
            <div className="mt-2">
              <BulkEditPanel mission={mission} />
            </div>
          ) : current.selectedItem && current.selectedIndex !== null ? (
            <div className="mt-2">
              {current.tab === "fence" ? (
                <FenceInspector
                  draftItem={current.selectedItem}
                  index={current.selectedIndex}
                  readOnly={current.readOnly}
                  onUpdateRegion={mission.fence.updateRegion}
                />
              ) : current.tab === "rally" ? (
                <RallyInspector
                  draftItem={current.selectedItem}
                  index={current.selectedIndex}
                  previousItem={current.previousItem}
                  homePosition={current.homePosition}
                  readOnly={current.readOnly}
                  onUpdateAltitude={current.updateAltitude}
                  onUpdateCoordinate={current.updateCoordinate}
                  onUpdateAltitudeFrame={mission.rally.updateAltitudeFrame}
                />
              ) : (
                <MissionInspector
                  missionType={current.tab}
                  draftItem={current.selectedItem}
                  index={current.selectedIndex}
                  previousItem={current.previousItem}
                  homePosition={current.homePosition}
                  readOnly={current.readOnly}
                  isSelected={true}
                  onUpdateCommand={mission.mission.updateCommand}
                  onUpdateAltitude={current.updateAltitude}
                  onUpdateCoordinate={current.updateCoordinate}
                  onSetWaypointFromVehicle={mission.mission.setWaypointFromVehicle}
                  onSelect={current.select}
                />
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
