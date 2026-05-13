<script lang="ts">
import { ArrowUp, Battery, Gauge, Plane, Satellite } from "lucide-svelte";
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
      <p class="m-0 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-text-muted"><Plane aria-hidden="true" size={14} />Vehicle</p>
      <Button
        onclick={() => telemetrySettingsDialog.open()}
        size="sm"
        testId={appShellTestIds.telemetrySettingsLauncher}
      >
        Controls
      </Button>
    </div>

    <p class="mt-1 mb-0 text-xs text-text-muted">{launcherStatusText}</p>

    <dl class="m-0 mt-3 flex flex-col gap-2 divide-y divide-border p-0">
      <div class="flex min-h-7 items-baseline justify-between gap-2 rounded-md px-2 py-1" data-testid="sidebar-telemetry-altitude">
        <dt class="m-0 flex shrink-0 items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-text-muted"><ArrowUp aria-hidden="true" size={14} />Alt</dt>
        <dd class="m-0 min-w-0 break-words text-right text-sm font-semibold tabular-nums text-text-primary">{summary.altitudeText}</dd>
      </div>
      <div class="flex min-h-7 items-baseline justify-between gap-2 rounded-md px-2 py-1" data-testid="sidebar-telemetry-speed">
        <dt class="m-0 flex shrink-0 items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-text-muted"><Gauge aria-hidden="true" size={14} />Speed</dt>
        <dd class="m-0 min-w-0 break-words text-right text-sm font-semibold tabular-nums text-text-primary">{summary.speedText}</dd>
      </div>
      <div class="flex min-h-7 items-baseline justify-between gap-2 rounded-md px-2 py-1" data-testid="sidebar-telemetry-battery">
        <dt class="m-0 flex shrink-0 items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-text-muted"><Battery aria-hidden="true" size={14} />Battery</dt>
        <dd class="m-0 min-w-0 break-words text-right text-sm font-semibold tabular-nums text-text-primary">{summary.batteryText}</dd>
      </div>
      <div class="flex min-h-7 items-baseline justify-between gap-2 rounded-md px-2 py-1" data-testid="sidebar-telemetry-gps">
        <dt class="m-0 flex shrink-0 items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-text-muted"><Satellite aria-hidden="true" size={14} />GPS</dt>
        <dd class="m-0 min-w-0 break-words text-right text-sm font-semibold tabular-nums text-text-primary">{gpsText}</dd>
      </div>
    </dl>
  </Panel>
</div>
