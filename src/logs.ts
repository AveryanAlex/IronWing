import { invoke } from "@platform/core";
import { listen, type UnlistenFn } from "@platform/event";

export type LogType = "tlog" | "bin";

export type LogSummary = {
  file_name: string;
  start_usec: number;
  end_usec: number;
  duration_secs: number;
  total_entries: number;
  message_types: Record<string, number>;
  log_type: LogType;
};

export type LogDataPoint = {
  timestamp_usec: number;
  fields: Record<string, number>;
};

export type LogLoadPhase = "parsing" | "indexing" | "completed" | "failed";

export type LogProgress = {
  phase: LogLoadPhase;
  parsed: number;
};

export async function openLog(path: string): Promise<LogSummary> {
  return invoke<LogSummary>("log_open", { path });
}

export async function queryLogMessages(
  msgType: string,
  startUsec?: number,
  endUsec?: number,
  maxPoints?: number,
): Promise<LogDataPoint[]> {
  return invoke<LogDataPoint[]>("log_query", {
    msgType,
    startUsec: startUsec ?? null,
    endUsec: endUsec ?? null,
    maxPoints: maxPoints ?? null,
  });
}

export async function getLogSummary(): Promise<LogSummary | null> {
  return invoke<LogSummary | null>("log_get_summary");
}

export async function closeLog(): Promise<void> {
  return invoke<void>("log_close");
}

export type FlightSummary = {
  duration_secs: number;
  max_alt_m: number | null;
  avg_alt_m: number | null;
  max_speed_mps: number | null;
  avg_speed_mps: number | null;
  total_distance_m: number | null;
  max_distance_from_home_m: number | null;
  battery_start_v: number | null;
  battery_end_v: number | null;
  battery_min_v: number | null;
  mah_consumed: number | null;
  gps_sats_min: number | null;
  gps_sats_max: number | null;
};

export async function getFlightSummary(): Promise<FlightSummary> {
  return invoke<FlightSummary>("log_get_flight_summary");
}

export async function exportLogCsv(
  path: string,
  startUsec?: number,
  endUsec?: number,
): Promise<number> {
  return invoke<number>("log_export_csv", {
    path,
    startUsec: startUsec ?? null,
    endUsec: endUsec ?? null,
  });
}

export async function subscribeLogProgress(cb: (progress: LogProgress) => void): Promise<UnlistenFn> {
  return listen<LogProgress>("log://progress", (event) => cb(event.payload));
}
