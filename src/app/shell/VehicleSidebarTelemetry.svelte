<script lang="ts">
import { fromStore } from "svelte/store";

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

<section class="rounded-lg border border-border bg-bg-primary p-3" data-testid="sidebar-telemetry-panel">
  <div class="flex items-start justify-between gap-3">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">Telemetry</p>
      <p class="mt-1 text-xs text-text-secondary">{launcherStatusText}</p>
    </div>

    <button
      class="rounded-md border border-border bg-bg-secondary px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-text-primary transition hover:border-accent/40 hover:text-accent"
      data-testid={appShellTestIds.telemetrySettingsLauncher}
      onclick={() => telemetrySettingsDialog.open()}
      type="button"
    >
      Controls
    </button>
  </div>

  <dl class="mt-3 grid grid-cols-2 gap-2 text-sm">
    <div class="rounded-md border border-border bg-bg-secondary px-2 py-1.5" data-testid="sidebar-telemetry-state">
      <dt class="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-text-muted">State</dt>
      <dd class="mt-0.5 font-semibold text-text-primary">{statusCard.armStateText}</dd>
    </div>

    <div class="rounded-md border border-border bg-bg-secondary px-2 py-1.5" data-testid="sidebar-telemetry-mode">
      <dt class="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-text-muted">Mode</dt>
      <dd class="mt-0.5 font-semibold text-text-primary">{statusCard.modeText}</dd>
    </div>

    <div class="rounded-md border border-border bg-bg-secondary px-2 py-1.5" data-testid="sidebar-telemetry-altitude">
      <dt class="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-text-muted">Alt</dt>
      <dd class="mt-0.5 font-semibold text-text-primary">{summary.altitudeText}</dd>
    </div>

    <div class="rounded-md border border-border bg-bg-secondary px-2 py-1.5" data-testid="sidebar-telemetry-speed">
      <dt class="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-text-muted">Speed</dt>
      <dd class="mt-0.5 font-semibold text-text-primary">{summary.speedText}</dd>
    </div>

    <div class="rounded-md border border-border bg-bg-secondary px-2 py-1.5" data-testid="sidebar-telemetry-battery">
      <dt class="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-text-muted">Battery</dt>
      <dd class="mt-0.5 font-semibold text-text-primary">{summary.batteryText}</dd>
    </div>

    <div class="rounded-md border border-border bg-bg-secondary px-2 py-1.5" data-testid="sidebar-telemetry-gps">
      <dt class="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-text-muted">GPS</dt>
      <dd class="mt-0.5 font-semibold text-text-primary">{gpsText}</dd>
    </div>
  </dl>
</section>
