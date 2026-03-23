import { Radio } from "lucide-react";
import { SectionCardHeader } from "../setup/shared/SectionCardHeader";
import type { MissionState, MissionType } from "../../mission";

type MissionVehicleCardProps = {
  connected: boolean;
  activeSeq: number | null;
  missionState: MissionState | null;
  missionType: MissionType;
};

export function MissionVehicleCard({ connected, activeSeq, missionState, missionType }: MissionVehicleCardProps) {
  const isMission = missionType === "mission";

  return (
    <div data-mission-vehicle-card className="rounded-lg border border-border bg-bg-primary p-3">
      <SectionCardHeader icon={Radio} title="Vehicle Status" />
      <div className="space-y-1 text-xs">
        <div className="flex items-baseline justify-between">
          <span className="text-text-muted">Link</span>
          <span className={connected ? "text-success" : "text-text-muted"}>
            {connected ? "Connected" : "Disconnected"}
          </span>
        </div>
        {isMission ? (
          <div className="flex items-baseline justify-between">
            <span className="text-text-muted">Active WP</span>
            <span className="tabular-nums text-text-secondary">
              {activeSeq !== null ? `#${activeSeq + 1}` : "—"}
            </span>
          </div>
        ) : (
          <div className="flex items-baseline justify-between">
            <span className="text-text-muted">{missionType === "fence" ? "Fence status" : "Rally status"}</span>
            <span className="text-[10px] text-text-muted/60">
              {missionType === "fence" ? "Upload to activate" : "Upload to register"}
            </span>
          </div>
        )}
        <div className="flex items-baseline justify-between">
          <span className="text-text-muted">Vehicle Items</span>
          <span className="tabular-nums text-text-secondary">
            {missionState?.plan ? missionState.plan.items.length : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}
