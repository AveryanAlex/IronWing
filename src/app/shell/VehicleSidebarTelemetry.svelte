<script lang="ts">
import { fromStore } from "svelte/store";

import { Button, Panel } from "../../components/ui";
import { hasUnsavedLiveSettings } from "../../lib/stores/live-settings";
import { appShellTestIds } from "./chrome-state";
import {
  getLiveSettingsStoreContext,
  getSessionViewStoreContext,
  getTelemetrySettingsDialogLauncherContext,
} from "./runtime-context";

const liveSettings = fromStore(getLiveSettingsStoreContext());
const sessionView = fromStore(getSessionViewStoreContext());
const telemetrySettingsDialog = getTelemetrySettingsDialogLauncherContext();

let liveSettingsView = $derived(liveSettings.current);
let view = $derived(sessionView.current);
let statusCard = $derived(view.vehicleStatusCard);
let summary = $derived(view.telemetrySummary);
let gpsText = $derived(summary.gpsText.replace(/^GPS:\s*/, ""));
let overrideCount = $derived(Object.keys(liveSettingsView.confirmedSettings.messageRates).length);
let hasUnsavedSettings = $derived(hasUnsavedLiveSettings(liveSettingsView));
let launcherStatusText = $derived.by(() => {
  if (!liveSettingsView.hydrated || liveSettingsView.catalogPhase === "loading") {
    return "Loading telemetry controls…";
  }

  if (liveSettingsView.applyPhase === "applying") {
    return "Applying telemetry updates…";
  }

  if (liveSettingsView.lastApplyError) {
    return "Settings need attention";
  }

  if (hasUnsavedSettings) {
    return "Unsaved telemetry changes";
  }

  return `${liveSettingsView.confirmedSettings.telemetryRateHz} Hz cadence · ${overrideCount} override${overrideCount === 1 ? "" : "s"}`;
});
</script>

<div class="sidebar-telemetry" data-testid="sidebar-telemetry-panel">
  <Panel padded>
    <div class="sidebar-telemetry__header">
      <p class="sidebar-telemetry__eyebrow">Vehicle</p>
      <Button
        onclick={() => telemetrySettingsDialog.open()}
        size="sm"
        testId={appShellTestIds.telemetrySettingsLauncher}
      >
        Controls
      </Button>
    </div>

    <p class="sidebar-telemetry__status">{launcherStatusText}</p>

    <dl class="sidebar-telemetry__list">
      <div class="sidebar-telemetry__row" data-testid="sidebar-telemetry-state">
        <dt class="sidebar-telemetry__label">State</dt>
        <dd class="sidebar-telemetry__value">{statusCard.armStateText}</dd>
      </div>
      <div class="sidebar-telemetry__row" data-testid="sidebar-telemetry-mode">
        <dt class="sidebar-telemetry__label">Mode</dt>
        <dd class="sidebar-telemetry__value">{statusCard.modeText}</dd>
      </div>
      <div class="sidebar-telemetry__row" data-testid="sidebar-telemetry-altitude">
        <dt class="sidebar-telemetry__label">Alt</dt>
        <dd class="sidebar-telemetry__value">{summary.altitudeText}</dd>
      </div>
      <div class="sidebar-telemetry__row" data-testid="sidebar-telemetry-speed">
        <dt class="sidebar-telemetry__label">Speed</dt>
        <dd class="sidebar-telemetry__value">{summary.speedText}</dd>
      </div>
      <div class="sidebar-telemetry__row" data-testid="sidebar-telemetry-battery">
        <dt class="sidebar-telemetry__label">Battery</dt>
        <dd class="sidebar-telemetry__value">{summary.batteryText}</dd>
      </div>
      <div class="sidebar-telemetry__row" data-testid="sidebar-telemetry-gps">
        <dt class="sidebar-telemetry__label">GPS</dt>
        <dd class="sidebar-telemetry__value">{gpsText}</dd>
      </div>
    </dl>
  </Panel>
</div>

<style>
.sidebar-telemetry__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}
.sidebar-telemetry__eyebrow {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.sidebar-telemetry__status {
  margin: var(--space-1) 0 0;
  color: var(--color-text-muted);
  font-size: 0.66rem;
}
.sidebar-telemetry__list {
  margin: var(--space-3) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sidebar-telemetry__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
  min-height: 28px;
  padding: 4px 6px;
  border-radius: var(--radius-sm);
}
.sidebar-telemetry__row + .sidebar-telemetry__row {
  border-top: 1px solid var(--color-border);
}
.sidebar-telemetry__label {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  flex-shrink: 0;
}
.sidebar-telemetry__value {
  margin: 0;
  color: var(--color-text-primary);
  font-size: 0.82rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  text-align: right;
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
