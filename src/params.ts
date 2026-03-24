import { invoke } from "@platform/core";
import { listen, type UnlistenFn } from "@platform/event";
import { createLatestScopedEventHandler } from "./lib/scoped-session-events";
import type { SessionEvent } from "./session";

export type ParamType = "uint8" | "int8" | "uint16" | "int16" | "uint32" | "int32" | "real32";

export type Param = {
  name: string;
  value: number;
  param_type: ParamType;
  index: number;
};

export type ParamStore = {
  params: Record<string, Param>;
  expected_count: number;
};

export type DownloadingProgress = {
  received: number;
  expected: number | null;
};

export type WritingProgress = {
  index: number;
  total: number;
  name: string;
};

/** Matches mavkit's `ParamOperationProgress` externally-tagged serde enum. */
export type ParamProgress =
  | "completed"
  | "failed"
  | "cancelled"
  | { downloading: DownloadingProgress }
  | { writing: WritingProgress };

/** Extract the phase name from a progress value. */
export function paramProgressPhase(
  p: ParamProgress,
): "downloading" | "writing" | "completed" | "failed" | "cancelled" {
  if (typeof p === "string") return p;
  if ("downloading" in p) return "downloading";
  if ("writing" in p) return "writing";
  // TypeScript exhaustiveness: this branch is unreachable given the closed union.
  // An explicit guard above ensures a new variant doesn't silently fall through.
  throw new Error("unrecognised ParamProgress variant");
}

/**
 * Extract normalised { received, expected } counts for progress display.
 * For writing: maps index→received, total→expected.
 * Returns null for terminal states.
 *
 * Note: `expected` may be null (Downloading with unknown count) or 0 (Writing
 * at the very start of a batch). Callers must guard against division by zero.
 */
export function paramProgressCounts(
  p: ParamProgress,
): { received: number; expected: number | null } | null {
  if (typeof p === "string") return null;
  if ("downloading" in p) return { received: p.downloading.received, expected: p.downloading.expected };
  return { received: p.writing.index, expected: p.writing.total };
}

/** True when a transfer is actively running (downloading or writing). */
export function isParamTransferActive(p: ParamProgress): boolean {
  return typeof p !== "string";
}

export type ParamWriteResult = {
  name: string;
  requested_value: number;
  confirmed_value: number;
  success: boolean;
};

export async function downloadAllParams(): Promise<void> {
  return invoke<void>("param_download_all");
}

export async function cancelParamDownload(): Promise<void> {
  return invoke<void>("param_cancel");
}

export async function writeParam(name: string, value: number): Promise<Param> {
  return invoke<Param>("param_write", { name, value });
}

export async function writeBatchParams(params: [string, number][]): Promise<ParamWriteResult[]> {
  return invoke<ParamWriteResult[]>("param_write_batch", { params });
}

export async function parseParamFile(contents: string): Promise<Record<string, number>> {
  return invoke<Record<string, number>>("param_parse_file", { contents });
}

export async function formatParamFile(store: ParamStore): Promise<string> {
  return invoke<string>("param_format_file", { store });
}

export async function subscribeParamStore(cb: (event: SessionEvent<ParamStore>) => void): Promise<UnlistenFn> {
  const handleEvent = createLatestScopedEventHandler(cb);

  return listen<SessionEvent<ParamStore>>("param://store", (event) => handleEvent(event.payload));
}

export async function subscribeParamProgress(cb: (event: SessionEvent<ParamProgress>) => void): Promise<UnlistenFn> {
  const handleEvent = createLatestScopedEventHandler(cb);

  return listen<SessionEvent<ParamProgress>>("param://progress", (event) => handleEvent(event.payload));
}
