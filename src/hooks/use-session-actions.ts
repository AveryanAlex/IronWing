import { useCallback } from "react";
import { toast } from "sonner";
import {
  armVehicle,
  disarmVehicle,
  setFlightMode,
  type FlightModeEntry,
} from "../telemetry";
import { asErrorMessage } from "./use-session-helpers";

type SessionActionsParams = {
  connected: boolean;
  availableModes: FlightModeEntry[];
};

export function useSessionActions({
  connected,
  availableModes,
}: SessionActionsParams) {
  const arm = useCallback(async (force = false) => {
    if (!connected) {
      toast.error("Connect first");
      return;
    }

    try {
      await armVehicle(force);
    } catch (error) {
      toast.error("Failed to arm", { description: asErrorMessage(error) });
    }
  }, [connected]);

  const disarm = useCallback(async (force = false) => {
    if (!connected) {
      toast.error("Connect first");
      return;
    }

    try {
      await disarmVehicle(force);
    } catch (error) {
      toast.error("Failed to disarm", { description: asErrorMessage(error) });
    }
  }, [connected]);

  const setModeCmd = useCallback(async (customMode: number) => {
    if (!connected) {
      toast.error("Connect first");
      return;
    }

    try {
      await setFlightMode(customMode);
    } catch (error) {
      toast.error("Failed to set mode", { description: asErrorMessage(error) });
    }
  }, [connected]);

  const findModeNumber = useCallback((name: string): number | null => {
    const entry = availableModes.find((item) => item.name.toUpperCase() === name.toUpperCase());
    return entry?.custom_mode ?? null;
  }, [availableModes]);

  return {
    arm,
    disarm,
    setModeCmd,
    findModeNumber,
  };
}
