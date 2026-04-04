<script lang="ts">
import { fromStore } from "svelte/store";

import { getSessionViewStoreContext } from "../../app/shell/runtime-context";
import type { ViewTone } from "../../lib/session-selectors";

const sessionView = fromStore(getSessionViewStoreContext());

function toneTextClass(tone: ViewTone): string {
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

function sessionBadgeClass(tone: ViewTone): string {
  return tone === "positive" ? "bg-success/10 text-success" : "bg-bg-primary/70 text-text-secondary";
}

let view = $derived(sessionView.current);
let statusCard = $derived(view.vehicleStatusCard);
</script>

<section class="rounded-lg border border-border bg-bg-primary p-3">
  <div class="flex items-center justify-between gap-3">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">Vehicle status</p>
      <h2 class="mt-1 text-base font-semibold text-text-primary">Live vehicle state</h2>
    </div>
    <span
      class={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ${sessionBadgeClass(statusCard.sessionTone)}`}
    >
      {statusCard.sessionLabel}
    </span>
  </div>

  <dl class="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
    <div class="rounded-lg border border-border bg-bg-secondary p-2" data-testid="telemetry-state-value">
      <dt class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Arm state</dt>
      <dd class={`mt-1 text-base font-semibold ${toneTextClass(statusCard.armStateTone)}`}>
        {statusCard.armStateText}
      </dd>
    </div>

    <div class="rounded-lg border border-border bg-bg-secondary p-2" data-testid="telemetry-mode-value">
      <dt class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Mode</dt>
      <dd class="mt-1 text-base font-semibold text-text-primary">{statusCard.modeText}</dd>
    </div>

    <div class="rounded-lg border border-border bg-bg-secondary p-2">
      <dt class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">System</dt>
      <dd class="mt-1 text-base font-semibold text-text-primary">{statusCard.systemText}</dd>
    </div>

    <div class="rounded-lg border border-border bg-bg-secondary p-2">
      <dt class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Data feed</dt>
      <dd class="mt-1 text-base font-semibold text-text-primary">{statusCard.dataFeedText}</dd>
    </div>
  </dl>
</section>
