import { invoke } from "@tauri-apps/api/core";

export type FlightPathPoint = {
  timestamp_usec: number;
  lat: number;
  lon: number;
  alt: number;
  heading: number;
};

export async function getFlightPath(
  maxPoints?: number,
): Promise<FlightPathPoint[]> {
  return invoke<FlightPathPoint[]>("log_get_flight_path", {
    maxPoints: maxPoints ?? null,
  });
}
