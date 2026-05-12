<script lang="ts">
import { fromStore } from "svelte/store";

import { TELEMETRY_RATE_HZ_LIMITS } from "../../lib/stores/settings";
import { getLiveSettingsStoreContext } from "../../app/shell/runtime-context";
import {
  FieldRow,
  Panel,
  SectionHeader,
  WorkspaceHeader,
  WorkspaceShell,
} from "../ui";

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

<WorkspaceShell mode="inset">
  <WorkspaceHeader title="App settings" />

  <Panel>
    <SectionHeader title="Telemetry & runtime" />
    <FieldRow
      label="Telemetry update rate"
      description="How frequently telemetry is requested from the vehicle."
    >
      {#snippet control()}
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
      {/snippet}
    </FieldRow>
  </Panel>

  <Panel>
    <SectionHeader title="Display" />
    <FieldRow
      label="Synthetic Vision System"
      description="Show 3D terrain behind the HUD horizon line."
    >
      {#snippet control()}
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
      {/snippet}
    </FieldRow>
  </Panel>
</WorkspaceShell>

<style>
  .settings-slider {
    flex: 1;
    min-width: 160px;
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
