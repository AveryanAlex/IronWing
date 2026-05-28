<script lang="ts">
import { fromStore } from "svelte/store";

import {
  buildParameterExpertView,
  type ParameterExpertFilter,
  type ParameterExpertRow,
} from "../../../lib/params/parameter-expert-view";
import {
  createParameterFileIo,
  type ParameterFileImportRow,
  type ParameterFileIo,
} from "../../../lib/params/parameter-file-io";
import {
  buildParameterWorkflowSections,
  type BatteryWorkflowInputs,
  type FlightWorkflowInputs,
  type ParameterWorkflowCardId,
  validateBatteryWorkflowInputs,
  validateFlightWorkflowInputs,
} from "../../../lib/params/parameter-workflows";
import type { ParameterWorkspaceStatus } from "../../../lib/stores/params";
import {
  getParameterWorkspaceViewStoreContext,
  getParamsStoreContext,
} from "../../../app/shell/runtime-context";
import { Alert, Badge, Button, Card, EmptyState, Eyebrow, FactTile, HelperText, WorkspaceHeader, WorkspaceShell } from "../../../components/ui";
import ParameterExpertBrowser from "./ParameterExpertBrowser.svelte";
import ParameterExpertFileActions from "./ParameterExpertFileActions.svelte";
import ParameterWorkflowSection from "./ParameterWorkflowSection.svelte";
import { parameterWorkspaceTestIds } from "../parameter-workspace-test-ids";
import { REPLAY_READONLY_COPY, REPLAY_READONLY_TITLE, isReplayReadonly } from "../../../lib/replay-readonly";

type ExpertHighlightRequest = {
	sourceLabel: string;
	targetNames: string[];
};

type ResolvedBatteryWorkflowInputs = {
	cellCount: number;
	chemistryIndex: number;
};

type ResolvedFlightWorkflowInputs = {
	propInches: number;
};

let {
  fileIo = createParameterFileIo(),
  defaultMode = "workflow",
  embedded = false,
  onReviewStaged,
}: {
  fileIo?: ParameterFileIo;
  defaultMode?: "workflow" | "expert";
  embedded?: boolean;
  onReviewStaged?: () => void;
} = $props();

const store = getParamsStoreContext();
const paramsState = fromStore(store);
const parameterViewStore = fromStore(getParameterWorkspaceViewStoreContext());

let showAdvancedOverride = $state(false);
let batteryCellCountInput = $state("4");
let batteryChemistryIndex = $state(0);
let flightPropSizeInput = $state("9");
let expertSearchText = $state("");
let expertFilter = $state<ParameterExpertFilter>("standard");
let expertHighlightRequest = $state<ExpertHighlightRequest | null>(null);
let lastValidBatteryInputs = $state<ResolvedBatteryWorkflowInputs>({
	cellCount: 4,
	chemistryIndex: 0,
});
let lastValidFlightInputs = $state<ResolvedFlightWorkflowInputs>({
	propInches: 9,
});

let params = $derived(paramsState.current);
let view = $derived(parameterViewStore.current);
let emptyState = $derived(emptyStateCopy(view.status));
let activeEnvelopeKey = $derived(envelopeKey(view.activeEnvelope));
let batteryCellCount = $derived(parseWholeNumber(batteryCellCountInput));
let batteryValidation = $derived(
  validateBatteryWorkflowInputs({
    cellCount: batteryCellCount,
    chemistryIndex: batteryChemistryIndex,
  }),
);
let effectiveBatteryInputs: ResolvedBatteryWorkflowInputs = $derived(
	batteryValidation.valid && batteryCellCount !== null
		? { cellCount: batteryCellCount, chemistryIndex: batteryChemistryIndex }
		: lastValidBatteryInputs,
);
let flightPropSize = $derived(parsePositiveNumber(flightPropSizeInput));
let flightValidation = $derived(
  validateFlightWorkflowInputs({
    propInches: flightPropSize,
  }),
);
let effectiveFlightInputs: ResolvedFlightWorkflowInputs = $derived(
	flightValidation.valid && flightPropSize !== null
		? { propInches: flightPropSize }
		: lastValidFlightInputs,
);
let workflowSections = $derived.by(() =>
  buildParameterWorkflowSections({
    paramStore: params.paramStore,
    metadata: params.metadata,
    metadataState: params.metadataState,
    stagedEdits: params.stagedEdits,
    batteryInputs: effectiveBatteryInputs,
    flightInputs: effectiveFlightInputs,
  }),
);
let expertView = $derived.by(() =>
  buildParameterExpertView({
    paramStore: params.paramStore,
    metadata: params.metadata,
    stagedEdits: params.stagedEdits,
    retainedFailures: params.retainedFailures,
    filter: expertFilter,
    searchText: expertSearchText,
    highlightTargets: expertHighlightRequest?.targetNames ?? [],
  }),
);
let advancedAvailable = $derived(expertView.totalCount > 0);
let expertHighlightSourceLabel = $derived(expertHighlightRequest?.sourceLabel ?? null);
let replayReadonly = $derived(isReplayReadonly(view.activeEnvelope?.source_kind ?? null));
let expertDefaultMode = $derived(defaultMode === "expert");
let showAdvanced = $derived(expertDefaultMode || showAdvancedOverride);

