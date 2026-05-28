<script lang="ts">
import { AlertTriangle, ChevronDown, ChevronRight, ChevronUp, Layers3 } from "lucide-svelte";
import { commandDisplayName, commandPosition, geoPoint3dAltitude, geoPoint3dLatLon } from "../../../lib/mavkit-types";
import { resolveSurveyGenerationBlockedReason } from "../../../lib/mission-survey-authoring";
import { estimateSurveyFlightTime, formatSurveyStats } from "../../../lib/survey-preview";
import type { SurveyRegion } from "../../../lib/survey-region";
import { Alert, Badge, Button, Card, EmptyState, HelperText, IconButton, MonoValue, SelectableCard } from "../../../components/ui";
import { missionWorkspaceTestIds } from "../mission-workspace-test-ids";

type Props = {
  region: SurveyRegion;
  ordinal: number;
  selected: boolean;
  testId: string;
  cruiseSpeed: number;
  onSelect: () => void;
  onToggleCollapsed: (collapsed: boolean) => void;
  onGenerate: () => Promise<unknown> | unknown;
  onPromptDissolve: () => void;
  onDelete: () => void;
};

let {
  region,
  ordinal,
  selected,
  testId,
  cruiseSpeed,
  onSelect,
  onToggleCollapsed,
  onGenerate,
  onPromptDissolve,
  onDelete,
}: Props = $props();

let blockedReason = $derived(resolveSurveyGenerationBlockedReason(region));
let formattedStats = $derived.by(() => {
  if (!region.generatedStats) {
    return null;
  }

  const flightTime = "estimatedFlightTime_s" in region.generatedStats
    ? region.generatedStats.estimatedFlightTime_s
    : estimateSurveyFlightTime(region.generatedItems, cruiseSpeed);
  const normalizedFlightTime = typeof flightTime === "number" && Number.isFinite(flightTime) ? flightTime : null;

  return formatSurveyStats(region.generatedStats, normalizedFlightTime);
});
let warningList = $derived.by(() => {
  const warnings = [...(region.importWarnings ?? [])];

  if (blockedReason?.message) {
    warnings.push(blockedReason.message);
  }

  if (region.generationMessage && region.generationMessage !== blockedReason?.message) {
    warnings.push(region.generationMessage);
  }

  if (region.manualEdits.size > 0) {
    warnings.push(`${region.manualEdits.size} nested generated item manual edit${region.manualEdits.size === 1 ? " is" : "s are"} pending.`);
  }

  return [...new Set(warnings)];
});
let generatedEntries = $derived.by(() =>
  region.generatedItems.slice(0, 4).map((generatedItem, index) => {
    const effectiveItem = region.manualEdits.get(index) ?? generatedItem;
    const position = commandPosition(effectiveItem.command);
    const coords = position ? geoPoint3dLatLon(position) : null;
    const altitude = position ? geoPoint3dAltitude(position).value : null;

    return {
      index,
      commandName: commandDisplayName(effectiveItem.command),
      edited: region.manualEdits.has(index),
      summary: coords
        ? `${coords.latitude_deg.toFixed(5)}, ${coords.longitude_deg.toFixed(5)} · ${altitude?.toFixed(1) ?? "—"} m`
        : "No coordinate payload",
    };
  }),
);
let hiddenGeneratedCount = $derived(Math.max(0, region.generatedItems.length - generatedEntries.length));
let cameraLabel = $derived(region.camera?.canonicalName ?? region.cameraId ?? "No camera selected");
let generateDisabled = $derived(region.generationState === "generating" || blockedReason !== null);
let generationStatusLabel = $derived(region.generationState === "generating"
  ? "Generating…"
  : region.generatedItems.length > 0
    ? "Regenerate"
    : "Generate");
let hasManualEdits = $derived(region.manualEdits.size > 0);
let patternLabel = $derived(regionPatternLabel(region));
let photoCount = $derived(region.generatedStats?.photoCount?.toLocaleString() ?? "0");
let pathCount = $derived(formatGeneratedPathCount(region));
let areaLabel = $derived(formatArea(region.generatedStats?.area_m2));

