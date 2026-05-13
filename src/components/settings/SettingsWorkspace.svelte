<script lang="ts">
import { fromStore } from "svelte/store";

import { TELEMETRY_RATE_HZ_LIMITS } from "../../lib/stores/settings";
import { getLiveSettingsStoreContext } from "../../app/shell/runtime-context";
import {
  FieldRow,
  Panel,
  SectionHeader,
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
  <Panel>
    <SectionHeader title="Telemetry & runtime" />
    <FieldRow
      label="Telemetry update rate"
      description="How frequently telemetry is requested from the vehicle."
    >
      {#snippet control()}
        <input
          class="settings-slider min-w-40 flex-1"
          max={TELEMETRY_RATE_HZ_LIMITS.max}
          min={TELEMETRY_RATE_HZ_LIMITS.min}
          oninput={handleRateChange}
          step="1"
          type="range"
          value={telemetryRateHz}
        />
        <span class="min-w-[3.5em] text-right font-mono text-sm font-medium tabular-nums text-text-primary">{telemetryRateHz} Hz</span>
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
          class={[
            "relative h-6 w-11 cursor-pointer rounded-full border p-0 transition-colors duration-200",
            svsEnabled ? "border-accent bg-accent" : "border-border bg-bg-primary",
          ]}
          aria-label="Toggle Synthetic Vision System"
          aria-pressed={svsEnabled}
          onclick={handleSvsToggle}
          type="button"
        >
          <span
            class={[
              "absolute top-0.5 left-0.5 h-[18px] w-[18px] rounded-full bg-text-primary transition-transform duration-200",
              svsEnabled && "translate-x-5",
            ]}
          ></span>
        </button>
      {/snippet}
    </FieldRow>
  </Panel>
</WorkspaceShell>

<style>
  .settings-slider {
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
</style>
