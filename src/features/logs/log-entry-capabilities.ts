import type { LogLibraryEntry } from "../../logs";

export function isReplayableEntry(entry: LogLibraryEntry | null): boolean {
  if (!entry) {
    return false;
  }

  const replayableStatus = entry.status === "ready" || entry.status === "partial";
  return replayableStatus && entry.source.status.kind === "available" && entry.index !== null;
}
