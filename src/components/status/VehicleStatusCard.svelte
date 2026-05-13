<script lang="ts">
import { fromStore } from "svelte/store";

import { getSessionViewStoreContext } from "../../app/shell/runtime-context";
import type { ViewTone } from "../../lib/session-selectors";
import { MetricTile, Panel, StatusPill } from "../ui";

const sessionView = fromStore(getSessionViewStoreContext());

function metricTone(tone: ViewTone): "neutral" | "info" | "success" | "warning" | "danger" {
  switch (tone) {
    case "positive":
      return "success";
    case "caution":
      return "warning";
    case "critical":
      return "danger";
    default:
      return "neutral";
  }
}

function pillTone(tone: ViewTone): "neutral" | "info" | "success" | "warning" | "danger" {
  switch (tone) {
    case "positive":
      return "success";
    case "caution":
      return "warning";
    case "critical":
      return "danger";
    default:
      return "neutral";
  }
}

let view = $derived(sessionView.current);
let statusCard = $derived(view.vehicleStatusCard);
</script>

<Panel padded>
  <div class="flex items-center justify-between gap-3">
    <div>
      <p class="m-0 text-[0.72rem] font-bold uppercase tracking-[0.12em] text-text-muted">Vehicle status</p>
      <h2 class="mt-1 mb-0 text-base font-[650] text-text-primary">Live vehicle state</h2>
    </div>
    <StatusPill tone={pillTone(statusCard.sessionTone)}>{statusCard.sessionLabel}</StatusPill>
  </div>

  <div class="mt-4 grid grid-cols-2 gap-2 xl:grid-cols-4">
    <div data-testid="telemetry-state-value">
      <MetricTile label="Arm state" tone={metricTone(statusCard.armStateTone)} value={statusCard.armStateText} />
    </div>
    <div data-testid="telemetry-mode-value">
      <MetricTile label="Mode" value={statusCard.modeText} />
    </div>
    <MetricTile label="System" value={statusCard.systemText} />
    <MetricTile label="Data feed" value={statusCard.dataFeedText} />
  </div>
</Panel>
