import { useState, useCallback, useEffect, useRef } from "react";
import { Locate, Navigation } from "lucide-react";
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

const LONG_PRESS_MS = 500;

export function MapPanel({ vehicle, mission, deviceLocation }: MapPanelProps) {
  const { vehiclePosition, guidedGoto } = vehicle;
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);

  const [followTarget, setFollowTarget] = useState<"vehicle" | "device" | null>(null);
  const [centerVehicleKey, setCenterVehicleKey] = useState(0);
  const [centerDeviceKey, setCenterDeviceKey] = useState(0);
  const pendingDeviceCenterRef = useRef(false);

  // Notify user when geolocation permission is denied asynchronously
  useEffect(() => {
    if (deviceLocation.permissionDenied) {
      toast.error("Location permission denied — enable it in system settings");
    }
  }, [deviceLocation.permissionDenied]);

  // When device location arrives after a pending center request, center once
  useEffect(() => {
    if (pendingDeviceCenterRef.current && deviceLocation.location) {
      pendingDeviceCenterRef.current = false;
      setCenterDeviceKey((k) => k + 1);
    }
  }, [deviceLocation.location]);

  const handleUserInteraction = useCallback(() => {
    setFollowTarget(null);
  }, []);

  const handleContextMenu = useCallback(
    (lat: number, lng: number, x: number, y: number) => {
      setContextMenu({ x, y, lat, lng });
    },
    []
  );
  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  // --- Vehicle button handlers ---
  const vehicleLpRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onVehiclePointerDown = useCallback(() => {
    vehicleLpRef.current = setTimeout(() => {
      vehicleLpRef.current = null;
      if (!vehiclePosition) {
        toast.error("No vehicle position");
        return;
      }
      setFollowTarget("vehicle");
      setCenterVehicleKey((k) => k + 1);
      toast.success("Following vehicle");
    }, LONG_PRESS_MS);
  }, [vehiclePosition]);

  const onVehiclePointerUp = useCallback(() => {
    if (vehicleLpRef.current !== null) {
      // Short press — long press timer didn't fire
      clearTimeout(vehicleLpRef.current);
      vehicleLpRef.current = null;
      if (!vehiclePosition) {
        toast.error("No vehicle position");
        return;
      }
      setCenterVehicleKey((k) => k + 1);
    }
  }, [vehiclePosition]);

  const onVehiclePointerLeave = useCallback(() => {
    if (vehicleLpRef.current !== null) {
      clearTimeout(vehicleLpRef.current);
      vehicleLpRef.current = null;
    }
  }, []);

  // --- Device button handlers ---
  const deviceLpRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ensureDeviceLocation = useCallback(() => {
    if (!deviceLocation.supported) {
      toast.error("Geolocation is not available on this device");
      return false;
    }
    if (deviceLocation.permissionDenied) {
      toast.error("Location permission was denied — enable it in system settings");
      return false;
    }
    deviceLocation.startWatching();
    return true;
  }, [deviceLocation]);

  const onDevicePointerDown = useCallback(() => {
    deviceLpRef.current = setTimeout(() => {
      deviceLpRef.current = null;
      if (!ensureDeviceLocation()) return;
      if (deviceLocation.location) {
        setFollowTarget("device");
        setCenterDeviceKey((k) => k + 1);
        toast.success("Following my location");
      } else {
        pendingDeviceCenterRef.current = true;
        setFollowTarget("device");
        toast.success("Following my location");
      }
    }, LONG_PRESS_MS);
  }, [ensureDeviceLocation, deviceLocation.location]);

  const onDevicePointerUp = useCallback(() => {
    if (deviceLpRef.current !== null) {
      clearTimeout(deviceLpRef.current);
      deviceLpRef.current = null;
      if (!ensureDeviceLocation()) return;
      if (deviceLocation.location) {
        setCenterDeviceKey((k) => k + 1);
      } else {
        pendingDeviceCenterRef.current = true;
      }
    }
  }, [ensureDeviceLocation, deviceLocation.location]);

  const onDevicePointerLeave = useCallback(() => {
    if (deviceLpRef.current !== null) {
      clearTimeout(deviceLpRef.current);
      deviceLpRef.current = null;
    }
  }, []);

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
        followTarget={followTarget}
        centerOnVehicleKey={centerVehicleKey}
        centerOnDeviceKey={centerDeviceKey}
        onUserInteraction={handleUserInteraction}
        currentMissionSeq={mission.missionState?.current_seq ?? null}
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
      <div className="map-locate-group">
        <button
          className={`map-locate-btn${followTarget === "device" ? " is-active" : ""}`}
          title="My Location (hold to follow)"
          onPointerDown={onDevicePointerDown}
          onPointerUp={onDevicePointerUp}
          onPointerLeave={onDevicePointerLeave}
          onContextMenu={(e) => e.preventDefault()}
        >
          <Locate size={16} />
        </button>
        <button
          className={`map-locate-btn${followTarget === "vehicle" ? " is-active" : ""}`}
          title="Vehicle Location (hold to follow)"
          onPointerDown={onVehiclePointerDown}
          onPointerUp={onVehiclePointerUp}
          onPointerLeave={onVehiclePointerLeave}
          onContextMenu={(e) => e.preventDefault()}
        >
          <Navigation size={16} />
        </button>
      </div>
    </div>
  );
}
