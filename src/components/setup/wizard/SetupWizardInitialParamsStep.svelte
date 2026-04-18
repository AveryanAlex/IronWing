<script lang="ts">
import { fromStore, get } from "svelte/store";

import {
  getParamsStoreContext,
  getSessionStoreContext,
  getSetupWorkspaceStoreContext,
} from "../../../app/shell/runtime-context";
import { BATTERY_CHEMISTRIES } from "../../../data/battery-presets";
import {
  buildInitialParamsModel,
  createResolvedInitialParamsInputs,
} from "../../../lib/setup/initial-params-model";
import type { SetupWorkspaceStoreState } from "../../../lib/stores/setup-workspace";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";

// Conservative beginner defaults: 9" prop, 4S LiPo. These match the expert
// section's initial field values so the two surfaces stay coherent.
const WIZARD_DEFAULT_PROP_INCHES = 9;
const WIZARD_DEFAULT_CELL_COUNT = 4;
const WIZARD_DEFAULT_CHEMISTRY_INDEX = 0;

let {
  view,
  onAdvance,
}: {
  view: SetupWorkspaceStoreState;
  onAdvance: () => void;
} = $props();

const paramsStore = getParamsStoreContext();
const sessionStore = getSessionStoreContext();
const setupWorkspaceStore = getSetupWorkspaceStoreContext();
const paramsState = fromStore(paramsStore);
const sessionState = fromStore(sessionStore);

let applyPending = $state(false);
let failureMessage = $state<string | null>(null);

let params = $derived(paramsState.current);
let session = $derived(sessionState.current);
let vehicleType = $derived(
  params.vehicleType ?? session.sessionDomain.value?.vehicle_state?.vehicle_type ?? null,
);
let model = $derived(buildInitialParamsModel({
  vehicleType,
  paramStore: params.paramStore,
  metadata: params.metadata,
  stagedEdits: params.stagedEdits,
  inputs: {
    propInches: WIZARD_DEFAULT_PROP_INCHES,
    cellCount: WIZARD_DEFAULT_CELL_COUNT,
    chemistryIndex: WIZARD_DEFAULT_CHEMISTRY_INDEX,
  },
  fallbackInputs: createResolvedInitialParamsInputs({
    propInches: WIZARD_DEFAULT_PROP_INCHES,
    cellCount: WIZARD_DEFAULT_CELL_COUNT,
    chemistryIndex: WIZARD_DEFAULT_CHEMISTRY_INDEX,
  }),
}));
let chemistryLabel = $derived(
  BATTERY_CHEMISTRIES[WIZARD_DEFAULT_CHEMISTRY_INDEX]?.label ?? "LiPo",
);
let stageableBatches = $derived(model.batches.filter((batch) => batch.stageAllowed));
let hasAnyStageable = $derived(
  stageableBatches.some((batch) => batch.entries.some((entry) => entry.item.readOnly !== true)),
);

async function handleApply() {
  if (applyPending) {
    return;
  }

  failureMessage = null;

  const stagedNames: string[] = [];

  for (const batch of stageableBatches) {
    for (const entry of batch.entries) {
      if (entry.item.readOnly === true) {
        continue;
      }

      if (entry.item.value !== entry.nextValue) {
        paramsStore.stageParameterEdit(entry.item, entry.nextValue);
        stagedNames.push(entry.name);
      } else if (params.stagedEdits[entry.name]) {
        stagedNames.push(entry.name);
      }
    }
  }

  if (stagedNames.length === 0) {
    // Already aligned — treat as an explicit confirmation.
    setupWorkspaceStore.confirmSection("initial_params");
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
      : snapshot.applyError ?? "Applying the recommended starter baseline failed.";
    return;
  }

  setupWorkspaceStore.confirmSection("initial_params");
  onAdvance();
}

function handleMarkReviewed() {
  setupWorkspaceStore.confirmSection("initial_params");
  onAdvance();
}
</script>

<div class="space-y-4">
  <p class="text-sm text-text-secondary">
    The wizard can stage Mission Planner's calculator-style starter values
    for a {WIZARD_DEFAULT_PROP_INCHES}" prop on a {WIZARD_DEFAULT_CELL_COUNT}S {chemistryLabel} pack. Open the Initial Parameters
    section for the expert calculator if your build differs.
  </p>

  <div
    class="rounded-lg border border-border bg-bg-primary/80 p-3"
    data-testid={setupWorkspaceTestIds.wizardStepInitialParamsSummary}
  >
    {#if failureMessage}
      <div class="mb-2 text-sm text-danger">
        Apply failed. Staged edits remain in the review tray so you can retry. {failureMessage}
      </div>
    {/if}
    <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
      {model.family.headline}
    </p>
    <p class="mt-1 text-sm text-text-secondary">{model.previewStateText}</p>
    {#if model.batches.length > 0}
      <ul class="mt-3 space-y-2">
        {#each model.batches as batch (batch.id)}
          <li class="rounded-xl border border-border/60 bg-bg-primary/40 px-3 py-2">
            <p class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
              {batch.title}
            </p>
            <p class="mt-1 text-[12px] text-text-secondary">
              {batch.changedCount} recommended change{batch.changedCount === 1 ? "" : "s"}
            </p>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="mt-3 text-sm text-text-secondary">{model.previewDetailText}</p>
    {/if}
  </div>

  <p class="rounded-lg border border-border bg-bg-primary/60 px-4 py-3 text-xs text-text-secondary">
    Tuning continues after the wizard — this step only primes a beginner
    baseline. Full PID tuning lives in its own setup section.
  </p>

  <div class="flex flex-wrap gap-2">
    <button
      class="rounded-full border border-accent bg-accent/10 px-4 py-2 text-sm font-semibold text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:border-border disabled:bg-bg-primary disabled:text-text-muted"
      data-testid={setupWorkspaceTestIds.wizardStepInitialParamsApply}
      disabled={view.checkpoint.blocksActions || applyPending || !hasAnyStageable}
      onclick={handleApply}
      type="button"
    >
      {applyPending ? "Applying…" : "Apply recommended baseline"}
    </button>
    <button
      class="rounded-full border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
      data-testid={setupWorkspaceTestIds.wizardStepInitialParamsConfirm}
      disabled={view.checkpoint.blocksActions || applyPending}
      onclick={handleMarkReviewed}
      type="button"
    >
      Mark as reviewed
    </button>
  </div>
</div>
