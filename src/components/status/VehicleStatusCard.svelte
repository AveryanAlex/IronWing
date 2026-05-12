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
  <div class="vehicle-status__header">
    <div>
      <p class="vehicle-status__eyebrow">Vehicle status</p>
      <h2 class="vehicle-status__title">Live vehicle state</h2>
    </div>
    <StatusPill tone={pillTone(statusCard.sessionTone)}>{statusCard.sessionLabel}</StatusPill>
  </div>

  <div class="vehicle-status__grid">
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

<style>
.vehicle-status__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}
.vehicle-status__eyebrow {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.vehicle-status__title {
  margin: 4px 0 0;
  font-size: 1rem;
  font-weight: 650;
  color: var(--color-text-primary);
}
.vehicle-status__grid {
  margin-top: var(--space-4);
  display: grid;
  gap: var(--space-2);
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
@media (min-width: 1280px) {
  .vehicle-status__grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
</style>
