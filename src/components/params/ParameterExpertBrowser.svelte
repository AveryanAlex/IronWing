<script lang="ts">
import type {
  ParameterExpertFilter,
  ParameterExpertRow,
  ParameterExpertView,
} from "../../lib/params/parameter-expert-view";
import { parameterWorkspaceTestIds } from "./parameter-workspace-test-ids";
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
</script>

<div class="space-y-4" data-testid={parameterWorkspaceTestIds.expertRoot}>
  <div class="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
    <label class="block">
      <span class="text-xs font-semibold uppercase tracking-wide text-text-muted">Search raw parameters</span>
        <input
          class="mt-2 w-full rounded-lg border border-border bg-bg-primary/80 px-3 py-2 text-sm text-text-primary outline-none transition placeholder:text-text-muted focus:border-accent"
          data-testid={parameterWorkspaceTestIds.expertSearch}
          disabled={replayReadonly}
          oninput={(event) => onSearchText((event.currentTarget as HTMLInputElement).value)}
        placeholder="Search by raw name, label, or description"
        type="search"
        value={searchText}
      />
    </label>

    <div class="flex flex-wrap items-center gap-2">
      {#each filterOptions as option (option.value)}
        <button
          class={`rounded-md border px-3 py-2 text-sm font-semibold transition ${filter === option.value ? "border-accent/30 bg-accent/10 text-accent" : "border-border bg-bg-primary/80 text-text-secondary hover:border-accent hover:text-accent"}`}
          data-testid={`${parameterWorkspaceTestIds.expertFilterPrefix}-${option.value}`}
          disabled={replayReadonly}
          onclick={() => onFilterChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      {/each}
    </div>
  </div>

  <div
    class="rounded-lg border border-border bg-bg-primary/70 px-3 py-3 text-sm text-text-secondary"
    data-testid={parameterWorkspaceTestIds.expertSummary}
  >
    {summaryText()}
  </div>

  {#if !view.metadataAvailable}
    <div
      class="rounded-lg border border-warning/30 bg-warning/10 px-3 py-3 text-sm text-warning"
      data-testid={parameterWorkspaceTestIds.expertMetadataFallback}
    >
      Metadata is unavailable, so this browser is falling back to raw parameter names and numeric editors.
    </div>
  {/if}

  {#if highlightSummaryText()}
    <div
      class="rounded-lg border border-accent/30 bg-accent/10 px-3 py-3 text-sm text-accent"
      data-testid={parameterWorkspaceTestIds.expertHighlightSummary}
    >
      {highlightSummaryText()}
    </div>
  {/if}

  {#if view.missingHighlightTargets.length > 0}
    <div
      class="rounded-lg border border-warning/30 bg-warning/10 px-3 py-3 text-sm text-warning"
      data-testid={parameterWorkspaceTestIds.expertHighlightMissing}
    >
      {view.missingHighlightTargets.length} highlight target{view.missingHighlightTargets.length === 1 ? " was" : "s were"} not present in the current parameter snapshot: {view.missingHighlightTargets.join(", ")}.
    </div>
  {/if}

  {#if view.hiddenStagedRows.length > 0}
    <div
      class="rounded-lg border border-warning/30 bg-warning/10 px-3 py-3 text-sm text-warning"
      data-testid={parameterWorkspaceTestIds.expertHiddenStaged}
    >
      {view.hiddenStagedRows.length} staged row{view.hiddenStagedRows.length === 1 ? " is" : "s are"} outside the current search or filter: {view.hiddenStagedRows.map((row) => row.name).join(", ")}.
    </div>
  {/if}

  {#if view.groups.length === 0}
    <div
      class="rounded-lg border border-border bg-bg-primary/70 px-3 py-4 text-sm text-text-secondary"
      data-testid={parameterWorkspaceTestIds.expertNoMatches}
    >
      No parameters match the current expert search and filter state.
    </div>
  {:else}
    <div class="space-y-4">
      {#each view.groups as group (group.key)}
        <section
          class="rounded-lg border border-border bg-bg-primary/55 p-3"
          data-testid={`${parameterWorkspaceTestIds.expertGroupPrefix}-${group.key}`}
        >
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">Parameter prefix</p>
              <h4 class="mt-2 text-lg font-semibold text-text-primary">{group.label}</h4>
            </div>
            <span class="rounded-full border border-border bg-bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-wide text-text-secondary">
              {group.rows.length} row{group.rows.length === 1 ? "" : "s"}
            </span>
          </div>

          <div class="param-table mt-4">
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
        </section>
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
