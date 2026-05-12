<script lang="ts">
import { fromStore } from "svelte/store";

import { Button, MetricTile, Panel } from "../../components/ui";
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

    <div class="sidebar-telemetry__grid">
      <div data-testid="sidebar-telemetry-state">
        <MetricTile label="State" value={statusCard.armStateText} />
      </div>
      <div data-testid="sidebar-telemetry-mode">
        <MetricTile label="Mode" value={statusCard.modeText} />
      </div>
      <div data-testid="sidebar-telemetry-altitude">
        <MetricTile label="Alt" value={summary.altitudeText} />
      </div>
      <div data-testid="sidebar-telemetry-speed">
        <MetricTile label="Speed" value={summary.speedText} />
      </div>
      <div data-testid="sidebar-telemetry-battery">
        <MetricTile label="Battery" value={summary.batteryText} />
      </div>
      <div data-testid="sidebar-telemetry-gps">
        <MetricTile label="GPS" value={gpsText} />
      </div>
    </div>
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
.sidebar-telemetry__grid {
  margin-top: var(--space-3);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
}
</style>
