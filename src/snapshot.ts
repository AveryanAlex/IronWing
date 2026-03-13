import { invoke } from "@platform/core";
import type { LinkState, Telemetry, VehicleState } from "./telemetry";
import type { HomePosition, MissionState } from "./mission";
import type { ParamStore, ParamProgress } from "./params";

export type VehicleSnapshot = {
  link_state: LinkState;
  vehicle_state: VehicleState;
  telemetry: Telemetry;
  home_position: HomePosition | null;
  mission_state: MissionState;
  param_store: ParamStore;
  param_progress: ParamProgress;
};

export async function getVehicleSnapshot(): Promise<VehicleSnapshot | null> {
  return invoke<VehicleSnapshot | null>("get_vehicle_snapshot");
}
