<script lang="ts">
import { fromStore } from "svelte/store";

import {
  getParamsStoreContext,
  getSessionStoreContext,
  getSetupWorkspaceStoreContext,
} from "../../app/shell/runtime-context";
import { resolveDocsUrl } from "../../data/ardupilot-docs";
import { BATTERY_CHEMISTRIES } from "../../data/battery-presets";
import {
  buildInitialParamsModel,
  createResolvedInitialParamsInputs,
  type InitialParamsPreviewBatch,
} from "../../lib/setup/initial-params-model";
import type {
  SetupWorkspaceSection,
  SetupWorkspaceStoreState,
} from "../../lib/stores/setup-workspace";
import SetupPreviewStagePanel from "./shared/SetupPreviewStagePanel.svelte";
import { setupWorkspaceTestIds } from "./setup-workspace-test-ids";

let {
  section,
  view,
  onSelectRecovery,
}: {
  section: SetupWorkspaceSection;
  view: SetupWorkspaceStoreState;
  onSelectRecovery: () => void;
} = $props();

const paramsStore = getParamsStoreContext();
const sessionStore = getSessionStoreContext();
const setupWorkspaceStore = getSetupWorkspaceStoreContext();
const paramsState = fromStore(paramsStore);
const sessionState = fromStore(sessionStore);

let propSizeInput = $state("9");
let cellCountInput = $state("4");
let chemistryIndex = $state(0);
let selectedBatchIds = $state<string[]>([]);
let lastValidInputs = $state(createResolvedInitialParamsInputs({
  propInches: 9,
  cellCount: 4,
  chemistryIndex: 0,
}));

let params = $derived(paramsState.current);
let session = $derived(sessionState.current);
let actionsBlocked = $derived(view.checkpoint.blocksActions || section.availability === "blocked");
let docsUrl = $derived(resolveDocsUrl("tuning"));
let vehicleType = $derived(session.sessionDomain.value?.vehicle_state?.vehicle_type ?? null);
let model = $derived(buildInitialParamsModel({
  vehicleType,
  paramStore: params.paramStore,
  metadata: params.metadata,
  stagedEdits: params.stagedEdits,
  inputs: {
    propInches: parsePositiveNumber(propSizeInput),
    cellCount: parseWholeNumber(cellCountInput),
    chemistryIndex,
  },
  fallbackInputs: lastValidInputs,
}));
let sectionCanConfirm = $derived(model.canConfirm && !actionsBlocked);
let chemistryLabel = $derived(model.resolvedInputs ? BATTERY_CHEMISTRIES[model.resolvedInputs.chemistryIndex]?.label ?? "Unknown" : "Unknown");

$effect(() => {
  if (sectionCanConfirm) {
    setupWorkspaceStore.confirmSection("initial_params");
  } else {
    setupWorkspaceStore.clearSectionConfirmation("initial_params");
  }
});

function parseWholeNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isInteger(parsed) ? parsed : null;
}

function parsePositiveNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function maybeCaptureLastValid(nextPropInput: string, nextCellInput: string, nextChemistryIndex: number) {
  const nextPropInches = parsePositiveNumber(nextPropInput);
  const nextCellCount = parseWholeNumber(nextCellInput);
  const chemistryValid = Number.isInteger(nextChemistryIndex)
    && nextChemistryIndex >= 0
    && nextChemistryIndex < BATTERY_CHEMISTRIES.length;

  if (nextPropInches === null || nextCellCount === null || !chemistryValid) {
    return;
  }

  lastValidInputs = createResolvedInitialParamsInputs({
    propInches: nextPropInches,
    cellCount: nextCellCount,
    chemistryIndex: nextChemistryIndex,
  });
}

function updatePropSize(value: string) {
  propSizeInput = value;
  maybeCaptureLastValid(value, cellCountInput, chemistryIndex);
}

function updateCellCount(value: string) {
  cellCountInput = value;
  maybeCaptureLastValid(propSizeInput, value, chemistryIndex);
}

function updateChemistry(value: string) {
  const nextChemistryIndex = Number(value);
  chemistryIndex = nextChemistryIndex;
  maybeCaptureLastValid(propSizeInput, cellCountInput, nextChemistryIndex);
}

