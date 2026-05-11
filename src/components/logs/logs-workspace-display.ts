import type { LogDiagnostic, LogLibraryEntry } from "../../logs";

export function entryTone(entry: LogLibraryEntry): "positive" | "caution" | "critical" | "neutral" {
  switch (entry.status) {
    case "ready":
      return "positive";
    case "partial":
    case "stale":
    case "indexing":
      return "caution";
    case "missing":
    case "corrupt":
    case "unsupported":
      return "critical";
    default:
      return "neutral";
  }
}

export function entryStatusLabel(entry: LogLibraryEntry): string {
  switch (entry.status) {
    case "ready":
      return "ready";
    case "partial":
      return "partial";
    case "missing":
      return "missing";
    case "stale":
      return "stale";
    case "indexing":
      return "indexing";
    case "corrupt":
      return "corrupt";
    case "unsupported":
      return "unsupported";
  }
}

export function sourceStatusLabel(entry: LogLibraryEntry): string {
  switch (entry.source.status.kind) {
    case "available":
      return "linked";
    case "missing":
      return "path missing";
    case "stale":
      return "file changed";
  }
}

export function diagnosticTone(diagnostic: LogDiagnostic): string {
  switch (diagnostic.severity) {
    case "error":
      return "critical";
    case "warning":
      return "caution";
    default:
      return "neutral";
  }
}
