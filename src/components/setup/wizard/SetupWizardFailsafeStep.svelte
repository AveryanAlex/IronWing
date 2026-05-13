<script lang="ts">
import { fromStore, get } from "svelte/store";

import {
  getParamsStoreContext,
  getSessionStoreContext,
  getSetupWorkspaceStoreContext,
} from "../../../app/shell/runtime-context";
import {
  buildParameterItemIndex,
  type ParameterItemModel,
} from "../../../lib/params/parameter-item-model";
import {
  FAILSAFE_DEFAULTS_COPTER,
  FAILSAFE_DEFAULTS_PLANE,
  FAILSAFE_DEFAULTS_ROVER,
  resolveSafetyVehicleFamily,
  type SafetyDefaultsEntry,
} from "../../../lib/setup/failsafe-model";
import type { SetupWorkspaceStoreState } from "../../../lib/stores/setup-workspace";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";

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
let itemIndex = $derived(buildParameterItemIndex(params.paramStore, params.metadata));
let vehicleType = $derived(
  params.vehicleType ?? session.sessionDomain.value?.vehicle_state?.vehicle_type ?? null,
);
let family = $derived(resolveSafetyVehicleFamily(vehicleType));
let defaults = $derived(selectDefaults(family));
let defaultsRows = $derived(defaults.map((entry) => ({
  paramName: entry.paramName,
  label: entry.label,
  nextValue: entry.value,
  item: itemIndex.get(entry.paramName) ?? null,
  currentValue: itemIndex.get(entry.paramName)?.value ?? null,
})));
let hasAnyWritable = $derived(
  defaultsRows.some((row) => row.item !== null && row.item.readOnly !== true),
);

async function handleApply() {
  if (applyPending) {
    return;
  }

  failureMessage = null;

  const stagedNames: string[] = [];

  for (const row of defaultsRows) {
    if (!row.item || row.item.readOnly === true) {
      continue;
    }

    if (row.item.value !== row.nextValue) {
      paramsStore.stageParameterEdit(row.item, row.nextValue);
      stagedNames.push(row.item.name);
    } else if (params.stagedEdits[row.item.name]) {
      stagedNames.push(row.item.name);
    }
  }

  if (stagedNames.length === 0) {
    // Already aligned — still treat this as an explicit confirmation.
    setupWorkspaceStore.confirmSection("failsafe");
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
      : snapshot.applyError ?? "Applying the recommended failsafe defaults failed.";
    return;
  }

  setupWorkspaceStore.confirmSection("failsafe");
  onAdvance();
}

function handleMarkReviewed() {
  setupWorkspaceStore.confirmSection("failsafe");
  onAdvance();
}

function selectDefaults(familyValue: ReturnType<typeof resolveSafetyVehicleFamily>): SafetyDefaultsEntry[] {
  switch (familyValue) {
    case "plane":
      return FAILSAFE_DEFAULTS_PLANE;
    case "rover":
      return FAILSAFE_DEFAULTS_ROVER;
    case "copter":
      return FAILSAFE_DEFAULTS_COPTER;
    default:
      // Unknown vehicle family still shows copter defaults as a baseline,
      // matching the SetupFailsafeSection fallback ordering.
      return FAILSAFE_DEFAULTS_COPTER;
  }
}
</script>

<div class="space-y-4">
  <p class="text-sm text-text-secondary">
    Review the recommended failsafe defaults for this vehicle family. Apply
    them here, or confirm the section if you have already tuned the rows
    elsewhere.
  </p>

  <div
    class="rounded-lg border border-border bg-bg-primary/80 p-3"
    data-testid={setupWorkspaceTestIds.wizardStepFailsafeSummary}
  >
    {#if failureMessage}
      <div class="mb-2 text-sm text-danger">
        Apply failed. Staged edits remain in the review tray so you can retry. {failureMessage}
      </div>
    {/if}
    <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">
      Recommended defaults ({family})
    </p>
    <ul class="mt-2 space-y-1 text-sm text-text-primary">
      {#each defaultsRows as row (row.paramName)}
        <li class="flex items-center justify-between gap-2">
          <span class="font-mono text-xs">{row.paramName}</span>
          <span class="text-text-secondary">
            {row.currentValue ?? "--"} → {row.nextValue}
            {#if row.item === null}
              <span class="ml-1 text-warning">(unavailable)</span>
            {/if}
          </span>
        </li>
      {/each}
    </ul>
  </div>

  <p class="rounded-lg border border-border bg-bg-primary/60 px-4 py-3 text-xs text-text-secondary">
    Need per-action tuning? Open the Failsafe section from the wizard footer
    for the expert layout.
  </p>

  <div class="flex flex-wrap gap-2">
    <button
      class="rounded-full border border-accent bg-accent/10 px-4 py-2 text-sm font-semibold text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:border-border disabled:bg-bg-primary disabled:text-text-muted"
      data-testid={setupWorkspaceTestIds.wizardStepFailsafeApply}
      disabled={view.checkpoint.blocksActions || applyPending || !hasAnyWritable}
      onclick={handleApply}
      type="button"
    >
      {applyPending ? "Applying…" : "Apply recommended defaults"}
    </button>
    <button
      class="rounded-full border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
      data-testid={setupWorkspaceTestIds.wizardStepFailsafeConfirm}
      disabled={view.checkpoint.blocksActions || applyPending}
      onclick={handleMarkReviewed}
      type="button"
    >
      Mark as reviewed
    </button>
  </div>
</div>
