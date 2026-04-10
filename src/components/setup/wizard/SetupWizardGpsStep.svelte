<script lang="ts">
import { fromStore, get } from "svelte/store";

import { getParamsStoreContext } from "../../../app/shell/runtime-context";
import {
  buildParameterItemIndex,
  type ParameterItemModel,
} from "../../../lib/params/parameter-item-model";
import type { SetupWorkspaceStoreState } from "../../../lib/stores/setup-workspace";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";

// GPS_TYPE=1 is the ArduPilot "Auto" detector — the beginner-safe default the
// real section leans on. Staging it through the shared params store keeps the
// wizard aligned with the expert detour instead of minting a separate path.
const GPS_TYPE_AUTO = 1;

let {
  view,
  onAdvance,
}: {
  view: SetupWorkspaceStoreState;
  onAdvance: () => void;
} = $props();

const paramsStore = getParamsStoreContext();
const paramsState = fromStore(paramsStore);

let applyPending = $state(false);
let failureMessage = $state<string | null>(null);

let params = $derived(paramsState.current);
let itemIndex = $derived(buildParameterItemIndex(params.paramStore, params.metadata));
let gpsTypeItem = $derived(resolvePrimaryGpsTypeItem(itemIndex));
let autoSwitchItem = $derived(itemIndex.get("GPS_AUTO_SWITCH") ?? null);

let currentGpsTypeLabel = $derived(
  gpsTypeItem?.valueLabel ?? gpsTypeItem?.valueText ?? "Unavailable",
);
let currentAutoSwitchLabel = $derived(
  autoSwitchItem?.valueLabel ?? autoSwitchItem?.valueText ?? "Unavailable",
);

async function handleApply() {
  if (applyPending) {
    return;
  }

  failureMessage = null;

  const stagedNames: string[] = [];

  if (gpsTypeItem && !gpsTypeItem.readOnly && gpsTypeItem.value !== GPS_TYPE_AUTO) {
    paramsStore.stageParameterEdit(gpsTypeItem, GPS_TYPE_AUTO);
    stagedNames.push(gpsTypeItem.name);
  } else if (gpsTypeItem && params.stagedEdits[gpsTypeItem.name]) {
    stagedNames.push(gpsTypeItem.name);
  }

  // Beginner path already matches auto-detect — advance without touching the store.
  if (stagedNames.length === 0) {
    onAdvance();
    return;
  }

  applyPending = true;
  try {
    await paramsStore.applyStagedEdits(stagedNames);
  } finally {
    applyPending = false;
  }

  const snapshot = get(paramsStore);
  const retainedFailureMessages = stagedNames
    .map((name) => snapshot.retainedFailures[name])
    .filter((failure): failure is NonNullable<typeof failure> => failure != null)
    .map((failure) => `${failure.name}: ${failure.message}`);

  const phaseFailed = snapshot.applyPhase === "failed" || snapshot.applyPhase === "partial-failure";

  if (retainedFailureMessages.length > 0 || phaseFailed) {
    failureMessage = retainedFailureMessages.length > 0
      ? retainedFailureMessages.join(" · ")
      : snapshot.applyError ?? "Applying the recommended GPS defaults failed.";
    return;
  }

  onAdvance();
}

function resolvePrimaryGpsTypeItem(
  index: Map<string, ParameterItemModel>,
): ParameterItemModel | null {
  return index.get("GPS1_TYPE") ?? index.get("GPS_TYPE") ?? null;
}
</script>

<div class="space-y-4">
  <p class="text-sm text-text-secondary">
    Tell the vehicle which GPS receiver to use. The beginner path stages
    auto-detect so most wired receivers start working without extra tuning.
  </p>

  <div
    class="grid gap-3 rounded-2xl border border-border bg-bg-primary/80 p-4 md:grid-cols-2"
    data-testid={setupWorkspaceTestIds.wizardStepGpsSummary}
  >
    {#if failureMessage}
      <div class="md:col-span-2 text-sm text-danger">
        Apply failed. Staged edits remain in the review tray so you can retry. {failureMessage}
      </div>
    {/if}
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Primary GPS type</p>
      <p class="mt-2 text-sm font-semibold text-text-primary">{currentGpsTypeLabel}</p>
      <p class="mt-1 text-[11px] text-text-muted">{gpsTypeItem?.name ?? "GPS_TYPE"}</p>
    </div>
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Auto switch</p>
      <p class="mt-2 text-sm font-semibold text-text-primary">{currentAutoSwitchLabel}</p>
      <p class="mt-1 text-[11px] text-text-muted">GPS_AUTO_SWITCH</p>
    </div>
  </div>

  <p class="rounded-2xl border border-border bg-bg-primary/60 px-4 py-3 text-xs text-text-secondary">
    Need a specific driver or GNSS constellation mask? Open the GPS section
    from the wizard footer for the expert layout.
  </p>

  <div class="flex flex-wrap gap-2">
    <button
      class="rounded-full border border-accent bg-accent/10 px-4 py-2 text-sm font-semibold text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:border-border disabled:bg-bg-primary disabled:text-text-muted"
      data-testid={setupWorkspaceTestIds.wizardStepGpsApply}
      disabled={view.checkpoint.blocksActions || applyPending}
      onclick={handleApply}
      type="button"
    >
      {applyPending ? "Applying…" : "Apply and continue"}
    </button>
  </div>
</div>
