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

<div data-testid="sidebar-telemetry-panel">
  <Panel padded>
    <div class="flex items-center justify-between gap-2">
      <p class="m-0 text-[0.66rem] font-bold uppercase tracking-[0.12em] text-text-muted">Vehicle</p>
      <Button
        onclick={() => telemetrySettingsDialog.open()}
        size="sm"
        testId={appShellTestIds.telemetrySettingsLauncher}
      >
        Controls
      </Button>
    </div>

    <p class="mt-1 mb-0 text-[0.66rem] text-text-muted">{launcherStatusText}</p>

    <dl class="m-0 mt-3 flex flex-col gap-[2px] divide-y divide-border p-0">
      <div class="flex min-h-7 items-baseline justify-between gap-2 rounded-sm px-1.5 py-1" data-testid="sidebar-telemetry-altitude">
        <dt class="m-0 shrink-0 text-[0.66rem] font-bold uppercase tracking-[0.12em] text-text-muted">Alt</dt>
        <dd class="m-0 min-w-0 text-right text-[0.82rem] font-semibold tabular-nums text-text-primary [overflow-wrap:anywhere]">{summary.altitudeText}</dd>
      </div>
      <div class="flex min-h-7 items-baseline justify-between gap-2 rounded-sm px-1.5 py-1" data-testid="sidebar-telemetry-speed">
        <dt class="m-0 shrink-0 text-[0.66rem] font-bold uppercase tracking-[0.12em] text-text-muted">Speed</dt>
        <dd class="m-0 min-w-0 text-right text-[0.82rem] font-semibold tabular-nums text-text-primary [overflow-wrap:anywhere]">{summary.speedText}</dd>
      </div>
      <div class="flex min-h-7 items-baseline justify-between gap-2 rounded-sm px-1.5 py-1" data-testid="sidebar-telemetry-battery">
        <dt class="m-0 shrink-0 text-[0.66rem] font-bold uppercase tracking-[0.12em] text-text-muted">Battery</dt>
        <dd class="m-0 min-w-0 text-right text-[0.82rem] font-semibold tabular-nums text-text-primary [overflow-wrap:anywhere]">{summary.batteryText}</dd>
      </div>
      <div class="flex min-h-7 items-baseline justify-between gap-2 rounded-sm px-1.5 py-1" data-testid="sidebar-telemetry-gps">
        <dt class="m-0 shrink-0 text-[0.66rem] font-bold uppercase tracking-[0.12em] text-text-muted">GPS</dt>
        <dd class="m-0 min-w-0 text-right text-[0.82rem] font-semibold tabular-nums text-text-primary [overflow-wrap:anywhere]">{gpsText}</dd>
      </div>
    </dl>
  </Panel>
</div>
