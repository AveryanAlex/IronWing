<script lang="ts">
import { fromStore, get } from "svelte/store";

import {
  getParamsStoreContext,
  getSessionStoreContext,
  getSetupWorkspaceStoreContext,
} from "../../../app/shell/runtime-context";
import { buildParameterItemIndex } from "../../../lib/params/parameter-item-model";
import {
  FLIGHT_MODE_PARAM_NAMES,
  RECOMMENDED_FLIGHT_MODE_PRESETS,
  vehicleTypeToFlightModePreset,
  type FlightModePreset,
} from "../../../lib/setup/flight-mode-model";
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
// Fall back to the copter preset when the vehicle family is unknown — the
// wizard still needs a deterministic baseline to show and stage.
let preset = $derived<FlightModePreset>(
  vehicleTypeToFlightModePreset(vehicleType) ?? "copter",
);
let recommended = $derived(RECOMMENDED_FLIGHT_MODE_PRESETS[preset]);
let slotRows = $derived(FLIGHT_MODE_PARAM_NAMES.map((paramName, index) => {
  const item = itemIndex.get(paramName) ?? null;
  const recommendedValue = recommended.modes[index] ?? null;
  const recommendedLabel = recommended.labels[index] ?? String(recommendedValue ?? "--");
  return {
    paramName,
    slot: index + 1,
    item,
    currentValue: item?.value ?? null,
    currentLabel: item?.valueLabel ?? item?.valueText ?? "Unavailable",
    recommendedValue,
    recommendedLabel,
  };
}));
let hasAnyWritable = $derived(
  slotRows.some((row) =>
    row.item !== null && row.item.readOnly !== true && row.recommendedValue !== null,
  ),
);

async function handleApplyPreset() {
  if (applyPending) {
    return;
  }

  failureMessage = null;

  const stagedNames: string[] = [];

  for (const row of slotRows) {
    if (!row.item || row.item.readOnly === true || row.recommendedValue === null) {
      continue;
    }

    if (row.item.value !== row.recommendedValue) {
      paramsStore.stageParameterEdit(row.item, row.recommendedValue);
      stagedNames.push(row.item.name);
    } else if (params.stagedEdits[row.item.name]) {
      stagedNames.push(row.item.name);
    }
  }

  if (stagedNames.length === 0) {
    // Already aligned — treat as an explicit confirmation.
    setupWorkspaceStore.confirmSection("flight_modes");
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
      : snapshot.applyError ?? "Applying the recommended flight mode preset failed.";
    return;
  }

  setupWorkspaceStore.confirmSection("flight_modes");
  onAdvance();
}

function handleMarkReviewed() {
  setupWorkspaceStore.confirmSection("flight_modes");
  onAdvance();
}
</script>

<div class="space-y-4">
  <p class="text-sm text-text-secondary">
    Review the six flight mode slots. The wizard can stage the standard
    beginner preset for the active vehicle family, or you can keep the
    current assignments and mark the section as reviewed.
  </p>

  <div
    class="rounded-2xl border border-border bg-bg-primary/80 p-4"
    data-testid={setupWorkspaceTestIds.wizardStepFlightModesSummary}
  >
    {#if failureMessage}
      <div class="mb-2 text-sm text-danger">
        Apply failed. Staged edits remain in the review tray so you can retry. {failureMessage}
      </div>
    {/if}
    <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
      Recommended {preset} preset
    </p>
    <ul class="mt-2 space-y-1 text-sm text-text-primary">
      {#each slotRows as row (row.paramName)}
        <li class="flex items-center justify-between gap-2">
          <span class="font-mono text-[12px]">{row.paramName}</span>
          <span class="text-text-secondary">
            {row.currentLabel} → {row.recommendedLabel}
            {#if row.item === null}
              <span class="ml-1 text-warning">(unavailable)</span>
            {/if}
          </span>
        </li>
      {/each}
    </ul>
  </div>

  <p class="rounded-2xl border border-border bg-bg-primary/60 px-4 py-3 text-xs text-text-secondary">
    Need to wire up a non-standard channel or choose custom modes per slot?
    Open the Flight Modes section from the wizard footer for the expert
    layout.
  </p>

  <div class="flex flex-wrap gap-2">
    <button
      class="rounded-full border border-accent bg-accent/10 px-4 py-2 text-sm font-semibold text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:border-border disabled:bg-bg-primary disabled:text-text-muted"
      data-testid={setupWorkspaceTestIds.wizardStepFlightModesPreset}
      disabled={view.checkpoint.blocksActions || applyPending || !hasAnyWritable}
      onclick={handleApplyPreset}
      type="button"
    >
      {applyPending ? "Applying…" : "Apply recommended preset"}
    </button>
    <button
      class="rounded-full border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
      data-testid={setupWorkspaceTestIds.wizardStepFlightModesConfirm}
      disabled={view.checkpoint.blocksActions || applyPending}
      onclick={handleMarkReviewed}
      type="button"
    >
      Mark as reviewed
    </button>
  </div>
</div>
