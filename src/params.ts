import { EVENT_NAMES } from "./lib/generated/events";
import type * as GeneratedJson from "./lib/generated/mavkit-json";
import { typedInvoke, typedListen, type UnlistenFn } from "./lib/ipc/client";
import { createLatestScopedEventHandler } from "./lib/scoped-session-events";
import type { SessionEvent } from "./session";

export type ParamType = GeneratedJson.Param["param_type"];

export type Param = GeneratedJson.Param;
export type NonNullParam = Omit<Param, "value"> & { value: number };

export function isNonNullParam(param: Param): param is NonNullParam {
  return param.value !== null;
}

export type ParamStore = GeneratedJson.ParamStore;

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
export type ParamProgress = GeneratedJson.ParamProgress;

/** Extract the phase name from a progress value. */
export function paramProgressPhase(
  p: ParamProgress,
): "downloading" | "writing" | "completed" | "failed" | "cancelled" {
  if (typeof p === "string") return p;
  if ("downloading" in p && p.downloading) return "downloading";
  if ("writing" in p && p.writing) return "writing";
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
  if ("downloading" in p && p.downloading) return { received: p.downloading.received, expected: p.downloading.expected };
  if ("writing" in p && p.writing) return { received: p.writing.index, expected: p.writing.total };
  throw new Error("unrecognised ParamProgress variant");
}

/** True when a transfer is actively running (downloading or writing). */
export function isParamTransferActive(p: ParamProgress): boolean {
  return typeof p !== "string";
}

export type ParamWriteResult = GeneratedJson.ParamWriteResult;

export async function downloadAllParams(): Promise<void> {
  return typedInvoke("param_download_all");
}

export async function cancelParamDownload(): Promise<void> {
  return typedInvoke("param_cancel");
}

export async function writeParam(name: string, value: number): Promise<ParamWriteResult> {
  return typedInvoke("param_write", { name, value });
}

export async function writeBatchParams(params: [string, number][]): Promise<ParamWriteResult[]> {
  return typedInvoke("param_write_batch", { params });
}

export async function parseParamFile(contents: string): Promise<Record<string, number>> {
  return typedInvoke("param_parse_file", { contents });
}

export async function formatParamFile(store: ParamStore): Promise<string> {
  return typedInvoke("param_format_file", { store });
}

export async function subscribeParamStore(cb: (event: SessionEvent<ParamStore>) => void): Promise<UnlistenFn> {
  const handleEvent = createLatestScopedEventHandler(cb);

  return typedListen(EVENT_NAMES.PARAM_STORE, (event) => handleEvent(event.payload));
}

export async function subscribeParamProgress(cb: (event: SessionEvent<ParamProgress>) => void): Promise<UnlistenFn> {
  const handleEvent = createLatestScopedEventHandler(cb);

  return typedListen(EVENT_NAMES.PARAM_PROGRESS, (event) => handleEvent(event.payload));
}
