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
  const { missionType, isDirty, homePosition, homeSource, activeSeq, missionState, transferUi, roundtripStatus, displayTotal, cancel } = mission;

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
            <SyncBadge isDirty={isDirty} />
            <span className="text-[10px] tabular-nums text-text-muted">
              {displayTotal} item{displayTotal !== 1 ? "s" : ""}
            </span>
          </div>
        }
      />

      <MissionHomeCard
        homePosition={homePosition}
        homeSource={homeSource}
        missionType={missionType}
      />

      <MissionVehicleCard
        connected={connected}
        activeSeq={activeSeq}
        missionState={missionState}
        missionType={missionType}
      />

      <MissionTransferStatus
        transferUi={transferUi}
        roundtripStatus={roundtripStatus}
        onCancel={cancel}
      />
    </div>
  );
}
