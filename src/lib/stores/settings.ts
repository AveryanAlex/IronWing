import { writable } from "svelte/store";

import { getBrowserStorage, readStorageJson, writeStorageJson } from "../local-storage";

export const SETTINGS_STORAGE_KEY = "mpng_settings";

export const TELEMETRY_RATE_HZ_LIMITS = {
  min: 1,
  max: 20,
} as const;

export const MESSAGE_RATE_HZ_LIMITS = {
  min: 0.1,
  max: 50,
} as const;

export type Settings = {
  telemetryRateHz: number;
  svsEnabled: boolean;
  messageRates: Record<number, number>;
  terrainSafetyMarginM: number;
  cruiseSpeedMps: number;
  hoverSpeedMps: number;
};

const DEFAULT_TELEMETRY_RATE_HZ = 5;
const DEFAULT_SVS_ENABLED = true;
const DEFAULT_TERRAIN_SAFETY_MARGIN_M = 10;
const DEFAULT_CRUISE_SPEED_MPS = 15;
const DEFAULT_HOVER_SPEED_MPS = 5;

export const settingsDefaults: Settings = createSettingsDefaults();

export function loadSettings(
  storage: Pick<Storage, "getItem"> | null = getBrowserStorage(),
): Settings {
  const parsed = readStorageJson(SETTINGS_STORAGE_KEY, storage);
  return normalizeSettings(parsed);
}

export function persistSettings(
  settings: Settings,
  storage: Pick<Storage, "setItem"> | null = getBrowserStorage(),
) {
  writeStorageJson(SETTINGS_STORAGE_KEY, normalizeSettings(settings), storage);
}

export function createSettingsStore(
  storage: Pick<Storage, "getItem" | "setItem"> | null = getBrowserStorage(),
) {
  const store = writable<Settings>(loadSettings(storage));

  return {
    subscribe: store.subscribe,
    updateSettings(patch: Partial<Settings>) {
      store.update((current) => {
        const next = normalizeSettings({ ...current, ...patch });
        persistSettings(next, storage);
        return next;
      });
    },
    reset() {
      const next = createSettingsDefaults();
      persistSettings(next, storage);
      store.set(next);
    },
    reload() {
      store.set(loadSettings(storage));
    },
  };
}

export const settings = createSettingsStore();

export function normalizeSettings(raw: unknown): Settings {
  const defaults = createSettingsDefaults();
  if (!raw || typeof raw !== "object") {
    return defaults;
  }

  const parsed = raw as Record<string, unknown>;

  return {
    telemetryRateHz: normalizeTelemetryRateHz(parsed.telemetryRateHz, defaults.telemetryRateHz),
    svsEnabled: typeof parsed.svsEnabled === "boolean" ? parsed.svsEnabled : defaults.svsEnabled,
    messageRates: normalizeMessageRates(parsed.messageRates),
    terrainSafetyMarginM: readFiniteNumber(parsed.terrainSafetyMarginM, defaults.terrainSafetyMarginM),
    cruiseSpeedMps: readFiniteNumber(parsed.cruiseSpeedMps, defaults.cruiseSpeedMps),
    hoverSpeedMps: readFiniteNumber(parsed.hoverSpeedMps, defaults.hoverSpeedMps),
  };
}

export function normalizeTelemetryRateHz(value: unknown, fallback = DEFAULT_TELEMETRY_RATE_HZ): number {
  return isValidTelemetryRateHz(value) ? value : fallback;
}

export function isValidTelemetryRateHz(value: unknown): value is number {
  return typeof value === "number"
    && Number.isFinite(value)
    && Number.isInteger(value)
    && value >= TELEMETRY_RATE_HZ_LIMITS.min
    && value <= TELEMETRY_RATE_HZ_LIMITS.max;
}

export function normalizeMessageRates(raw: unknown): Record<number, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  const normalized: Record<number, number> = {};
  for (const [messageId, rateHz] of Object.entries(raw)) {
    const id = Number.parseInt(messageId, 10);
    if (!Number.isInteger(id) || id < 0 || !isValidMessageRateHz(rateHz)) {
      continue;
    }

    normalized[id] = rateHz;
  }

  return normalized;
}

export function isValidMessageRateHz(value: unknown): value is number {
  return typeof value === "number"
    && Number.isFinite(value)
    && value >= MESSAGE_RATE_HZ_LIMITS.min
    && value <= MESSAGE_RATE_HZ_LIMITS.max;
}

function createSettingsDefaults(): Settings {
  return {
    telemetryRateHz: DEFAULT_TELEMETRY_RATE_HZ,
    svsEnabled: DEFAULT_SVS_ENABLED,
    messageRates: {},
    terrainSafetyMarginM: DEFAULT_TERRAIN_SAFETY_MARGIN_M,
    cruiseSpeedMps: DEFAULT_CRUISE_SPEED_MPS,
    hoverSpeedMps: DEFAULT_HOVER_SPEED_MPS,
  };
}

function readFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
