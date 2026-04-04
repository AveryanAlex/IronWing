import { writable } from "svelte/store";

import { getBrowserStorage, readStorageJson, writeStorageJson } from "../local-storage";

export const SETTINGS_STORAGE_KEY = "mpng_settings";

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

export const settingsDefaults: Settings = {
  telemetryRateHz: DEFAULT_TELEMETRY_RATE_HZ,
  svsEnabled: DEFAULT_SVS_ENABLED,
  messageRates: {},
  terrainSafetyMarginM: DEFAULT_TERRAIN_SAFETY_MARGIN_M,
  cruiseSpeedMps: DEFAULT_CRUISE_SPEED_MPS,
  hoverSpeedMps: DEFAULT_HOVER_SPEED_MPS,
};

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
  writeStorageJson(SETTINGS_STORAGE_KEY, settings, storage);
}

export function createSettingsStore(
  storage: Pick<Storage, "getItem" | "setItem"> | null = getBrowserStorage(),
) {
  const store = writable<Settings>(loadSettings(storage));

  return {
    subscribe: store.subscribe,
    updateSettings(patch: Partial<Settings>) {
      store.update((current) => {
        const next = { ...current, ...patch };
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

function normalizeSettings(raw: unknown): Settings {
  const defaults = createSettingsDefaults();
  if (!raw || typeof raw !== "object") {
    return defaults;
  }

  const parsed = raw as Record<string, unknown>;

  return {
    telemetryRateHz: readFiniteNumber(parsed.telemetryRateHz, defaults.telemetryRateHz),
    svsEnabled: typeof parsed.svsEnabled === "boolean" ? parsed.svsEnabled : defaults.svsEnabled,
    messageRates: normalizeMessageRates(parsed.messageRates),
    terrainSafetyMarginM: readFiniteNumber(parsed.terrainSafetyMarginM, defaults.terrainSafetyMarginM),
    cruiseSpeedMps: readFiniteNumber(parsed.cruiseSpeedMps, defaults.cruiseSpeedMps),
    hoverSpeedMps: readFiniteNumber(parsed.hoverSpeedMps, defaults.hoverSpeedMps),
  };
}

function normalizeMessageRates(raw: unknown): Record<number, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  const normalized: Record<number, number> = {};
  for (const [messageId, rateHz] of Object.entries(raw)) {
    if (typeof rateHz !== "number" || !Number.isFinite(rateHz)) {
      continue;
    }

    const id = Number.parseInt(messageId, 10);
    if (!Number.isFinite(id)) {
      continue;
    }

    normalized[id] = rateHz;
  }

  return normalized;
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
