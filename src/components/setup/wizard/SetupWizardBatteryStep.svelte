<script lang="ts">
import { fromStore, get } from "svelte/store";

import { getParamsStoreContext } from "../../../app/shell/runtime-context";
import {
  buildParameterItemIndex,
  type ParameterItemModel,
} from "../../../lib/params/parameter-item-model";
import type { SetupWorkspaceStoreState } from "../../../lib/stores/setup-workspace";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";

type EnumOption = { code: number; label: string };

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
let monitorItem = $derived(itemIndex.get("BATT_MONITOR") ?? null);
let monitorOptions = $derived(resolveEnumOptions(params.metadata?.get("BATT_MONITOR")?.values));

// Mirror the expert section: bind the draft to staged → current value, letting
// `bind:value` write back through the $derived accessor.
let monitorDraft = $derived(
  String(
    params.stagedEdits.BATT_MONITOR?.nextValue
      ?? monitorItem?.value
      ?? "",
  ),
);

let currentMonitorLabel = $derived(
  monitorItem?.valueLabel ?? monitorItem?.valueText ?? "Unavailable",
);

async function handleApply() {
  if (applyPending) {
    return;
  }

  failureMessage = null;

  const stagedNames: string[] = [];

  if (monitorItem && !monitorItem.readOnly) {
    const nextValue = resolveDraftNumber(monitorDraft);
    if (nextValue !== null && nextValue !== monitorItem.value) {
      paramsStore.stageParameterEdit(monitorItem, nextValue);
      stagedNames.push(monitorItem.name);
    } else if (params.stagedEdits.BATT_MONITOR) {
      stagedNames.push("BATT_MONITOR");
    }
  }

  // Draft already matches the vehicle and nothing was staged — just advance.
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
      : snapshot.applyError ?? "Applying the battery monitor preset failed.";
    return;
  }

  onAdvance();
}

function resolveEnumOptions(values: { code: number; label: string }[] | undefined): EnumOption[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return values.filter((value) => Number.isFinite(value.code) && value.label.trim().length > 0);
}

function resolveDraftNumber(value: string): number | null {
  if (value.trim().length === 0) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
</script>

<div class="space-y-4">
  <p class="text-sm text-text-secondary">
    Pick the battery monitor backend that matches the installed power module.
    Most beginner builds use an analog voltage-and-current sensor.
  </p>

  <div
    class="rounded-2xl border border-border bg-bg-primary/80 p-4"
    data-testid={setupWorkspaceTestIds.wizardStepBatterySummary}
  >
    {#if failureMessage}
      <div class="mb-2 text-sm text-danger">
        Apply failed. Staged edits remain in the review tray so you can retry. {failureMessage}
      </div>
    {/if}
    <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Current battery monitor</p>
    <p class="mt-2 text-sm font-semibold text-text-primary">{currentMonitorLabel}</p>
    <p class="mt-1 text-[11px] text-text-muted">BATT_MONITOR</p>
  </div>

  {#if monitorItem && monitorOptions.length > 0}
    <label class="block">
      <span class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
        Battery monitor preset
      </span>
      <select
        bind:value={monitorDraft}
        class="mt-2 w-full rounded-xl border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary"
        data-testid={setupWorkspaceTestIds.wizardStepBatteryPreset}
        disabled={view.checkpoint.blocksActions || applyPending}
      >
        {#each monitorOptions as option (option.code)}
          <option value={String(option.code)}>{option.label}</option>
        {/each}
      </select>
    </label>
  {/if}

  <p class="rounded-2xl border border-border bg-bg-primary/60 px-4 py-3 text-xs text-text-secondary">
    Need to tweak board pins, sensor scaling, or chemistry thresholds? Open
    the Battery Monitor section from the wizard footer for the expert layout.
  </p>

  <div class="flex flex-wrap gap-2">
    <button
      class="rounded-full border border-accent bg-accent/10 px-4 py-2 text-sm font-semibold text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:border-border disabled:bg-bg-primary disabled:text-text-muted"
      data-testid={setupWorkspaceTestIds.wizardStepBatteryApply}
      disabled={view.checkpoint.blocksActions || applyPending || !monitorItem}
      onclick={handleApply}
      type="button"
    >
      {applyPending ? "Applying…" : "Apply and continue"}
    </button>
  </div>
</div>
