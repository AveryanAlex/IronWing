<script lang="ts">
import { ChevronDown, ChevronRight, Search, X } from "lucide-svelte";

import type {
  ParameterCatalogFilter,
  ParameterCatalogGroup,
  ParameterCatalogItem,
  ParameterCatalogView,
} from "../../../lib/params/parameter-catalog-view";
import { Alert, Badge, Button, Card, EmptyState, Eyebrow, Input } from "../../../components/ui";
import { SetupParamEditCard, SetupParamEditGrid } from "../../setup/shared";
import { parameterWorkspaceTestIds } from "../parameter-workspace-test-ids";

let {
  view,
  readiness,
  searchText,
  filter,
  replayReadonly = false,
  onSearchText,
  onFilterChange,
  onStage,
  onDiscard,
}: {
  view: ParameterCatalogView;
  readiness: "ready" | "bootstrapping" | "unavailable" | "degraded";
  searchText: string;
  filter: ParameterCatalogFilter;
  replayReadonly?: boolean;
  onSearchText: (value: string) => void;
  onFilterChange: (value: ParameterCatalogFilter) => void;
  onStage: (row: ParameterCatalogItem, nextValue: number) => void;
  onDiscard: (name: string) => void;
} = $props();

let expandedGroupIds = $state<string[]>([]);

const filterOptions: Array<{ value: ParameterCatalogFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "standard", label: "Standard" },
  { value: "modified", label: "Modified" },
];

function summaryText() {
  if (view.totalCount === 0) {
    return "No parameters are available for this session yet.";
  }

  const staged = view.stagedCount > 0 ? ` · ${view.stagedCount} staged` : "";
  return `Showing ${view.visibleCount} of ${view.totalCount} parameters${staged}.`;
}

function shouldForceExpanded(group: ParameterCatalogGroup) {
  return searchText.trim().length > 0
    || filter === "modified"
    || group.rows.some((row) => row.isStaged || row.hasFailure);
}

function isGroupExpanded(group: ParameterCatalogGroup) {
  return expandedGroupIds.includes(group.key) || shouldForceExpanded(group);
}

function toggleGroup(group: ParameterCatalogGroup) {
  if (shouldForceExpanded(group)) {
    return;
  }

  if (expandedGroupIds.includes(group.key)) {
    expandedGroupIds = expandedGroupIds.filter((key) => key !== group.key);
  } else {
    expandedGroupIds = [...expandedGroupIds, group.key];
  }
}

function cardValue(row: ParameterCatalogItem) {
  return row.stagedValue ?? row.value;
}

function stageCardValue(row: ParameterCatalogItem, value: string | number | boolean) {
  const nextValue =
    typeof value === "boolean"
      ? value
        ? (row.booleanOptions?.on.code ?? 1)
        : (row.booleanOptions?.off.code ?? 0)
      : Number(value);

  if (
    !Number.isFinite(nextValue) ||
    (row.editorKind === "bitmask" && (!Number.isInteger(nextValue) || nextValue < 0))
  ) {
    return;
  }

  onStage(row, nextValue);
}
</script>

<div class="space-y-4" data-testid={parameterWorkspaceTestIds.catalogRoot}>
  <div class="flex flex-wrap items-stretch gap-3 sm:items-center">
    <div class="flex flex-wrap items-center gap-2">
      {#each filterOptions as option (option.value)}
        <Button
          shape="pill"
          testId={`${parameterWorkspaceTestIds.catalogFilterPrefix}-${option.value}`}
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

    <div class="flex min-w-0 basis-full items-center gap-2 sm:ml-auto sm:max-w-md sm:flex-1">
      <label class="flex min-w-0 flex-1 items-center gap-2">
        <Search aria-hidden="true" class="shrink-0 text-text-muted" size={14} />
        <span class="sr-only">Search parameters</span>
        <Input
          class="min-w-0"
          testId={parameterWorkspaceTestIds.catalogSearch}
          oninput={(event) => onSearchText((event.currentTarget as HTMLInputElement).value)}
          placeholder="Search names, labels, descriptions..."
          type="search"
          value={searchText}
        />
      </label>
      {#if searchText.length > 0}
        <Button
          ariaLabel="Clear parameter search"
          onclick={() => onSearchText("")}
          size="sm"
          variant="ghost"
        >
          <X aria-hidden="true" size={14} />
          Clear
        </Button>
      {/if}
    </div>
  </div>

  <Alert density="compact" description={summaryText()} testId={parameterWorkspaceTestIds.catalogSummary} variant="info" />

  {#if !view.metadataAvailable}
    <Alert
      density="compact"
      description="Metadata is unavailable, so this catalog is falling back to raw parameter names and numeric editors."
      testId={parameterWorkspaceTestIds.catalogMetadataFallback}
      variant="warning"
    />
  {/if}

  {#if view.hiddenStagedRows.length > 0}
    <Alert
      density="compact"
      description={`${view.hiddenStagedRows.length} staged row${view.hiddenStagedRows.length === 1 ? " is" : "s are"} outside the current search or filter: ${view.hiddenStagedRows.map((row) => row.name).join(", ")}.`}
      testId={parameterWorkspaceTestIds.catalogHiddenStaged}
      variant="warning"
    />
  {/if}

  {#if view.groups.length === 0}
    <EmptyState
      description="Adjust the search text or filter chips to widen the parameter catalog."
      title="No parameters match"
      testId={parameterWorkspaceTestIds.catalogNoMatches}
    />
  {:else}
    <div class="space-y-2">
      {#each view.groups as group (group.key)}
        <Card.Root as="section" class="overflow-hidden" density="compact" padding="none" surface="transparent">
          <Button
            aria-expanded={isGroupExpanded(group)}
            class="h-auto w-full justify-start rounded-none px-3 py-2 text-left hover:bg-bg-tertiary/50"
            testId={`${parameterWorkspaceTestIds.catalogGroupPrefix}-${group.key}`}
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
            {#if group.rows.some((row) => row.isStaged || row.hasFailure)}
              <Badge shape="rounded" size="sm" variant="warning">
                {group.rows.filter((row) => row.isStaged || row.hasFailure).length} modified
              </Badge>
            {/if}
          </Button>

          {#if isGroupExpanded(group)}
            <div class="border-t border-border px-3 py-3">
              <SetupParamEditGrid minWidth="20rem" density="compact" ariaLabel={`${group.label} parameters`}>
                {#each group.rows as row (row.renderId)}
                  <SetupParamEditCard
                    item={row}
                    inputId={`parameter-catalog-${row.renderId}`}
                    type={row.editorKind}
                    value={cardValue(row)}
                    options={row.enumOptions}
                    bitmaskOptions={row.bitmaskOptions}
                    offLabel={row.booleanOptions?.off.label}
                    onLabel={row.booleanOptions?.on.label}
                    disabled={readiness !== "ready" || replayReadonly}
                    stagedName={row.isStaged ? row.name : undefined}
                    stagedTestId={`${parameterWorkspaceTestIds.discardButtonPrefix}-${row.name}`}
                    onUnstage={onDiscard}
                    testId={`${parameterWorkspaceTestIds.itemPrefix}-${row.name}`}
                    inputTestId={`${parameterWorkspaceTestIds.inputPrefix}-${row.name}`}
                    onValueChange={(value) => stageCardValue(row, value)}
                  />
                {/each}
              </SetupParamEditGrid>
            </div>
          {/if}
        </Card.Root>
      {/each}
    </div>
  {/if}
</div>