function stageBatch(batch: InitialParamsPreviewBatch) {
  if (actionsBlocked || !batch.stageAllowed) {
    return;
  }

  for (const entry of batch.entries) {
    if (entry.item.readOnly === true) {
      continue;
    }

    paramsStore.stageParameterEdit(entry.item, entry.nextValue);
  }
}

function toggleBatchSelection(batchId: string) {
  if (selectedBatchIds.includes(batchId)) {
    selectedBatchIds = selectedBatchIds.filter((id) => id !== batchId);
  } else {
    selectedBatchIds = [...selectedBatchIds, batchId];
  }
}

function stageSelectedBatches() {
  if (actionsBlocked) {
    return;
  }

  for (const batch of model.batches) {
    if (selectedBatchIds.includes(batch.id) && batch.stageAllowed) {
      stageBatch(batch);
    }
  }
}

function resolvedInputText(): string {
  if (!model.resolvedInputs) {
    return "No valid calculator inputs yet";
  }

  return `${model.resolvedInputs.propInches}\" prop · ${model.resolvedInputs.cellCount}S · ${chemistryLabel}`;
}
</script>

<section class="space-y-4" data-testid={setupWorkspaceTestIds.initialParamsSection}>
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">{section.title}</p>
      <h3 class="mt-2 text-lg font-semibold text-text-primary">Preview starter settings from your vehicle inputs</h3>
      <p class="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">
        Enter prop size, battery chemistry, and cell count to preview starter settings for this vehicle family. Review the suggested batches here, then queue any changes through the review tray.
      </p>
    </div>

    {#if docsUrl}
      <a
        class="rounded-md border border-border bg-bg-primary/80 px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
        data-testid={setupWorkspaceTestIds.initialParamsDocsLink}
        href={docsUrl}
        rel="noreferrer"
        target="_blank"
      >
        Tuning docs
      </a>
    {/if}
  </div>

  <div
    class="grid gap-3 rounded-lg border border-border bg-bg-primary/80 p-3 md:grid-cols-3"
    data-testid={setupWorkspaceTestIds.initialParamsSummary}
  >
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Vehicle family</p>
      <p class="mt-2 text-sm font-semibold text-text-primary" data-testid={setupWorkspaceTestIds.initialParamsFamilyState}>
        {model.family.headline}
      </p>
      <p class="mt-1 text-sm text-text-secondary">{model.family.detail}</p>
    </div>
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Preview state</p>
      <p class="mt-2 text-sm font-semibold text-text-primary" data-testid={setupWorkspaceTestIds.initialParamsPreviewState}>
        {model.previewStateText}
      </p>
      <p class="mt-1 text-sm text-text-secondary">{model.previewDetailText}</p>
    </div>
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Resolved inputs</p>
      <p class="mt-2 text-sm font-semibold text-text-primary">{resolvedInputText()}</p>
      <p class="mt-1 text-sm text-text-secondary">
        {#if model.usingFallbackInputs}
          Last valid inputs are retained for visibility only until the current calculator fields are fixed.
        {:else}
          Starter batches stay scoped to the currently resolved calculator assumptions.
        {/if}
      </p>
    </div>
  </div>

  <article class="rounded-lg border border-border bg-bg-primary/80 p-3">
    <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Vehicle inputs</p>
    <h4 class="mt-2 text-base font-semibold text-text-primary">Starter assumptions</h4>
    <p class="mt-2 text-sm text-text-secondary">
      Update the physical assumptions first. Preview batches stay hidden until inputs are valid, and stale retained previews remain non-stageable.
    </p>

    <div class="mt-4 grid gap-3 md:grid-cols-3">
      <label class="block">
        <span class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Prop size (inches)</span>
        <input
          class="mt-2 w-full rounded-xl border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary"
          data-testid={`${setupWorkspaceTestIds.initialParamsInputPrefix}-prop_inches`}
          inputmode="decimal"
          min="1"
          oninput={(event) => updatePropSize((event.currentTarget as HTMLInputElement).value)}
          step="0.5"
          type="number"
          value={propSizeInput}
        />
      </label>

      <label class="block">
        <span class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Battery cells</span>
        <input
          class="mt-2 w-full rounded-xl border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary"
          data-testid={`${setupWorkspaceTestIds.initialParamsInputPrefix}-cell_count`}
          inputmode="numeric"
          min="1"
          oninput={(event) => updateCellCount((event.currentTarget as HTMLInputElement).value)}
          step="1"
          type="number"
          value={cellCountInput}
        />
      </label>

      <label class="block">
        <span class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Battery chemistry</span>
        <select
          class="mt-2 w-full rounded-xl border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary"
          data-testid={`${setupWorkspaceTestIds.initialParamsInputPrefix}-chemistry`}
          onchange={(event) => updateChemistry((event.currentTarget as HTMLSelectElement).value)}
          value={String(chemistryIndex)}
        >
          {#each BATTERY_CHEMISTRIES as chemistry, index (chemistry.label)}
            <option value={String(index)}>{chemistry.label}</option>
          {/each}
        </select>
      </label>
    </div>
  </article>

  {#if model.validationMessage}
    <div
      class="rounded-lg border border-warning/40 bg-warning/10 px-4 py-4 text-sm leading-6 text-warning"
      data-testid={`${setupWorkspaceTestIds.initialParamsBannerPrefix}-inputs`}
    >
      {model.validationMessage}
    </div>
  {/if}

  {#if model.batches.length > 0}
    <div class="grid gap-3 xl:grid-cols-3">
      {#each model.batches as batch (batch.id)}
        <article
          class="rounded-lg border border-border bg-bg-primary/80 p-3"
          data-testid={`${setupWorkspaceTestIds.initialParamsPreviewPrefix}-${batch.id}`}
        >
          <div class="flex items-center justify-between mb-2">
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Preview batch</p>
            {#if batch.stageAllowed}
              <label class="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedBatchIds.includes(batch.id)}
                  onchange={() => toggleBatchSelection(batch.id)}
                  class="rounded border-border bg-bg-secondary text-accent focus:ring-accent"
                />
                Select
              </label>
            {/if}
          </div>
          <h4 class="mt-2 text-base font-semibold text-text-primary">{batch.title}</h4>
          <p class="mt-2 text-sm text-text-secondary">{batch.description}</p>
          <div class="mt-4">
            <SetupPreviewStagePanel
              headerLabel={`Preview · ${batch.title}`}
              onCancel={() => undefined}
              onStage={() => stageBatch(batch)}
              rows={batch.rows}
              stageDisabled={actionsBlocked || !batch.stageAllowed}
              stageLabel={batch.stageAllowed ? "Stage in review tray" : "Preview only"}
            />
          </div>
          {#if batch.stageBlockedReason}
            <p class="mt-3 text-xs leading-5 text-warning">{batch.stageBlockedReason}</p>
          {/if}
        </article>
      {/each}
    </div>

    <div class="mt-4 flex justify-end">
      <button
        class="rounded-md border border-border bg-bg-primary/80 px-6 py-3 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
        onclick={stageSelectedBatches}
        disabled={actionsBlocked || selectedBatchIds.length === 0}
        type="button"
      >
        Stage {selectedBatchIds.length} selected batch{selectedBatchIds.length === 1 ? "" : "es"}
      </button>
    </div>
  {/if}

  {#if model.recoveryReasons.length > 0}
    <div
      class="rounded-lg border border-warning/40 bg-warning/10 px-4 py-4 text-sm leading-6 text-warning"
      data-testid={setupWorkspaceTestIds.initialParamsRecovery}
    >
      <p class="font-semibold text-text-primary">Initial-parameter recovery is active.</p>
      <ul class="mt-2 list-disc space-y-1 pl-5">
        {#each model.recoveryReasons as reason (reason)}
          <li>{reason}</li>
        {/each}
      </ul>
      <button
        class="mt-4 rounded-md border border-warning/50 bg-bg-primary/80 px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
        onclick={onSelectRecovery}
        type="button"
      >
        Open Full Parameters recovery
      </button>
    </div>
  {/if}
</section>
