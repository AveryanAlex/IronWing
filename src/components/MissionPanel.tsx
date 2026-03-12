import { MissionWorkspace } from "./mission/MissionWorkspace";
import { MissionMobileDrawer } from "./mission/MissionMobileDrawer";
import type { useVehicle } from "../hooks/use-vehicle";
import type { useMission } from "../hooks/use-mission";
import type { useDeviceLocation } from "../hooks/use-device-location";

type MissionPanelProps = {
  vehicle: ReturnType<typeof useVehicle>;
  mission: ReturnType<typeof useMission>;
  deviceLocation: ReturnType<typeof useDeviceLocation>;
  isMobile: boolean;
};

export function MissionPanel({ vehicle, mission, deviceLocation, isMobile }: MissionPanelProps) {
  if (isMobile) {
    return <MissionMobileDrawer vehicle={vehicle} mission={mission} deviceLocation={deviceLocation} />;
  }
  return <MissionWorkspace vehicle={vehicle} mission={mission} deviceLocation={deviceLocation} />;
}
