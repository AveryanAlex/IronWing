<script lang="ts">
import type { SetupWorkspaceStoreState } from "../../lib/stores/setup-workspace";
import { setupWorkspaceTestIds } from "./setup-workspace-test-ids";

let {
  view,
  onSelect,
}: {
  view: SetupWorkspaceStoreState;
  onSelect: (sectionId: string) => void;
} = $props();

let guidedSections = $derived(view.sections.filter((section) => section.kind === "guided"));
let unknownCount = $derived(guidedSections.filter((section) => section.status === "unknown").length);
let gatedCount = $derived(guidedSections.filter((section) => section.availability === "gated").length);
let bannerTone = $derived.by(() => {
  if (view.metadataState === "unavailable" || view.readiness === "degraded") {
    return "border-warning/40 bg-warning/10 text-warning";
  }

  if (unknownCount > 0) {
    return "border-border bg-bg-primary/80 text-text-secondary";
  }

  return "border-success/30 bg-success/10 text-success";
});
let bannerTitle = $derived.by(() => {
  if (view.metadataState === "unavailable") {
    return "Metadata missing — recovery mode is active";
  }

  if (view.readiness === "bootstrapping") {
    return "Setup is still settling";
  }

  if (view.readiness === "degraded") {
    return "Overview is live, but guided controls are limited";
  }

  if (unknownCount > 0) {
    return "Partial live facts stay explicit";
  }

  return "Overview is fully live";
});
let bannerBody = $derived.by(() => {
  if (view.metadataState === "unavailable") {
    return "Purpose-built editors stay blocked because parameter labels and option maps are unavailable. Overview remains truthful, and Full Parameters stays reachable as the recovery path.";
  }

  if (view.readiness === "bootstrapping") {
    return "Keep the dashboard open while session and parameter domains finish bootstrapping. Unknown sections remain unconfirmed until live facts arrive.";
  }

  if (view.readiness === "degraded") {
    return "The shell is carrying degraded setup truth. Keep using the dashboard for status, and switch to Full Parameters when a guided card cannot prove its current state.";
  }

  if (unknownCount > 0) {
    return `Unknown sections remain unconfirmed instead of bluffing completion. ${gatedCount > 0 ? "Blocked cards route you back through Full Parameters until metadata recovers." : "Open the next card only when the live facts look trustworthy."}`;
  }

  return "Use the quick actions to move into purpose-built setup editors while the shared review tray keeps ownership of staged changes.";
});
</script>

<section class="space-y-4" data-testid={setupWorkspaceTestIds.overviewSection}>
  <div class={`rounded-2xl border px-4 py-4 ${bannerTone}`} data-testid={setupWorkspaceTestIds.overviewBanner}>
    <p class="text-xs font-semibold uppercase tracking-[0.18em]">Overview</p>
    <h3 class="mt-2 text-lg font-semibold text-text-primary">{bannerTitle}</h3>
    <p class="mt-2 text-sm leading-6">{bannerBody}</p>
  </div>

  <div class="flex flex-wrap gap-2">
    <button
      class="rounded-full border border-border bg-bg-primary/80 px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
      data-testid={`${setupWorkspaceTestIds.overviewQuickActionPrefix}-frame_orientation`}
      onclick={() => onSelect("frame_orientation")}
      type="button"
    >
      Open Frame &amp; orientation
    </button>
    <button
      class="rounded-full border border-border bg-bg-primary/80 px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
      data-testid={`${setupWorkspaceTestIds.overviewQuickActionPrefix}-full_parameters`}
      onclick={() => onSelect("full_parameters")}
      type="button"
    >
      Open Full Parameters
    </button>
  </div>

  <div class="grid gap-3 md:grid-cols-3">
    {#each guidedSections as section (section.id)}
      <article
        class="rounded-2xl border border-border bg-bg-primary/80 p-4"
        data-testid={`${setupWorkspaceTestIds.overviewCardPrefix}-${section.id}`}
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-text-primary">{section.title}</p>
            <p class="mt-1 text-xs text-text-secondary">{section.description}</p>
          </div>
          <span class="rounded-full border border-border bg-bg-secondary px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
            {section.statusText}
          </span>
        </div>

        {#if section.confidenceText}
          <p class="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
            {section.confidenceText}
          </p>
        {/if}

        <p class="mt-3 text-sm leading-6 text-text-secondary">{section.detailText}</p>

        <button
          class="mt-4 rounded-full border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
          onclick={() => onSelect(section.availability === "available" ? section.id : "full_parameters")}
          type="button"
        >
          {section.availability === "available" ? `Open ${section.title}` : "Use Full Parameters"}
        </button>
      </article>
    {/each}
  </div>

  <div
    class="rounded-2xl border border-border bg-bg-primary/80 px-4 py-4 text-sm leading-6 text-text-secondary"
    data-testid={setupWorkspaceTestIds.detailRecovery}
  >
    Full Parameters stays separate as the raw recovery path, so staged edits continue to flow through the shared shell-owned review tray instead of a setup-local apply queue.
  </div>
</section>
