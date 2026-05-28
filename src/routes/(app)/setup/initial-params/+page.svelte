<script lang="ts">
import { fromStore } from "svelte/store";

import {
  getParamsStoreContext,
  getSessionStoreContext,
  getSetupWorkspaceStoreContext,
} from "../../../../app/shell/runtime-context";
import { resolveDocsUrl } from "../../../../data/ardupilot-docs";
import { BATTERY_CHEMISTRIES } from "../../../../data/battery-presets";
import {
  buildInitialParamsModel,
  createResolvedInitialParamsInputs,
  type InitialParamsPreviewBatch,
} from "../../../../lib/setup/initial-params-model";
import type { SetupWorkspaceSection, SetupWorkspaceStoreState } from "../../../../lib/stores/setup-workspace";
import {
  Alert,
  ActionRow,
  Button,
  Card,
  Checkbox,
  Eyebrow,
  Field,
  HelperText,
  Input,
  NativeSelect,
} from "../../../../components/ui";
import SetupPreviewStagePanel from "../../../../features/setup/shared/SetupPreviewStagePanel.svelte";
import SetupSectionShell from "../../../../features/setup/components/SetupSectionShell.svelte";
import { setupWorkspaceTestIds } from "../../../../features/setup/setup-workspace-test-ids";
import {
  getSetupWorkspaceRouteContext,
  setupRouteSection,
} from "../../../../features/setup/components/setup-workspace-route-context";

const route = getSetupWorkspaceRouteContext();
const viewStore = fromStore(route.viewStore);

let view = $derived(viewStore.current);
let section = $derived(setupRouteSection(view, "initial_params"));

const paramsStore = getParamsStoreContext();
const sessionStore = getSessionStoreContext();
const setupWorkspaceStore = getSetupWorkspaceStoreContext();
const paramsState = fromStore(paramsStore);
const sessionState = fromStore(sessionStore);

let propSizeInput = $state("9");
let cellCountInput = $state("4");
let chemistryIndex = $state(0);
let selectedBatchIds = $state<string[]>([]);
let lastValidInputs = $state(
  createResolvedInitialParamsInputs({
    propInches: 9,
    cellCount: 4,
    chemistryIndex: 0,
  }),
);

let params = $derived(paramsState.current);
let session = $derived(sessionState.current);
let actionsBlocked = $derived(view.checkpoint.blocksActions);
let docsUrl = $derived(resolveDocsUrl("tuning"));
let vehicleType = $derived(session.sessionDomain.value?.vehicle_state?.vehicle_type ?? null);
let model = $derived(
  buildInitialParamsModel({
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
  }),
);
let sectionCanConfirm = $derived(model.canConfirm && !actionsBlocked);
let chemistryLabel = $derived(
  model.resolvedInputs ? (BATTERY_CHEMISTRIES[model.resolvedInputs.chemistryIndex]?.label ?? "Unknown") : "Unknown",
);
let chemistryOptions = $derived(
  BATTERY_CHEMISTRIES.map((chemistry, index) => ({ value: String(index), label: chemistry.label })),
);

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
  const chemistryValid =
    Number.isInteger(nextChemistryIndex) && nextChemistryIndex >= 0 && nextChemistryIndex < BATTERY_CHEMISTRIES.length;

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

<SetupSectionShell
  sectionId={section.id}
  eyebrow={section.title}
  title="Preview starter settings from your vehicle inputs"
  description="Enter prop size, battery chemistry, and cell count to preview starter settings for this vehicle family. Review the suggested batches here, then queue any changes through the review tray."
  testId={setupWorkspaceTestIds.initialParamsSection}
  docs={[{ url: docsUrl, label: "ArduPilot Docs", testId: setupWorkspaceTestIds.initialParamsDocsLink }]}
