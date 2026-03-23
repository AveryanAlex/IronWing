import { Map, CircleDot, CheckCircle2 } from "lucide-react";
import { SetupSectionIntro } from "../setup/shared/SetupSectionIntro";
import { MissionHomeCard } from "./MissionHomeCard";
import { MissionVehicleCard } from "./MissionVehicleCard";
import { MissionTransferStatus } from "./MissionTransferStatus";
import type { useMission } from "../../hooks/use-mission";
import type { MissionType } from "../../mission";

type MissionPlannerSummaryProps = {
  mission: ReturnType<typeof useMission>;
  connected: boolean;
};

const MISSION_DESCRIPTIONS: Record<MissionType, string> = {
  mission: "Waypoint sequence with home position, navigation commands, and DO actions.",
  fence: "Geofence inclusion/exclusion zones. Vehicle triggers RTL or LAND when breaching a fence boundary. Upload requires at least 4 points for a closed polygon.",
  rally: "Alternate return-to-launch locations. On RTL, the vehicle flies to the nearest rally point instead of home. Useful for directing landings away from crowds or obstacles.",
};

const MISSION_DOCS: Record<MissionType, string> = {
  mission: "https://ardupilot.org/copter/docs/common-planning-a-mission-with-waypoints-and-events.html",
  fence: "https://ardupilot.org/copter/docs/common-ac2_simple_geofence.html",
  rally: "https://ardupilot.org/copter/docs/common-rally-points.html",
};

function SyncBadge({ isDirty }: { isDirty: boolean }) {
  if (isDirty) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
        <CircleDot className="h-2.5 w-2.5" />
        Unsaved
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-1.5 py-0.5 text-[10px] font-semibold text-success">
      <CheckCircle2 className="h-2.5 w-2.5" />
      Synced
    </span>
  );
}

export function MissionPlannerSummary({ mission, connected }: MissionPlannerSummaryProps) {
  const current = mission.current;
  const missionType = mission.selectedTab;

  return (
    <div className="space-y-2">
      <SetupSectionIntro
        icon={Map}
        title={missionType}
        description={MISSION_DESCRIPTIONS[missionType]}
        docsUrl={MISSION_DOCS[missionType]}
        docsLabel="ArduPilot Docs"
        actionSlot={
          <div className="flex items-center gap-2">
            <SyncBadge isDirty={current.isDirty} />
            <span className="text-[10px] tabular-nums text-text-muted">
              {current.displayTotal} item{current.displayTotal !== 1 ? "s" : ""}
            </span>
          </div>
        }
      />

      {current.recoverableAvailable && (
        <div className="flex items-center justify-between rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
          <span>Recoverable local draft available after the last session reset.</span>
          <button
            type="button"
            onClick={current.recoverDraft}
            className="rounded border border-warning/30 px-2 py-1 font-semibold text-warning transition-colors hover:bg-warning/10"
          >
            Recover draft
          </button>
        </div>
      )}

      <MissionHomeCard
        homePosition={current.homePosition}
        homeSource={current.homeSource}
        missionType={missionType}
      />

      <MissionVehicleCard
        connected={connected}
        activeSeq={mission.vehicle.activeSeq}
        missionState={mission.vehicle.missionState}
        missionType={missionType}
      />

      <MissionTransferStatus
        transferUi={current.transferUi}
        roundtripStatus={current.roundtripStatus}
        onCancel={current.cancel}
      />
    </div>
  );
}
