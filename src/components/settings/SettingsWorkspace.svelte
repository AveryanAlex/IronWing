<script lang="ts">
import { fromStore } from "svelte/store";

import { TELEMETRY_RATE_HZ_LIMITS } from "../../lib/stores/settings";
import { getLiveSettingsStoreContext } from "../../app/shell/runtime-context";

const SVS_STORAGE_KEY = "ironwing.hud.svs_enabled";

const liveSettingsStore = getLiveSettingsStoreContext();
const liveSettings = fromStore(liveSettingsStore);

let svsEnabled = $state(loadSvsEnabled());

let telemetryRateHz = $derived(liveSettings.current.draft.telemetryRateHz);

function loadSvsEnabled(): boolean {
  try {
    const stored = localStorage.getItem(SVS_STORAGE_KEY);
    if (stored === null) return true;
    return stored === "true";
  } catch {
    return true;
  }
}

function handleRateChange(event: Event) {
  const target = event.currentTarget as HTMLInputElement;
  const value = Number.parseInt(target.value, 10);
  if (Number.isNaN(value)) return;

  liveSettingsStore.stageTelemetryRate(value);
  void liveSettingsStore.applyDrafts();
}

function handleSvsToggle() {
  svsEnabled = !svsEnabled;
  try {
    localStorage.setItem(SVS_STORAGE_KEY, String(svsEnabled));
  } catch {
    // Storage quota exceeded or unavailable in this environment
    console.warn("Failed to persist SVS setting to localStorage");
  }
}
</script>

<section class="settings-workspace">
  <h2 class="settings-workspace__title">Settings</h2>

  <div class="settings-card">
    <div class="settings-card__header">
      <h3 class="settings-card__label">Telemetry Update Rate</h3>
      <p class="settings-card__description">How frequently telemetry is requested from the vehicle.</p>
    </div>
    <div class="settings-card__control">
      <input
        class="settings-slider"
        max={TELEMETRY_RATE_HZ_LIMITS.max}
        min={TELEMETRY_RATE_HZ_LIMITS.min}
        oninput={handleRateChange}
        step="1"
        type="range"
        value={telemetryRateHz}
      />
      <span class="settings-slider__value">{telemetryRateHz} Hz</span>
    </div>
  </div>

  <div class="settings-card">
    <div class="settings-card__header">
      <h3 class="settings-card__label">Synthetic Vision System</h3>
      <p class="settings-card__description">Show 3D terrain behind the HUD horizon line.</p>
    </div>
    <div class="settings-card__control settings-card__control--toggle">
      <button
        class="settings-toggle"
        class:settings-toggle--active={svsEnabled}
        aria-label="Toggle Synthetic Vision System"
        aria-pressed={svsEnabled}
        onclick={handleSvsToggle}
        type="button"
      >
        <span class="settings-toggle__thumb"></span>
      </button>
    </div>
  </div>
</section>

<style>
  .settings-workspace {
    overflow-y: auto;
    padding: 12px;
    max-width: 600px;
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .settings-workspace__title {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0 0 8px 0;
  }

  .settings-card {
    border-radius: 6px;
    border: 1px solid var(--color-border);
    background: var(--color-bg-secondary);
    padding: 12px;
  }

  .settings-card__header {
    margin-bottom: 10px;
  }

  .settings-card__label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0;
  }

  .settings-card__description {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    margin: 4px 0 0;
    line-height: 1.4;
  }

  .settings-card__control {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .settings-card__control--toggle {
    justify-content: flex-end;
  }

  .settings-slider {
    flex: 1;
    height: 4px;
    appearance: none;
    background: var(--color-border);
    border-radius: 2px;
    outline: none;
    cursor: pointer;
  }

  .settings-slider::-webkit-slider-thumb {
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--color-accent);
    cursor: pointer;
    border: none;
  }

  .settings-slider::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--color-accent);
    cursor: pointer;
    border: none;
  }

  .settings-slider__value {
    font-family: "JetBrains Mono", monospace;
    font-variant-numeric: tabular-nums;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-text-primary);
    min-width: 3.5em;
    text-align: right;
  }

  .settings-toggle {
    position: relative;
    width: 44px;
    height: 24px;
    border-radius: 12px;
    border: 1px solid var(--color-border);
    background: var(--color-bg-primary);
    cursor: pointer;
    padding: 0;
    transition: background-color 0.2s, border-color 0.2s;
  }

  .settings-toggle--active {
    background: var(--color-accent);
    border-color: var(--color-accent);
  }

  .settings-toggle__thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--color-text-primary);
    transition: transform 0.2s;
  }

  .settings-toggle--active .settings-toggle__thumb {
    transform: translateX(20px);
  }
</style>