>
  {#snippet body()}
      <Card.Root
        density="compact"
        gap="compact"
        class="grid md:grid-cols-3"
        surface="elevated"
        testId={setupWorkspaceTestIds.initialParamsSummary}
      >
    <div>
      <Eyebrow tracking="widest">Vehicle family</Eyebrow>
      <p class="mt-2 text-sm font-semibold text-text-primary" data-testid={setupWorkspaceTestIds.initialParamsFamilyState}>
        {model.family.headline}
      </p>
      <HelperText class="mt-1">{model.family.detail}</HelperText>
    </div>
    <div>
      <Eyebrow tracking="widest">Preview state</Eyebrow>
      <p class="mt-2 text-sm font-semibold text-text-primary" data-testid={setupWorkspaceTestIds.initialParamsPreviewState}>
        {model.previewStateText}
      </p>
      <HelperText class="mt-1">{model.previewDetailText}</HelperText>
    </div>
    <div>
      <Eyebrow tracking="widest">Resolved inputs</Eyebrow>
      <p class="mt-2 text-sm font-semibold text-text-primary">{resolvedInputText()}</p>
      <HelperText class="mt-1">
        {#if model.usingFallbackInputs}
          Last valid inputs are retained for visibility only until the current calculator fields are fixed.
        {:else}
          Starter batches stay scoped to the currently resolved calculator assumptions.
        {/if}
      </HelperText>
    </div>
  </Card.Root>

  <Card.Root as="article" density="compact" surface="elevated">
    <Eyebrow tracking="widest">Vehicle inputs</Eyebrow>
    <h4 class="mt-2 text-base font-semibold text-text-primary">Starter assumptions</h4>
    <HelperText class="mt-2">
      Update the physical assumptions first. Preview batches stay hidden until inputs are valid, and stale retained previews remain non-stageable.
    </HelperText>

    <div class="mt-4 grid gap-3 md:grid-cols-3">
      <Field.Root>
        <Field.Label>Prop size (inches)</Field.Label>
        <Input
          data-testid={`${setupWorkspaceTestIds.initialParamsInputPrefix}-prop_inches`}
          inputmode="decimal"
          min="1"
          oninput={(event) => updatePropSize((event.currentTarget as HTMLInputElement).value)}
          step="0.5"
          type="number"
          value={propSizeInput}
        />
      </Field.Root>

      <Field.Root>
        <Field.Label>Battery cells</Field.Label>
        <Input
          data-testid={`${setupWorkspaceTestIds.initialParamsInputPrefix}-cell_count`}
          inputmode="numeric"
          min="1"
          oninput={(event) => updateCellCount((event.currentTarget as HTMLInputElement).value)}
          step="1"
          type="number"
          value={cellCountInput}
        />
      </Field.Root>

      <Field.Root>
        <Field.Label>Battery chemistry</Field.Label>
        <NativeSelect
          onchange={(event) => updateChemistry((event.currentTarget as HTMLSelectElement).value)}
          options={chemistryOptions}
          testId={`${setupWorkspaceTestIds.initialParamsInputPrefix}-chemistry`}
          value={String(chemistryIndex)}
        />
      </Field.Root>
    </div>
  </Card.Root>

  {#if model.validationMessage}
      <Alert variant="warning" density="compact" shadow={false} description={model.validationMessage} testId={`${setupWorkspaceTestIds.initialParamsBannerPrefix}-inputs`} />
  {/if}

  {#if model.batches.length > 0}
    <div class="grid gap-3 2xl:grid-cols-2">
      {#each model.batches as batch (batch.id)}
        <Card.Root
          as="article"
          density="compact"
          surface="elevated"
          testId={`${setupWorkspaceTestIds.initialParamsPreviewPrefix}-${batch.id}`}
        >
          <div class="flex items-center justify-between mb-2">
            <Eyebrow tracking="widest">Preview batch</Eyebrow>
            {#if batch.stageAllowed}
              <Checkbox
                checked={selectedBatchIds.includes(batch.id)}
                label="Select"
                onCheckedChange={() => toggleBatchSelection(batch.id)}
              />
            {/if}
          </div>
          <h4 class="mt-2 text-base font-semibold text-text-primary">{batch.title}</h4>
          <HelperText class="mt-2">{batch.description}</HelperText>
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
            <HelperText class="mt-3" size="xs" tone="warning">{batch.stageBlockedReason}</HelperText>
          {/if}
        </Card.Root>
      {/each}
    </div>

    <ActionRow class="mt-4">
      <Button
        variant="outline"
        size="lg"
        onclick={stageSelectedBatches}
        disabled={actionsBlocked || selectedBatchIds.length === 0}
      >
        Stage {selectedBatchIds.length} selected batch{selectedBatchIds.length === 1 ? "" : "es"}
      </Button>
    </ActionRow>
  {/if}

  {#if model.recoveryReasons.length > 0}
    <Alert variant="warning" density="compact" shadow={false} testId={setupWorkspaceTestIds.initialParamsRecovery}>
      <p class="font-semibold text-text-primary">Initial-parameter recovery is active.</p>
      <ul class="mt-2 list-disc space-y-1 pl-5">
        {#each model.recoveryReasons as reason (reason)}
          <li>{reason}</li>
        {/each}
      </ul>
    </Alert>
  {/if}
  {/snippet}
</SetupSectionShell>
