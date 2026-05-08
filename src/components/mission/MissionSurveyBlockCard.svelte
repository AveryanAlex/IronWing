<script lang="ts">
import { commandDisplayName, commandPosition, geoPoint3dAltitude, geoPoint3dLatLon } from "../../lib/mavkit-types";
import { resolveSurveyGenerationBlockedReason } from "../../lib/mission-survey-authoring";
import { estimateSurveyFlightTime, formatSurveyStats } from "../../lib/survey-preview";
import type { SurveyRegion } from "../../lib/survey-region";
import { missionWorkspaceTestIds } from "./mission-workspace-test-ids";

type Props = {
  region: SurveyRegion;
  position: number;
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
  position,
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
  region.generatedItems.map((generatedItem, index) => {
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
let cameraLabel = $derived(region.camera?.canonicalName ?? region.cameraId ?? "No camera selected");
let geometryLabel = $derived(region.patternType === "corridor"
  ? `${region.polyline.length} centerline point${region.polyline.length === 1 ? "" : "s"}`
  : `${region.polygon.length} vertex${region.polygon.length === 1 ? "" : "ices"}`);
let generateDisabled = $derived(region.generationState === "generating" || blockedReason !== null);
let generationStatusLabel = $derived(region.generationState === "generating"
  ? "Generating…"
  : region.generatedItems.length > 0
    ? "Regenerate"
    : "Generate");

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}
</script>

<article
  class={`rounded-lg border p-3 transition ${selected
    ? "border-accent/40 bg-accent/10 text-text-primary"
    : "border-border bg-bg-primary text-text-primary hover:border-accent/40"}`}
>
  <div class="flex flex-wrap items-start justify-between gap-3">
    <button
      class="min-w-0 flex-1 text-left"
      data-selected={selected ? "true" : "false"}
      data-testid={testId}
      onclick={onSelect}
      type="button"
    >
      <div class="flex flex-wrap items-center gap-2">
        <p class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
          Survey block {position + 1}
        </p>
        {#if region.importWarnings?.length}
          <span class="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-warning">
            Imported
          </span>
        {/if}
      </div>
      <h3 class="mt-1 text-sm font-semibold">{titleCase(region.patternType)} survey</h3>
      <p class="mt-1 text-xs text-text-secondary">
        {cameraLabel} · {geometryLabel} · {region.generatedItems.length} generated item{region.generatedItems.length === 1 ? "" : "s"}
      </p>
      {#if formattedStats}
        <p class="mt-2 text-xs text-text-secondary">
          {formattedStats.photoCount} photos · {formattedStats.flightTime} flight time · {region.patternType === "structure" ? `${formattedStats.layerCount ?? "—"} layers` : `${formattedStats.laneCount} lanes`}
        </p>
      {/if}
    </button>

    <div class="flex flex-wrap items-center gap-2">
      <span class={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${region.generationState === "generating"
        ? "border-accent/30 bg-accent/10 text-accent"
        : warningList.length > 0
          ? "border-warning/40 bg-warning/10 text-warning"
          : "border-success/30 bg-success/10 text-success"}`}>
        {region.generationState === "generating" ? "Generating" : warningList.length > 0 ? "Attention" : "Ready"}
      </span>
      <button
        class="rounded-md border border-border bg-bg-secondary px-3 py-1.5 text-xs font-semibold text-text-primary transition hover:border-accent hover:text-accent"
        data-testid={`${missionWorkspaceTestIds.surveyCollapsePrefix}-${region.id}`}
        onclick={() => onToggleCollapsed(!region.collapsed)}
        type="button"
      >
        {region.collapsed ? "Expand" : "Collapse"}
      </button>
    </div>
  </div>

  {#if !region.collapsed}
    <div class="mt-4 space-y-4">
      {#if warningList.length > 0}
        <ul class="list-inside list-disc space-y-1 text-xs text-warning">
          {#each warningList as warning (warning)}
            <li>{warning}</li>
          {/each}
        </ul>
      {/if}

      {#if formattedStats}
        <div class="grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4">
          <div class="rounded-xl border border-border/70 bg-bg-secondary px-3 py-2"><dt class="text-text-muted">GSD</dt><dd class="mt-1 font-medium text-text-primary">{formattedStats.gsd}</dd></div>
          <div class="rounded-xl border border-border/70 bg-bg-secondary px-3 py-2"><dt class="text-text-muted">Photos</dt><dd class="mt-1 font-medium text-text-primary">{formattedStats.photoCount}</dd></div>
          <div class="rounded-xl border border-border/70 bg-bg-secondary px-3 py-2"><dt class="text-text-muted">Trigger</dt><dd class="mt-1 font-medium text-text-primary">{formattedStats.triggerDistance}</dd></div>
          <div class="rounded-xl border border-border/70 bg-bg-secondary px-3 py-2"><dt class="text-text-muted">Flight</dt><dd class="mt-1 font-medium text-text-primary">{formattedStats.flightTime}</dd></div>
        </div>
      {/if}

      <div class="space-y-2">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Nested generated items</p>
          {#if region.manualEdits.size > 0}
            <span class="rounded-full border border-warning/40 bg-warning/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-warning">
              {region.manualEdits.size} manual edit{region.manualEdits.size === 1 ? "" : "s"}
            </span>
          {/if}
        </div>

        {#if generatedEntries.length === 0}
          <div class="rounded-xl border border-dashed border-border bg-bg-secondary/60 px-4 py-4 text-sm text-text-secondary">
            Generate this region to see nested survey items here, or keep the existing authored geometry and parameters queued until you are ready.
          </div>
        {:else}
          <div class="space-y-2">
            {#each generatedEntries as entry (`${region.id}-generated-${entry.index}`)}
              <div class="rounded-xl border border-border/70 bg-bg-secondary/60 px-3 py-3" data-testid={`${missionWorkspaceTestIds.surveyGeneratedItemPrefix}-${region.id}-${entry.index}`}>
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <p class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Item {entry.index + 1}</p>
                  {#if entry.edited}
                    <span class="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-warning">
                      Manual edit
                    </span>
                  {/if}
                </div>
                <h4 class="mt-1 text-sm font-semibold text-text-primary">{entry.commandName}</h4>
                <p class="mt-1 text-xs text-text-secondary">{entry.summary}</p>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          class="rounded-md border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
          data-testid={`${missionWorkspaceTestIds.surveyGeneratePrefix}-${region.id}`}
          disabled={generateDisabled}
          onclick={onGenerate}
          type="button"
        >
          {generationStatusLabel}
        </button>
        <button
          class="rounded-md border border-warning/40 bg-warning/10 px-4 py-2 text-sm font-semibold text-warning transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
          data-testid={`${missionWorkspaceTestIds.surveyDissolvePrefix}-${region.id}`}
          disabled={region.generationState === "generating"}
          onclick={onPromptDissolve}
          type="button"
        >
          Dissolve
        </button>
        <button
          class="rounded-md border border-danger/40 bg-danger/10 px-4 py-2 text-sm font-semibold text-danger transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
          data-testid={`${missionWorkspaceTestIds.surveyDeletePrefix}-${region.id}`}
          disabled={region.generationState === "generating"}
          onclick={onDelete}
          type="button"
        >
          Delete
        </button>
      </div>
    </div>
  {/if}
</article>