function formatArea(areaM2: number | null | undefined): string {
  if (!Number.isFinite(areaM2 ?? NaN)) {
    return "—";
  }

  if ((areaM2 ?? 0) >= 1_000_000) {
    return `${((areaM2 ?? 0) / 1_000_000).toFixed(2)} km²`;
  }

  return `${Math.round(areaM2 ?? 0).toLocaleString()} m²`;
}

function formatGeneratedPathCount(regionValue: SurveyRegion): string | null {
  if (regionValue.patternType === "structure") {
    const layerCount = regionValue.generatedStats && "layerCount" in regionValue.generatedStats
      ? regionValue.generatedStats.layerCount
      : null;

    if (!Number.isFinite(layerCount ?? NaN)) {
      return null;
    }

    const rounded = Math.round(layerCount ?? 0);
    return `${rounded.toLocaleString()} ${rounded === 1 ? "layer" : "layers"}`;
  }

  const laneCount = regionValue.generatedStats?.laneCount;
  if (!Number.isFinite(laneCount ?? NaN)) {
    return null;
  }

  const rounded = Math.round(laneCount ?? 0);
  return `${rounded.toLocaleString()} ${rounded === 1 ? "lane" : "lanes"}`;
}

function regionPatternLabel(regionValue: SurveyRegion): string {
  if (regionValue.patternType === "corridor") {
    return "Corridor";
  }

  if (regionValue.patternType === "structure") {
    return "Structure scan";
  }

  return regionValue.params.crosshatch ? "Crosshatch grid" : "Grid";
}
</script>

<Card.Root
  as="article"
  density="compact"
  radius="sm"
  selected={selected}
  surface="primary"
  padding="none"
  class="group relative text-xs transition-colors hover:border-border-light hover:bg-bg-tertiary/50"
