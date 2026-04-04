<script lang="ts">
import { fromStore } from "svelte/store";

import { getSessionViewStoreContext } from "../../app/shell/runtime-context";
import type { TelemetrySummaryTone } from "../../lib/telemetry-selectors";

const sessionView = fromStore(getSessionViewStoreContext());

function toneTextClass(tone: TelemetrySummaryTone): string {
  switch (tone) {
    case "positive":
      return "text-success";
    case "caution":
      return "text-warning";
    case "critical":
      return "text-danger";
    default:
      return "text-text-primary";
  }
}

let view = $derived(sessionView.current);
let summary = $derived(view.telemetrySummary);
let batteryTone = $derived(toneTextClass(summary.batteryTone));
let gpsTone = $derived(toneTextClass(summary.gpsTone));
</script>

<section class="rounded-lg border border-border bg-bg-primary p-3">
  <div class="flex items-center justify-between gap-3">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">Telemetry summary</p>
      <h2 class="mt-1 text-base font-semibold text-text-primary">Live flight metrics</h2>
    </div>
    <span class="rounded-md bg-bg-secondary px-2 py-1 text-xs font-semibold text-text-secondary">
      {summary.sessionLabel}
    </span>
  </div>

  <dl class="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
    <div class="rounded-lg border border-border bg-bg-secondary p-2" data-testid="telemetry-alt-value">
      <dt class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Altitude</dt>
      <dd class="mt-1 text-base font-semibold text-text-primary">{summary.altitudeText}</dd>
    </div>

    <div class="rounded-lg border border-border bg-bg-secondary p-2" data-testid="telemetry-speed-value">
      <dt class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Speed</dt>
      <dd class="mt-1 text-base font-semibold text-text-primary">{summary.speedText}</dd>
    </div>

    <div class="rounded-lg border border-border bg-bg-secondary p-2" data-testid="telemetry-battery-value">
      <dt class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Battery</dt>
      <dd class={`mt-1 text-base font-semibold ${batteryTone}`}>{summary.batteryText}</dd>
    </div>

    <div class="rounded-lg border border-border bg-bg-secondary p-2" data-testid="telemetry-heading-value">
      <dt class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Heading</dt>
      <dd class="mt-1 text-base font-semibold text-text-primary">{summary.headingText}</dd>
    </div>

    <div class="rounded-lg border border-border bg-bg-secondary p-2 sm:col-span-2 xl:col-span-1" data-testid="telemetry-gps-text">
      <dt class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">GPS</dt>
      <dd class={`mt-1 text-base font-semibold ${gpsTone}`}>{summary.gpsText}</dd>
    </div>
  </dl>
</section>
