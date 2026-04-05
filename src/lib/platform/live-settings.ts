import {
  getAvailableMessageRates,
  setMessageRate,
  setTelemetryRate,
  type MessageRateInfo,
} from "../../telemetry";
import { isValidMessageRateHz } from "../stores/settings";
import { formatUnknownError } from "../error-format";

export type LiveSettingsService = {
  loadMessageRateCatalog(): Promise<MessageRateInfo[]>;
  applyTelemetryRate(rateHz: number): Promise<void>;
  applyMessageRate(messageId: number, rateHz: number): Promise<void>;
  formatError(error: unknown): string;
};

export function createLiveSettingsService(): LiveSettingsService {
  return {
    loadMessageRateCatalog: async () => normalizeMessageRateCatalog(await getAvailableMessageRates()),
    applyTelemetryRate: setTelemetryRate,
    applyMessageRate: setMessageRate,
    formatError: formatUnknownError,
  };
}

export function normalizeMessageRateCatalog(raw: unknown): MessageRateInfo[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const normalized: MessageRateInfo[] = [];
  const seen = new Set<number>();

  for (const entry of raw) {
    const normalizedEntry = normalizeMessageRateInfo(entry);
    if (!normalizedEntry || seen.has(normalizedEntry.id)) {
      continue;
    }

    seen.add(normalizedEntry.id);
    normalized.push(normalizedEntry);
  }

  return normalized;
}

export function asErrorMessage(error: unknown): string {
  return formatUnknownError(error);
}

function normalizeMessageRateInfo(value: unknown): MessageRateInfo | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const entry = value as Partial<MessageRateInfo>;
  if (typeof entry.id !== "number" || !Number.isInteger(entry.id) || entry.id < 0) {
    return null;
  }
  if (typeof entry.name !== "string" || entry.name.trim().length === 0) {
    return null;
  }
  if (!isValidMessageRateHz(entry.default_rate_hz)) {
    return null;
  }

  return {
    id: entry.id,
    name: entry.name,
    default_rate_hz: entry.default_rate_hz,
  };
}