>
  <div class="flex min-w-0 flex-col">
    <SelectableCard
      ariaLabel={`Select Region ${ordinal + 1}`}
      class="flex min-w-0 flex-1 items-center gap-2 rounded-none border-0 px-2 py-2 text-left"
      density="compact"
      onSelect={onSelect}
      selected={selected}
      testId={testId}
      variant="ghost"
    >
      <span class={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${selected ? "bg-accent/25 text-accent" : "bg-bg-tertiary text-text-muted"}`}>
        <Layers3 aria-hidden="true" size={15} />
      </span>

      <span class="min-w-0 flex-1">
        <span class="flex min-w-0 items-center gap-2 text-sm font-semibold text-text-primary">
          <span class="truncate">Region {ordinal + 1}</span>
          {#if hasManualEdits}
            <Badge class="shrink-0" variant="warning" size="xs" case="normal" shape="rounded">
              Edited
            </Badge>
          {/if}
        </span>

        <span class="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
          <span>{patternLabel}</span>
          <span aria-hidden="true">•</span>
          <span>{photoCount} photos</span>
          <span aria-hidden="true">•</span>
          <span>{areaLabel}</span>
          {#if pathCount}
            <span aria-hidden="true">•</span>
            <span>{pathCount}</span>
          {:else}
            <span aria-hidden="true">•</span>
            <span>{region.generatedItems.length} generated</span>
          {/if}
        </span>
      </span>

      <ChevronRight aria-hidden="true" class={selected ? "shrink-0 text-accent" : "shrink-0 text-text-muted"} size={16} />
    </SelectableCard>

    <div class="flex min-w-0 flex-wrap items-center gap-1 border-t border-border/50 px-1 py-1">
      <IconButton
        ariaLabel={region.collapsed ? `Show Region ${ordinal + 1} details` : `Hide Region ${ordinal + 1} details`}
        class="size-7"
        size="icon-sm"
        testId={`${missionWorkspaceTestIds.surveyCollapsePrefix}-${region.id}`}
        tone="neutral"
        onclick={(event) => {
          event.stopPropagation();
          onToggleCollapsed(!region.collapsed);
        }}
        title={region.collapsed ? "Show details" : "Hide details"}
        variant="ghost"
      >
        {#if region.collapsed}
          <ChevronDown aria-hidden="true" size={14} />
        {:else}
          <ChevronUp aria-hidden="true" size={14} />
        {/if}
      </IconButton>
      <Button
        class="h-7 px-2 text-xs"
        disabled={generateDisabled}
        size="sm"
        testId={`${missionWorkspaceTestIds.surveyGeneratePrefix}-${region.id}`}
        tone="accent"
        onclick={(event) => {
          event.stopPropagation();
          onGenerate();
        }}
        variant="ghost"
      >
        {generationStatusLabel}
      </Button>
      <Button
        class="h-7 px-2 text-xs"
        disabled={region.generationState === "generating"}
        size="sm"
        testId={`${missionWorkspaceTestIds.surveyDissolvePrefix}-${region.id}`}
        tone="warning"
        onclick={(event) => {
          event.stopPropagation();
          onPromptDissolve();
        }}
        variant="ghost"
      >
        Dissolve
      </Button>
      <Button
        class="h-7 px-2 text-xs"
        disabled={region.generationState === "generating"}
        size="sm"
        testId={`${missionWorkspaceTestIds.surveyDeletePrefix}-${region.id}`}
        tone="danger"
        onclick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
        variant="ghost"
      >
        Delete
      </Button>
    </div>
  </div>

  {#if hasManualEdits}
    <div class="pointer-events-none absolute right-2 top-2 text-warning" aria-hidden="true">
      <AlertTriangle size={14} />
    </div>
  {/if}

  {#if !region.collapsed}
    <div class="space-y-2 border-t border-border/60 px-3 py-2">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
        <span>{cameraLabel}</span>
        {#if formattedStats}
          <span>{formattedStats.flightTime} flight</span>
          <span>{region.patternType === "structure" ? `${formattedStats.layerCount ?? "—"} layers` : `${formattedStats.laneCount} lanes`}</span>
        {/if}
      </div>

      {#if warningList.length > 0}
        <Alert density="compact" shadow={false} variant="warning">
          <ul class="space-y-1 text-xs text-warning">
            {#each warningList as warning (warning)}
              <li class="flex items-start gap-1.5">
                <AlertTriangle aria-hidden="true" class="mt-0.5 shrink-0" size={12} />
                <span>{warning}</span>
              </li>
            {/each}
          </ul>
        </Alert>
      {/if}

      {#if generatedEntries.length === 0}
        <EmptyState
          class="min-w-0 p-3"
          title="No generated survey commands"
          description="Generate this region to preview nested survey commands here."
        />
      {:else}
        <div class="space-y-1">
          {#each generatedEntries as entry (`${region.id}-generated-${entry.index}`)}
            <Card.Root class="min-w-0 flex-wrap items-center gap-2 px-2 py-1.5" density="compact" layout="row" padding="none" radius="sm" surface="secondary" testId={`${missionWorkspaceTestIds.surveyGeneratedItemPrefix}-${region.id}-${entry.index}`}>
              <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-bg-tertiary text-text-muted">
                <MonoValue size="xs" tone="muted" value={entry.index + 1} />
              </span>
              <span class="min-w-0 font-semibold text-text-primary">{entry.commandName}</span>
              <HelperText as="span" class="min-w-0 truncate" size="xs" tone="muted">{entry.summary}</HelperText>
              {#if entry.edited}
                <Badge class="ml-auto shrink-0" variant="warning" size="xs" case="normal" shape="rounded">Manual edit</Badge>
              {/if}
            </Card.Root>
          {/each}
          {#if hiddenGeneratedCount > 0}
            <HelperText class="px-2" size="xs" tone="muted">+{hiddenGeneratedCount} more generated item{hiddenGeneratedCount === 1 ? "" : "s"} in the inspector.</HelperText>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</Card.Root>
