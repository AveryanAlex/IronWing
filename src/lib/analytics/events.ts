import type { AnalyticsProperties, AnalyticsProperty } from "./types";

const MAX_ANALYTICS_PROPERTIES = 16;
const MAX_ANALYTICS_STRING_LENGTH = 120;
const ANALYTICS_PROPERTY_KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;

export function normalizeAnalyticsProperties(props: Record<string, unknown>): AnalyticsProperties {
  const normalized: AnalyticsProperties = {};

  for (const [key, rawValue] of Object.entries(props)) {
    if (Object.keys(normalized).length >= MAX_ANALYTICS_PROPERTIES) {
      break;
    }

    if (!ANALYTICS_PROPERTY_KEY_RE.test(key)) {
      continue;
    }

    const value = normalizeAnalyticsPropertyValue(rawValue);
    if (value === null) {
      continue;
    }

    normalized[key] = value;
  }

  return normalized;
}

function normalizeAnalyticsPropertyValue(value: unknown): AnalyticsProperty | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    return trimmed.length > MAX_ANALYTICS_STRING_LENGTH
      ? trimmed.slice(0, MAX_ANALYTICS_STRING_LENGTH)
      : trimmed;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return null;
}