function stageItem(row: ParameterExpertRow, nextValue: number) {
  store.stageParameterEdit(row, nextValue);
}

function discardItem(name: string) {
  store.discardStagedEdit(name);
}

function stageImportedRows(rows: ParameterFileImportRow[]) {
  for (const row of rows) {
    store.stageParameterEdit(row.item, row.nextValue);
  }
}

function stageWorkflowCard(cardId: ParameterWorkflowCardId) {
  const card = workflowSections.flatMap((section) => section.cards).find((entry) => entry.id === cardId);
  if (!card || card.status !== "ready") {
    return;
  }

  for (const recommendation of card.recommendations) {
    if (!recommendation.changed || recommendation.isQueued) {
      continue;
    }

    store.stageParameterEdit(recommendation.item, recommendation.proposedValue);
  }
}

function openAdvanced(options: ExpertHighlightRequest | null = null) {
  showAdvancedOverride = true;
  if (!options || options.targetNames.length === 0) {
    expertHighlightRequest = null;
    return;
  }

  expertHighlightRequest = {
    sourceLabel: options.sourceLabel,
    targetNames: options.targetNames.filter((name) => name.trim().length > 0),
  };
}

function openWorkflowAdvanced(cardId: ParameterWorkflowCardId) {
  const card = workflowSections.flatMap((section) => section.cards).find((entry) => entry.id === cardId);
  if (!card) {
    openAdvanced();
    return;
  }

  openAdvanced({
    sourceLabel: card.title,
    targetNames: card.targetNames,
  });
}

function closeAdvanced() {
  if (expertDefaultMode) {
    return;
  }

  showAdvancedOverride = false;
  expertHighlightRequest = null;
}

function updateBatteryCellCountInput(value: string) {
  batteryCellCountInput = value;
  const parsed = parseWholeNumber(value);
  const nextValidation = validateBatteryWorkflowInputs({
    cellCount: parsed,
    chemistryIndex: batteryChemistryIndex,
  });
  if (nextValidation.valid && parsed !== null) {
    lastValidBatteryInputs = {
      cellCount: parsed,
      chemistryIndex: batteryChemistryIndex,
    };
  }
}

function updateBatteryChemistryIndex(value: number) {
  batteryChemistryIndex = value;
  const parsed = parseWholeNumber(batteryCellCountInput);
  const nextValidation = validateBatteryWorkflowInputs({
    cellCount: parsed,
    chemistryIndex: value,
  });
  if (nextValidation.valid && parsed !== null) {
    lastValidBatteryInputs = {
      cellCount: parsed,
      chemistryIndex: value,
    };
  }
}

function updateFlightPropSizeInput(value: string) {
  flightPropSizeInput = value;
  const parsed = parsePositiveNumber(value);
  const nextValidation = validateFlightWorkflowInputs({
    propInches: parsed,
  });
  if (nextValidation.valid && parsed !== null) {
    lastValidFlightInputs = {
      propInches: parsed,
    };
  }
}

