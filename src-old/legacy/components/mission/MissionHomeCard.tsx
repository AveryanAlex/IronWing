import { Home } from "lucide-react";
import { SectionCardHeader } from "../setup/shared/SectionCardHeader";
import type { HomePosition } from "../../mission";

type MissionHomeCardProps = {
  homePosition: HomePosition | null;
  homeSource: "vehicle" | "user" | "download" | null;
  missionType: string;
};

const DOCS_URLS: Record<string, string> = {
  mission: "https://ardupilot.org/copter/docs/common-planning-a-mission-with-waypoints-and-events.html",
  fence: "https://ardupilot.org/copter/docs/common-ac2_simple_geofence.html",
  rally: "https://ardupilot.org/copter/docs/common-rally-points.html",
};

export function MissionHomeCard({ homePosition, homeSource, missionType }: MissionHomeCardProps) {
  const isMission = missionType === "mission";

  return (
    <div data-mission-home-card className="rounded-lg border border-border bg-bg-primary p-3">
      <SectionCardHeader icon={Home} title={isMission ? "Home Position" : missionType === "fence" ? "Fence Info" : "Rally Info"} docsUrl={DOCS_URLS[missionType]} docsLabel="ArduPilot Docs" />
      {!isMission ? (
        <p className="text-xs leading-relaxed text-text-muted">
          {missionType === "fence"
            ? "Geofence boundaries are defined independently of home. Points form inclusion or exclusion polygons. The vehicle triggers a failsafe action (RTL, Land, or Hold) when it crosses a fence boundary."
            : "Rally points are standalone return locations independent of home. On RTL, the vehicle navigates to the nearest rally point. Place them in safe, open landing areas away from people."}
        </p>
      ) : homePosition ? (
        <div className="space-y-1 text-xs">
          <div className="flex items-baseline justify-between">
            <span className="text-text-muted">Position</span>
            <span className="tabular-nums text-text-secondary">
              {homePosition.latitude_deg.toFixed(6)}, {homePosition.longitude_deg.toFixed(6)}
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-text-muted">Altitude</span>
            <span className="tabular-nums text-text-secondary">{homePosition.altitude_m.toFixed(1)} m</span>
          </div>
          {homeSource && (
            <div className="flex items-baseline justify-between">
              <span className="text-text-muted">Source</span>
              <span className="text-text-muted capitalize">{homeSource}</span>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-text-muted">
          Not set — right-click on the map or use &ldquo;Home from Vehicle&rdquo;
        </p>
      )}
    </div>
  );
}
