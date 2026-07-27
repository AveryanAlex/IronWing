<script lang="ts">
import { untrack } from "svelte";
import { fromStore } from "svelte/store";

import {
  buildParameterCatalogView,
  type ParameterCatalogFilter,
  type ParameterCatalogItem,
} from "../../../lib/params/parameter-catalog-view";
import type { ParameterWorkspaceStatus } from "../../../lib/stores/params";
import {
  getParameterWorkspaceViewStoreContext,
  getParamsStoreContext,
} from "../../../app/shell/runtime-context";
import { Badge, EmptyState, FactTile, HelperText, StatusPill } from "../../../components/ui";
import ParameterCatalogBrowser from "./ParameterCatalogBrowser.svelte";
import { parameterWorkspaceTestIds } from "../parameter-workspace-test-ids";
import { isReplayReadonly } from "../../../lib/replay-readonly";

let {
  initialSearchText = "",
  initialFilter = "all",
}: {
  initialSearchText?: string;
  initialFilter?: ParameterCatalogFilter;
} = $props();

const store = getParamsStoreContext();
const paramsState = fromStore(store);
const parameterViewStore = fromStore(getParameterWorkspaceViewStoreContext());

let searchText = $state(untrack(() => initialSearchText));
let filter = $state<ParameterCatalogFilter>(untrack(() => initialFilter));

let params = $derived(paramsState.current);
let view = $derived(parameterViewStore.current);
let emptyState = $derived(emptyStateCopy(view.status));
let replayReadonly = $derived(isReplayReadonly(view.activeEnvelope?.source_kind ?? null));
let catalogView = $derived.by(() =>
  buildParameterCatalogView({
    paramStore: params.paramStore,
    metadata: params.metadata,
    stagedEdits: params.stagedEdits,
    retainedFailures: params.retainedFailures,
    filter,
    searchText,
  }),
);

function stageItem(row: ParameterCatalogItem, nextValue: number) {
  store.stageParameterEdit(row, nextValue);
}

function discardItem(name: string) {
  store.discardStagedEdit(name);
}

function statusBadgeText(status: ParameterWorkspaceStatus) {
  switch (status) {
    case "ready":
      return "Parameters ready";
    case "bootstrapping":
      return "Loading parameters";
    case "unavailable":
      return "Connect to load";
    case "empty":
    default:
      return "Waiting for parameters";
  }
}

function emptyStateCopy(status: ParameterWorkspaceStatus) {
  switch (status) {
    case "bootstrapping":
      return {
        title: "Loading parameter data",
        description: "Stay connected while parameter values are loaded from the vehicle.",
      };
    case "unavailable":
      return {
        title: "No parameter data available",
        description: "Connect to a vehicle to load parameters.",
      };
    case "empty":
      return {
        title: "No parameters reported",
        description: "The vehicle is connected but has not reported any parameter values yet.",
      };
    case "ready":
    default:
      return null;
  }
}
</script>

<section
  class="space-y-4"
  data-domain-readiness={view.readiness}
  data-workspace-state={view.status}
  data-testid={parameterWorkspaceTestIds.root}
>
  <div class="flex flex-wrap items-center justify-between gap-3">
    <HelperText>
      Browse every reported parameter by prefix. Changes stay local until you review and apply them from the shared tray.
    </HelperText>

    <div class="flex flex-wrap items-center gap-2">
      <Badge case="normal" shape="rounded" size="sm" testId={parameterWorkspaceTestIds.state} variant="muted">
        {statusBadgeText(view.status)}
      </Badge>
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

  <div class="grid gap-2 md:grid-cols-3">
    <FactTile label="Scope" value={view.activeEnvelopeText} mono={false} testId={parameterWorkspaceTestIds.scope} />
    <FactTile label="Progress" value={view.progressText} mono={false} testId={parameterWorkspaceTestIds.progress} />
    <FactTile label="Metadata" value={view.metadataText} mono={false} testId={parameterWorkspaceTestIds.metadata} />
  </div>

  <div
    aria-live="polite"
    class="flex h-9 min-w-0 items-center gap-2 overflow-hidden rounded-md border border-border/70 bg-bg-secondary/70 px-3 text-xs"
    role="status"
    title={view.noticeText ?? "No active parameter notices"}
  >
    <StatusPill tone={view.noticeText ? "warning" : "neutral"}>
      {view.noticeText ? "attention" : "ready"}
    </StatusPill>
    {#if view.noticeText}
      <span class="truncate text-warning" data-testid={parameterWorkspaceTestIds.notice}>{view.noticeText}</span>
    {:else}
      <span class="truncate text-text-muted">No active parameter notices</span>
    {/if}
  </div>

  {#if emptyState}
    <EmptyState description={emptyState.description} title={emptyState.title} testId={parameterWorkspaceTestIds.empty} />
  {:else}
    <ParameterCatalogBrowser
      {filter}
      onDiscard={discardItem}
      onFilterChange={(nextFilter) => {
        filter = nextFilter;
      }}
      onSearchText={(nextSearchText) => {
        searchText = nextSearchText;
      }}
      onStage={stageItem}
      {replayReadonly}
      readiness={view.readiness}
      {searchText}
      view={catalogView}
    />
  {/if}
</section>
