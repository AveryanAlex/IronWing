import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type LogSummary = {
  file_name: string;
  start_usec: number;
  end_usec: number;
  duration_secs: number;
  total_entries: number;
  message_types: Record<string, number>;
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

export async function subscribeLogProgress(cb: (progress: LogProgress) => void): Promise<UnlistenFn> {
  return listen<LogProgress>("log://progress", (event) => cb(event.payload));
}
