<script lang="ts">
import {
  type ParameterWorkspaceItemView,
  type ParameterWorkspaceStatus,
} from "../../lib/stores/params";
import {
  getParameterWorkspaceViewStoreContext,
  getParamsStoreContext,
} from "../../app/shell/runtime-context";
import { parameterWorkspaceTestIds } from "./parameter-workspace-test-ids";
import ParameterWorkspaceSection from "./ParameterWorkspaceSection.svelte";

const store = getParamsStoreContext();
const view = getParameterWorkspaceViewStoreContext();

function stageItem(item: ParameterWorkspaceItemView, nextValue: number) {
  store.stageParameterEdit(item, nextValue);
}

function discardItem(name: string) {
  store.discardStagedEdit(name);
}

function envelopeKey() {
  const envelope = $view.activeEnvelope;
  if (!envelope) {
    return "no-scope";
  }

  return `${envelope.session_id}:${envelope.source_kind}:${envelope.seek_epoch}:${envelope.reset_revision}`;
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

let emptyState = $derived(emptyStateCopy($view.status));
let activeEnvelopeKey = $derived(envelopeKey());
</script>

<section
  class="rounded-lg border border-border bg-bg-primary p-3"
  data-domain-readiness={$view.readiness}
  data-workspace-state={$view.status}
  data-testid={parameterWorkspaceTestIds.root}
>
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">Parameter workspace</p>
      <h2 class="mt-1 text-base font-semibold text-text-primary">Common parameter settings</h2>
      <p class="mt-1 text-sm text-text-secondary">
        Stage and review a focused subset of commonly adjusted parameters for the current vehicle.
      </p>
    </div>

    <p
      class="inline-flex items-center rounded-md border border-border bg-bg-secondary px-2 py-1 text-xs font-semibold text-text-secondary"
      data-testid={parameterWorkspaceTestIds.state}
    >
      {statusBadgeText($view.status)}
    </p>
  </div>

  <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
    <p class="text-sm text-text-secondary">Changes are staged locally so you can review them before applying.</p>

    {#if $view.stagedCount > 0}
      <div class="flex flex-wrap items-center gap-2">
        <span
          class="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-accent"
          data-testid={parameterWorkspaceTestIds.pendingCount}
        >
          {$view.stagedCount} pending
        </span>
        <span class="text-xs text-text-muted" data-testid={parameterWorkspaceTestIds.pendingHint}>
          Review and clear staged edits in the change tray.
        </span>
      </div>
    {/if}
  </div>

  {#if emptyState}
    <div
      class="mt-4 rounded-lg border border-border bg-bg-secondary p-4"
      data-testid={parameterWorkspaceTestIds.empty}
    >
      <p class="text-sm font-semibold text-text-primary">{emptyState.title}</p>
      <p class="mt-2 text-sm text-text-secondary">{emptyState.description}</p>
    </div>
  {:else}
    <div class="mt-4 grid gap-4 xl:grid-cols-2">
      {#each $view.sections as section (`${section.id}:${activeEnvelopeKey}`)}
        <ParameterWorkspaceSection
          {section}
          envelopeKey={activeEnvelopeKey}
          onDiscard={discardItem}
          onStage={stageItem}
          readiness={$view.readiness}
        />
      {/each}
    </div>
  {/if}
</section>
