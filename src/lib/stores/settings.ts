import { writable } from "svelte/store";

export const SETTINGS_STORAGE_KEY = "mpng_settings";

export type Settings = {
  telemetryRateHz: number;
  svsEnabled: boolean;
  messageRates: Record<number, number>;
  terrainSafetyMarginM: number;
  cruiseSpeedMps: number;
  hoverSpeedMps: number;
};

export const settingsDefaults: Settings = {
  telemetryRateHz: 5,
  svsEnabled: true,
  messageRates: {},
  terrainSafetyMarginM: 10,
  cruiseSpeedMps: 15,
  hoverSpeedMps: 5,
};

export function loadSettings(
  storage: Pick<Storage, "getItem"> | null = getBrowserStorage(),
): Settings {
  try {
    const raw = storage?.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return { ...settingsDefaults };
    }

    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      telemetryRateHz: parsed.telemetryRateHz ?? settingsDefaults.telemetryRateHz,
      svsEnabled: parsed.svsEnabled ?? settingsDefaults.svsEnabled,
      messageRates: parsed.messageRates ?? settingsDefaults.messageRates,
      terrainSafetyMarginM: parsed.terrainSafetyMarginM ?? settingsDefaults.terrainSafetyMarginM,
      cruiseSpeedMps: parsed.cruiseSpeedMps ?? settingsDefaults.cruiseSpeedMps,
      hoverSpeedMps: parsed.hoverSpeedMps ?? settingsDefaults.hoverSpeedMps,
    };
  } catch {
    return { ...settingsDefaults };
  }
}

export function persistSettings(
  settings: Settings,
  storage: Pick<Storage, "setItem"> | null = getBrowserStorage(),
) {
  try {
    storage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore partial localStorage shims in tests and restricted browser contexts.
  }
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
      const next = { ...settingsDefaults };
      persistSettings(next, storage);
      store.set(next);
    },
    reload() {
      store.set(loadSettings(storage));
    },
  };
}

export const settings = createSettingsStore();

function getBrowserStorage(): Storage | null {
  if (typeof localStorage === "undefined") {
    return null;
  }

  return localStorage;
}
