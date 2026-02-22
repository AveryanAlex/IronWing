import { useState, useCallback, useEffect, useRef } from "react";
import { Locate } from "lucide-react";
import { toast } from "sonner";
import { MissionMap } from "./MissionMap";
import { MapContextMenu } from "./MapContextMenu";
import type { useVehicle } from "../hooks/use-vehicle";
import type { useMission } from "../hooks/use-mission";
import type { useDeviceLocation } from "../hooks/use-device-location";

type MapPanelProps = {
  vehicle: ReturnType<typeof useVehicle>;
  mission: ReturnType<typeof useMission>;
  deviceLocation: ReturnType<typeof useDeviceLocation>;
};

type ContextMenuState = {
  x: number;
  y: number;
  lat: number;
  lng: number;
} | null;

export function MapPanel({ vehicle, mission, deviceLocation }: MapPanelProps) {
  const { vehiclePosition, followVehicle, setFollowVehicle, guidedGoto } = vehicle;
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [flyToKey, setFlyToKey] = useState(0);
  const pendingFlyToRef = useRef(false);

  // Notify user when geolocation permission is denied asynchronously
  useEffect(() => {
    if (deviceLocation.permissionDenied) {
      toast.error("Location permission denied — enable it in system settings");
    }
  }, [deviceLocation.permissionDenied]);

  // When location arrives after a pending "My Location" click, fly there once
  useEffect(() => {
    if (pendingFlyToRef.current && deviceLocation.location) {
      pendingFlyToRef.current = false;
      setFlyToKey((k) => k + 1);
    }
  }, [deviceLocation.location]);

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
        deviceLocation={deviceLocation.location}
        flyToDeviceLocation={flyToKey}
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
      <div className="absolute bottom-3 left-3 z-10 flex gap-2">
        <button
          onClick={() => setFollowVehicle((v) => !v)}
          className="rounded-md border border-border-light bg-bg-primary/85 px-3 py-1.5 text-xs font-medium text-text-primary backdrop-blur-sm transition-colors hover:bg-bg-tertiary"
        >
          {followVehicle ? "Following" : "Follow Vehicle"}
        </button>
        <button
          onClick={() => {
            if (!deviceLocation.supported) {
              toast.error("Geolocation is not available on this device");
              return;
            }
            if (deviceLocation.permissionDenied) {
              toast.error("Location permission was denied — enable it in system settings");
              return;
            }
            if (deviceLocation.location) {
              setFlyToKey((k) => k + 1);
            } else {
              pendingFlyToRef.current = true;
            }
            deviceLocation.startWatching();
          }}
          title="My Location"
          className="flex items-center gap-1.5 rounded-md border border-border-light bg-bg-primary/85 px-3 py-1.5 text-xs font-medium text-text-primary backdrop-blur-sm transition-colors hover:bg-bg-tertiary"
        >
          <Locate size={14} />
          <span className="hidden sm:inline">My Location</span>
        </button>
      </div>
    </div>
  );
}
