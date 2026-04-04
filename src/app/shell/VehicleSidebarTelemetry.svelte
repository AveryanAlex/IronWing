<script lang="ts">
import { fromStore } from "svelte/store";

import { getSessionViewStoreContext } from "./runtime-context";

const sessionView = fromStore(getSessionViewStoreContext());

let view = $derived(sessionView.current);
let statusCard = $derived(view.vehicleStatusCard);
let summary = $derived(view.telemetrySummary);
let gpsText = $derived(summary.gpsText.replace(/^GPS:\s*/, ""));
</script>

<section class="rounded-lg border border-border bg-bg-primary p-3" data-testid="sidebar-telemetry-panel">
  <p class="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">Telemetry</p>

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
