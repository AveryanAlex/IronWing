<script lang="ts">
import type { SurveyRegion } from "../../lib/survey-region";

type Props = {
  region: SurveyRegion;
  position: number;
  selected: boolean;
  testId: string;
  onSelect: () => void;
};

let { region, position, selected, testId, onSelect }: Props = $props();

function sentenceCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}

let warnings = $derived.by(() => {
  const nextWarnings = [...(region.importWarnings ?? [])];

  if (!region.camera) {
    nextWarnings.push("Camera metadata unavailable; this imported survey block stays read-only.");
  }

  if (region.polygon.length === 0 && region.polyline.length === 0) {
    nextWarnings.push("Geometry metadata unavailable; keep the imported block visible but read-only.");
  }

  if (region.generatedItems.length === 0) {
    nextWarnings.push("Generated survey mission items are unavailable; export/upload will preserve only the imported passthrough block.");
  }

  return [...new Set(nextWarnings)];
});
</script>

<button
  class={`w-full rounded-2xl border p-4 text-left transition ${selected
    ? "border-warning/40 bg-warning/10 text-text-primary"
    : "border-border bg-bg-primary text-text-primary hover:border-warning/40"}`}
  data-selected={selected ? "true" : "false"}
  data-testid={testId}
  onclick={onSelect}
  type="button"
>
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.16em] text-warning">Imported survey block</p>
      <h3 class="mt-1 text-sm font-semibold">Block {position + 1} · {sentenceCase(region.patternType)}</h3>
      <p class="mt-1 text-xs text-text-secondary">
        {region.generatedItems.length} generated item{region.generatedItems.length === 1 ? "" : "s"}
        · {region.polygon.length > 0 ? `${region.polygon.length} polygon vertices` : `${region.polyline.length} corridor points`}
      </p>
    </div>

    <span class="rounded-full border border-warning/40 bg-bg-primary px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-warning">
      Read-only
    </span>
  </div>

  <dl class="mt-3 grid gap-2 text-xs sm:grid-cols-2">
    <div class="rounded-xl border border-border/70 bg-bg-secondary px-3 py-2">
      <dt class="text-text-muted">Camera</dt>
      <dd class="mt-1 font-medium text-text-primary">{region.camera?.canonicalName ?? "Unavailable"}</dd>
    </div>
    <div class="rounded-xl border border-border/70 bg-bg-secondary px-3 py-2">
      <dt class="text-text-muted">Altitude</dt>
      <dd class="mt-1 font-medium text-text-primary">{region.params.altitude_m} m</dd>
    </div>
  </dl>

  {#if warnings.length > 0}
    <ul class="mt-3 list-inside list-disc space-y-1 text-xs text-warning">
      {#each warnings as warning (warning)}
        <li>{warning}</li>
      {/each}
    </ul>
  {/if}
</button>
