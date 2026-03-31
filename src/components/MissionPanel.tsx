import { useEffect } from "react";
import { MissionWorkspace } from "./mission/MissionWorkspace";
import { MissionMobileDrawer } from "./mission/MissionMobileDrawer";
import type { useSession } from "../hooks/use-session";
import type { useMission } from "../hooks/use-mission";
import type { useDeviceLocation } from "../hooks/use-device-location";

type MissionPanelProps = {
  vehicle: ReturnType<typeof useSession>;
  mission: ReturnType<typeof useMission>;
  deviceLocation: ReturnType<typeof useDeviceLocation>;
  isMobile: boolean;
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tagName = target.tagName;
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
}

export function MissionPanel({ vehicle, mission, deviceLocation, isMobile }: MissionPanelProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const editable = isEditableTarget(event.target) || isEditableTarget(document.activeElement);

      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "z") {
        if (editable) return;

        if (event.shiftKey) {
          if (!mission.current.canRedo) return;
          event.preventDefault();
          mission.current.redo();
          return;
        }

        if (!mission.current.canUndo) return;
        event.preventDefault();
        mission.current.undo();
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (editable) return;
        if (mission.current.selectedCount === 0) return;
        event.preventDefault();
        mission.current.bulkDelete();
        return;
      }

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (editable) return;
        const { selectedIndex, displayTotal } = mission.current;
        if (selectedIndex === null) return;
        const next = event.key === "ArrowDown" ? selectedIndex + 1 : selectedIndex - 1;
        if (next < 0 || next >= displayTotal) return;
        event.preventDefault();
        mission.current.select(next);
        return;
      }

      if (event.key === "Escape") {
        if (editable) return;
        if (mission.current.selectedCount === 0) return;
        event.preventDefault();
        mission.current.deselectAll();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mission]);

  if (isMobile) {
    return <MissionMobileDrawer vehicle={vehicle} mission={mission} deviceLocation={deviceLocation} />;
  }
  return <MissionWorkspace vehicle={vehicle} mission={mission} deviceLocation={deviceLocation} />;
}
