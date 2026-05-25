<script lang="ts">
import { AlertTriangle, ChevronDown, ChevronRight, ChevronUp, Layers3 } from "lucide-svelte";
import { commandDisplayName, commandPosition, geoPoint3dAltitude, geoPoint3dLatLon } from "../../lib/mavkit-types";
import { resolveSurveyGenerationBlockedReason } from "../../lib/mission-survey-authoring";
import { estimateSurveyFlightTime, formatSurveyStats } from "../../lib/survey-preview";
import type { SurveyRegion } from "../../lib/survey-region";
import { missionWorkspaceTestIds } from "./mission-workspace-test-ids";

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

<article
  class={`group relative rounded-md border text-xs transition-colors ${selected
    ? "border-accent bg-accent/12 shadow-[inset_0_0_0_1px_rgba(18,185,255,0.22)]"
    : "border-border bg-bg-primary hover:border-border-light hover:bg-bg-tertiary/50"}`}
>
  <div class="flex items-stretch">
    <button
      aria-label={`Select Region ${ordinal + 1}`}
      class="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left"
      data-selected={selected ? "true" : "false"}
      data-testid={testId}
      onclick={onSelect}
      type="button"
    >
      <span class={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${selected ? "bg-accent/25 text-accent" : "bg-bg-tertiary text-text-muted"}`}>
        <Layers3 aria-hidden="true" size={15} />
      </span>

      <span class="min-w-0 flex-1">
        <span class="flex min-w-0 items-center gap-2 text-sm font-semibold text-text-primary">
          <span class="truncate">Region {ordinal + 1}</span>
          {#if hasManualEdits}
            <span class="shrink-0 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
              Edited
            </span>
          {/if}
        </span>

        <span class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
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
    </button>

    <div class="flex shrink-0 items-center gap-1 border-l border-border/50 px-1 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
      <button
        aria-label={region.collapsed ? `Show Region ${ordinal + 1} details` : `Hide Region ${ordinal + 1} details`}
        class="rounded p-1 text-text-muted transition hover:bg-bg-tertiary hover:text-text-primary"
        data-testid={`${missionWorkspaceTestIds.surveyCollapsePrefix}-${region.id}`}
        onclick={(event) => {
          event.stopPropagation();
          onToggleCollapsed(!region.collapsed);
        }}
        title={region.collapsed ? "Show details" : "Hide details"}
        type="button"
      >
        {#if region.collapsed}
          <ChevronDown aria-hidden="true" size={14} />
        {:else}
          <ChevronUp aria-hidden="true" size={14} />
        {/if}
      </button>
      <button
        class="rounded px-2 py-1 text-xs font-medium text-accent transition hover:bg-bg-tertiary disabled:cursor-not-allowed disabled:opacity-50"
        data-testid={`${missionWorkspaceTestIds.surveyGeneratePrefix}-${region.id}`}
        disabled={generateDisabled}
        onclick={(event) => {
          event.stopPropagation();
          onGenerate();
        }}
        type="button"
      >
        {generationStatusLabel}
      </button>
      <button
        class="rounded px-2 py-1 text-xs font-medium text-text-secondary transition hover:bg-bg-tertiary hover:text-warning disabled:cursor-not-allowed disabled:opacity-50"
        data-testid={`${missionWorkspaceTestIds.surveyDissolvePrefix}-${region.id}`}
        disabled={region.generationState === "generating"}
        onclick={(event) => {
          event.stopPropagation();
          onPromptDissolve();
        }}
        type="button"
      >
        Dissolve
      </button>
      <button
        class="rounded px-2 py-1 text-xs font-medium text-text-secondary transition hover:bg-bg-tertiary hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
        data-testid={`${missionWorkspaceTestIds.surveyDeletePrefix}-${region.id}`}
        disabled={region.generationState === "generating"}
        onclick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
        type="button"
      >
        Delete
      </button>
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
        <ul class="space-y-1 text-xs text-warning">
          {#each warningList as warning (warning)}
            <li class="flex items-start gap-1.5">
              <AlertTriangle aria-hidden="true" class="mt-0.5 shrink-0" size={12} />
              <span>{warning}</span>
            </li>
          {/each}
        </ul>
      {/if}

      {#if generatedEntries.length === 0}
        <div class="rounded-md border border-dashed border-border bg-bg-secondary/60 px-3 py-2 text-xs text-text-secondary">
          Generate this region to preview nested survey commands here.
        </div>
      {:else}
        <div class="space-y-1">
          {#each generatedEntries as entry (`${region.id}-generated-${entry.index}`)}
            <div class="flex items-center gap-2 rounded-md border border-border/70 bg-bg-secondary/60 px-2 py-1.5" data-testid={`${missionWorkspaceTestIds.surveyGeneratedItemPrefix}-${region.id}-${entry.index}`}>
              <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-bg-tertiary text-[10px] font-semibold tabular-nums text-text-muted">
                {entry.index + 1}
              </span>
              <span class="shrink-0 font-semibold text-text-primary">{entry.commandName}</span>
              <span class="min-w-0 truncate text-text-muted">{entry.summary}</span>
              {#if entry.edited}
                <span class="ml-auto shrink-0 rounded bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning">Manual edit</span>
              {/if}
            </div>
          {/each}
          {#if hiddenGeneratedCount > 0}
            <p class="px-2 text-[10px] text-text-muted">+{hiddenGeneratedCount} more generated item{hiddenGeneratedCount === 1 ? "" : "s"} in the inspector.</p>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</article>
