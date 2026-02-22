import { useState, useCallback } from "react";
import { MissionMap } from "./MissionMap";
import { MapContextMenu } from "./MapContextMenu";
import type { useVehicle } from "../hooks/use-vehicle";
import type { useMission } from "../hooks/use-mission";

type MapPanelProps = {
  vehicle: ReturnType<typeof useVehicle>;
  mission: ReturnType<typeof useMission>;
};

type ContextMenuState = {
  x: number;
  y: number;
  lat: number;
  lng: number;
} | null;

export function MapPanel({ vehicle, mission }: MapPanelProps) {
  const { vehiclePosition, followVehicle, setFollowVehicle, guidedGoto } = vehicle;
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);

  const handleContextMenu = useCallback(
    (lat: number, lng: number, x: number, y: number) => {
      setContextMenu({ x, y, lat, lng });
    },
    []
  );

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  return (
    <div className="relative h-full overflow-hidden rounded-lg border border-border">
      <MissionMap
        missionItems={mission.items}
        homePosition={mission.missionType === "mission" ? mission.homePosition : null}
        selectedSeq={null}
        readOnly
        onContextMenu={handleContextMenu}
        vehiclePosition={vehiclePosition}
        currentMissionSeq={mission.missionState?.current_seq ?? null}
        followVehicle={followVehicle}
      />
      {contextMenu && (
        <MapContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          lat={contextMenu.lat}
          lng={contextMenu.lng}
          nearestSeq={null}
          mode="flight"
          missionType={mission.missionType}
          onFlyTo={(lat, lng) => { guidedGoto(lat, lng); closeContextMenu(); }}
          onSetHome={(lat, lng) => { mission.setHomeFromMap(lat, lng); closeContextMenu(); }}
          onClose={closeContextMenu}
        />
      )}
      <button
        onClick={() => setFollowVehicle((v) => !v)}
        className="absolute bottom-3 left-3 z-10 rounded-md border border-border-light bg-bg-primary/85 px-3 py-1.5 text-xs font-medium text-text-primary backdrop-blur-sm transition-colors hover:bg-bg-tertiary"
      >
        {followVehicle ? "Following" : "Follow Vehicle"}
      </button>
    </div>
  );
}
