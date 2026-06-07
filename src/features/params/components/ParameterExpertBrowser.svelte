<script lang="ts">
import { ChevronDown, ChevronRight, Search } from "lucide-svelte";

import type {
  ParameterExpertFilter,
  ParameterExpertGroup,
  ParameterExpertRow,
  ParameterExpertView,
} from "../../../lib/params/parameter-expert-view";
import { Alert, Badge, Button, Card, EmptyState, Eyebrow, Input } from "../../../components/ui";
import { parameterWorkspaceTestIds } from "../parameter-workspace-test-ids";
import ParameterExpertRowComponent from "./ParameterExpertRow.svelte";

let {
  view,
  readiness,
  envelopeKey,
  searchText,
  filter,
  highlightSourceLabel = null,
  replayReadonly = false,
  onSearchText,
  onFilterChange,
  onStage,
  onDiscard,
}: {
  view: ParameterExpertView;
  readiness: "ready" | "bootstrapping" | "unavailable" | "degraded";
  envelopeKey: string;
  searchText: string;
  filter: ParameterExpertFilter;
  highlightSourceLabel?: string | null;
  replayReadonly?: boolean;
  onSearchText: (value: string) => void;
  onFilterChange: (value: ParameterExpertFilter) => void;
  onStage: (row: ParameterExpertRow, nextValue: number) => void;
  onDiscard: (name: string) => void;
} = $props();

let expandedGroupIds = $state<string[]>([]);

const filterOptions: Array<{ value: ParameterExpertFilter; label: string }> = [
  { value: "standard", label: "Standard" },
  { value: "all", label: "All" },
  { value: "modified", label: "Modified" },
];

function summaryText() {
  if (view.totalCount === 0) {
    return "No raw parameters are available for this session yet.";
  }

  const staged = view.stagedCount > 0 ? ` · ${view.stagedCount} staged` : "";
  return `Showing ${view.visibleCount} of ${view.totalCount} parameters${staged}.`;
}

function highlightSummaryText() {
  if (view.highlightedCount === 0) {
    return null;
  }

  const source = highlightSourceLabel ?? "Selected section";
  const forced = view.forcedHighlightCount > 0
    ? ` ${view.forcedHighlightCount} highlighted row${view.forcedHighlightCount === 1 ? " stays" : "s stay"} visible outside the current filter.`
    : "";
  return `${source} highlighting ${view.highlightedCount} parameter${view.highlightedCount === 1 ? "" : "s"} for review.${forced}`;
}

function shouldForceExpanded(group: ParameterExpertGroup) {
  return searchText.trim().length > 0
    || filter === "modified"
    || group.rows.some((row) => row.isHighlighted || row.isStaged || row.failureMessage !== null);
}

function isGroupExpanded(group: ParameterExpertGroup) {
  return expandedGroupIds.includes(group.key) || shouldForceExpanded(group);
}

function toggleGroup(group: ParameterExpertGroup) {
  if (shouldForceExpanded(group)) {
    return;
  }

  if (expandedGroupIds.includes(group.key)) {
    expandedGroupIds = expandedGroupIds.filter((key) => key !== group.key);
  } else {
    expandedGroupIds = [...expandedGroupIds, group.key];
  }
}
</script>