function envelopeKey(activeEnvelope: typeof view.activeEnvelope) {
  if (!activeEnvelope) {
    return "no-scope";
  }

  return `${activeEnvelope.session_id}:${activeEnvelope.source_kind}:${activeEnvelope.seek_epoch}:${activeEnvelope.reset_revision}`;
}

function statusBadgeText(status: ParameterWorkspaceStatus) {
  switch (status) {
    case "ready":
      return "Settings ready";
    case "bootstrapping":
      return "Loading settings";
    case "unavailable":
      return "Connect to load";
    case "empty":
    default:
      return "Waiting for settings";
  }
}

function emptyStateCopy(status: ParameterWorkspaceStatus) {
  switch (status) {
    case "bootstrapping":
      return {
        title: "Loading parameter data",
        description:
          "Stay connected while parameter values are loaded from the vehicle.",
      };
    case "unavailable":
      return {
        title: "No parameter data available",
        description:
          "Connect to a vehicle to load parameters.",
      };
    case "empty":
      return {
        title: "No parameters reported",
        description:
          "The vehicle is connected but has not reported any parameter values yet.",
      };
    case "ready":
    default:
      return null;
  }
}

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
  return Number.isFinite(parsed) ? parsed : null;
}
</script>

{#snippet workspaceContent()}
<section
  class="rounded-lg border border-border bg-bg-primary p-3"
  data-domain-readiness={view.readiness}
  data-workspace-state={view.status}
  data-testid={parameterWorkspaceTestIds.root}
>
  <WorkspaceHeader
    description={expertDefaultMode
      ? "Browse searchable raw parameters first, then use the guided helpers below when you want scoped recommendations."
      : "Start with a few guided operational changes, then open Advanced parameters for searchable raw edits, grouped browsing, and the same shared review tray."}
    eyebrow="Parameter workspace"
    title={expertDefaultMode ? "Parameters" : "Parameters"}
  >
    {#snippet status()}
      <Badge case="normal" shape="rounded" size="sm" testId={parameterWorkspaceTestIds.state} variant="muted">
        {statusBadgeText(view.status)}
      </Badge>
    {/snippet}
    {#snippet actions()}
      {#if onReviewStaged}
        <Button
          disabled={view.stagedCount === 0}
          onclick={onReviewStaged}
          tone="accent"
        >
          Review staged ({view.stagedCount})
        </Button>
      {/if}
    {/snippet}
  </WorkspaceHeader>

  <div class="mt-4 grid gap-2 md:grid-cols-3">
    <FactTile label="Scope" value={view.activeEnvelopeText} mono={false} testId={parameterWorkspaceTestIds.scope} />
    <FactTile label="Progress" value={view.progressText} mono={false} testId={parameterWorkspaceTestIds.progress} />
    <FactTile label="Metadata" value={view.metadataText} mono={false} testId={parameterWorkspaceTestIds.metadata} />
  </div>

  {#if replayReadonly}
    <Alert class="mt-4" description={REPLAY_READONLY_COPY} testId="parameter-replay-readonly-banner" title={REPLAY_READONLY_TITLE} variant="warning" />
  {/if}

  {#if view.noticeText}
    <Alert class="mt-4" description={view.noticeText} testId={parameterWorkspaceTestIds.notice} variant="warning" />
  {/if}

  <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
    <HelperText>
      Queue guided recommendations or raw edits here, then review and apply everything from the shared tray.
    </HelperText>

    <div class="flex flex-wrap items-center gap-2">
      <Eyebrow as="span" testId={parameterWorkspaceTestIds.advancedState}>
        {showAdvanced ? "advanced" : "workflow"}
      </Eyebrow>
      {#if view.stagedCount > 0}
        <Badge size="lg" testId={parameterWorkspaceTestIds.pendingCount} variant="accent">
          {view.stagedCount} pending
        </Badge>
        <HelperText as="span" size="xs" testId={parameterWorkspaceTestIds.pendingHint}>
          Review and apply staged edits in the change tray.
        </HelperText>
      {/if}
    </div>
  </div>

  {#snippet workflowHelpers()}
    <div class="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div class="space-y-4">
        {#if emptyState}
          <EmptyState description={emptyState.description} title={emptyState.title} testId={parameterWorkspaceTestIds.empty} />
        {:else}
          {#each workflowSections as section (section.id)}
            <ParameterWorkflowSection
              batteryControls={{
                cellCountInput: batteryCellCountInput,
                chemistryIndex: batteryChemistryIndex,
                validationMessage: batteryValidation.message,
                onCellCountInput: updateBatteryCellCountInput,
                onChemistryChange: updateBatteryChemistryIndex,
              }}
              flightControls={{
                propInchesInput: flightPropSizeInput,
                validationMessage: flightValidation.message,
                onPropInchesInput: updateFlightPropSizeInput,
              }}
              onOpenAdvanced={openWorkflowAdvanced}
              {replayReadonly}
              onStage={stageWorkflowCard}
              {section}
            />
          {/each}
        {/if}
      </div>

      {#if !expertDefaultMode}
        <Card.Root
          as="aside"
          density="compact"
          surface="secondary"
          testId={parameterWorkspaceTestIds.advancedEntry}
        >
          <Eyebrow>Advanced parameters</Eyebrow>
          <h3 class="mt-2 text-lg font-semibold text-text-primary">Open the full raw parameter browser</h3>
          <HelperText class="mt-2">
            Open the searchable raw list when you need direct control, need to inspect settings a guided card does not cover, or need to work around missing metadata.
          </HelperText>
          <Button
            class="mt-4 w-full"
            testId={parameterWorkspaceTestIds.advancedButton}
            disabled={!advancedAvailable || replayReadonly}
            onclick={() => openAdvanced()}
            variant="outline"
          >
            {advancedAvailable ? "Open Advanced parameters" : "Advanced parameters unavailable"}
          </Button>
        </Card.Root>
      {/if}
    </div>
  {/snippet}

  {#if showAdvanced}
    <Card.Root
      class="mt-4"
      density="compact"
      surface="secondary"
      testId={parameterWorkspaceTestIds.advancedPanel}
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Eyebrow>Advanced parameters</Eyebrow>
          <h3 class="mt-2 text-lg font-semibold text-text-primary">
            {expertDefaultMode ? "Raw browser" : "Raw parameter browser"}
          </h3>
          <HelperText class="mt-2">
            {expertDefaultMode
              ? "Search, filter, and stage raw parameters here. Guided helpers stay below when you want quicker starting points."
              : "Search, filter, and stage raw parameters here when the guided sections do not fit this vehicle or cannot show the setting you need."}
          </HelperText>
        </div>
        {#if !expertDefaultMode}
          <Button
            testId={parameterWorkspaceTestIds.advancedBackButton}
            onclick={closeAdvanced}
            variant="outline"
          >
            Back to workflows
          </Button>
        {/if}
      </div>

      <div class="mt-4">
        <ParameterExpertFileActions
          fileIo={fileIo}
          metadata={params.metadata}
          onStageImportedRows={stageImportedRows}
          paramStore={params.paramStore}
          {replayReadonly}
        />
      </div>

      <div class="mt-4">
        <ParameterExpertBrowser
          envelopeKey={activeEnvelopeKey}
          filter={expertFilter}
          highlightSourceLabel={expertHighlightSourceLabel}
          onDiscard={discardItem}
          onFilterChange={(nextFilter) => {
            expertFilter = nextFilter;
          }}
          onSearchText={(nextSearchText) => {
            expertSearchText = nextSearchText;
          }}
          onStage={stageItem}
          {replayReadonly}
          readiness={view.readiness}
          searchText={expertSearchText}
          view={expertView}
        />
      </div>
    </Card.Root>

    {#if expertDefaultMode}
      <section class="mt-4 space-y-3">
        <Card.Root density="compact" surface="secondary">
          Guided helpers stay available below and stage through the same shared review tray.
        </Card.Root>
        {@render workflowHelpers()}
      </section>
    {/if}
  {:else}
    {@render workflowHelpers()}
  {/if}
</section>
{/snippet}

{#if embedded}
  {@render workspaceContent()}
{:else}
  <WorkspaceShell mode="inset">
    {@render workspaceContent()}
  </WorkspaceShell>
{/if}