<div class="space-y-4" data-testid={parameterWorkspaceTestIds.expertRoot}>
  <div class="flex flex-wrap items-stretch gap-3 sm:items-center">
    <div class="flex flex-wrap items-center gap-2">
      {#each filterOptions as option (option.value)}
        <Button
          shape="pill"
          testId={`${parameterWorkspaceTestIds.expertFilterPrefix}-${option.value}`}
          disabled={replayReadonly}
          onclick={() => onFilterChange(option.value)}
          size="sm"
          tone="accent"
          variant={filter === option.value ? "soft" : "ghost"}
        >
          {option.label}
          {#if option.value === "modified" && view.stagedCount > 0}
            <span class="ml-1">({view.stagedCount})</span>
          {/if}
        </Button>
      {/each}
    </div>

    <label class="flex min-w-0 basis-full items-center gap-2 sm:ml-auto sm:max-w-sm sm:flex-1">
      <Search aria-hidden="true" class="shrink-0 text-text-muted" size={14} />
      <span class="sr-only">Search raw parameters</span>
      <Input
        class="min-w-0"
        testId={parameterWorkspaceTestIds.expertSearch}
        disabled={replayReadonly}
        oninput={(event) => onSearchText((event.currentTarget as HTMLInputElement).value)}
        placeholder="Search parameters..."
        type="search"
        value={searchText}
      />
    </label>
  </div>

  <Alert density="compact" description={summaryText()} testId={parameterWorkspaceTestIds.expertSummary} variant="info" />

  {#if !view.metadataAvailable}
    <Alert
      density="compact"
      description="Metadata is unavailable, so this browser is falling back to raw parameter names and numeric editors."
      testId={parameterWorkspaceTestIds.expertMetadataFallback}
      variant="warning"
    />
  {/if}

  {#if highlightSummaryText()}
    <Alert density="compact" description={highlightSummaryText() ?? undefined} testId={parameterWorkspaceTestIds.expertHighlightSummary} variant="info" />
  {/if}

  {#if view.missingHighlightTargets.length > 0}
    <Alert
      density="compact"
      description={`${view.missingHighlightTargets.length} highlight target${view.missingHighlightTargets.length === 1 ? " was" : "s were"} not present in the current parameter snapshot: ${view.missingHighlightTargets.join(", ")}.`}
      testId={parameterWorkspaceTestIds.expertHighlightMissing}
      variant="warning"
    />
  {/if}

  {#if view.hiddenStagedRows.length > 0}
    <Alert
      density="compact"
      description={`${view.hiddenStagedRows.length} staged row${view.hiddenStagedRows.length === 1 ? " is" : "s are"} outside the current search or filter: ${view.hiddenStagedRows.map((row) => row.name).join(", ")}.`}
      testId={parameterWorkspaceTestIds.expertHiddenStaged}
      variant="warning"
    />
  {/if}

  {#if view.groups.length === 0}
    <EmptyState
      description="Adjust the search text or filter chips to widen the raw parameter browser."
      title="No parameters match"
      testId={parameterWorkspaceTestIds.expertNoMatches}
    />
  {:else}
    <div class="space-y-2">
      {#each view.groups as group (group.key)}
        <Card.Root as="section" class="overflow-hidden" density="compact" padding="none" surface="transparent">
          <Button
            aria-expanded={isGroupExpanded(group)}
            class="h-auto w-full justify-start rounded-none px-3 py-2 text-left hover:bg-bg-tertiary/50"
            testId={`${parameterWorkspaceTestIds.expertGroupPrefix}-${group.key}`}
            onclick={() => toggleGroup(group)}
            variant="bare"
          >
            {#if isGroupExpanded(group)}
              <ChevronDown aria-hidden="true" class="shrink-0 text-text-muted" size={14} />
            {:else}
              <ChevronRight aria-hidden="true" class="shrink-0 text-text-muted" size={14} />
            {/if}
            <Eyebrow as="span" class="text-base" tone="primary">{group.label}</Eyebrow>
            <span class="text-sm text-text-muted">({group.rows.length})</span>
            {#if group.rows.some((row) => row.isStaged || row.failureMessage !== null)}
              <Badge shape="rounded" size="sm" variant="warning">
                {group.rows.filter((row) => row.isStaged || row.failureMessage !== null).length} modified
              </Badge>
            {/if}
          </Button>

          {#if isGroupExpanded(group)}
            <div class="border-t border-border px-3 py-3">
              <div class="param-table">
                <div class="param-table__header" aria-hidden="true">
                  <span>Name</span>
                  <span>Label</span>
                  <span>Value</span>
                  <span>Editor</span>
                </div>
                <div class="param-table__body">
                  {#each group.rows as row (row.renderId)}
                    <ParameterExpertRowComponent
                      {envelopeKey}
                      onDiscard={onDiscard}
                      onStage={onStage}
                      {replayReadonly}
                      {readiness}
                      {row}
                    />
                  {/each}
                </div>
              </div>
            </div>
          {/if}
        </Card.Root>
      {/each}
    </div>
  {/if}
</div>

<style>
.param-table {
  display: flex;
  flex-direction: column;
}
.param-table__header {
  position: sticky;
  top: 0;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(120px, 200px) minmax(0, 1fr) minmax(80px, 140px) minmax(180px, 260px);
  align-items: center;
  gap: var(--space-2);
  padding: 6px var(--space-2);
  background: color-mix(in srgb, var(--color-bg-secondary) 80%, transparent);
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text-muted);
  font-size: 0.66rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.param-table__body {
  display: flex;
  flex-direction: column;
}
@media (max-width: 767px) {
  .param-table__header { display: none; }
}
</style>
