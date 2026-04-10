<script lang="ts">
import { resolveDocsUrl } from "../../data/ardupilot-docs";
import type { SetupWorkspaceStoreState } from "../../lib/stores/setup-workspace";
import { setupWorkspaceTestIds } from "./setup-workspace-test-ids";

let {
  view,
  onSelect,
}: {
  view: SetupWorkspaceStoreState;
  onSelect: (sectionId: string) => void;
} = $props();

const overviewDocs = [
  {
    id: "hardware",
    label: "GPS & sensors docs",
    detail: "Airframe, GPS, and shared hardware references.",
    url: resolveDocsUrl("positioning_gps_compass"),
  },
  {
    id: "safety",
    label: "Pre-arm docs",
    detail: "Safety checks and arming readiness guidance.",
    url: resolveDocsUrl("prearm_safety_checks"),
  },
  {
    id: "tuning",
    label: "Tuning docs",
    detail: "Starter tuning and optional hardware references.",
    url: resolveDocsUrl("tuning"),
  },
] as const;

let guidedGroups = $derived(
  view.sectionGroups.filter((group) => group.sections.some((section) => section.kind === "guided")),
);
let guidedSections = $derived(guidedGroups.flatMap((group) => group.sections));
let unknownCount = $derived(guidedSections.filter((section) => section.status === "unknown").length);
let blockedCount = $derived(guidedSections.filter((section) => section.availability === "blocked").length);
let implementedCount = $derived(guidedSections.filter((section) => section.implemented).length);
let availableCount = $derived(guidedSections.filter((section) => section.availability === "available").length);
let inProgressCount = $derived(guidedSections.filter((section) => section.status === "in_progress").length);
let bannerTone = $derived.by(() => {
  if (view.metadataState === "unavailable" || view.readiness === "degraded") {
    return "border-warning/40 bg-warning/10 text-warning";
  }

  if (unknownCount > 0 || blockedCount > 0) {
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
    return "Overview is live, but expert sections are limited";
  }

  if (unknownCount > 0 || blockedCount > 0) {
    return "Grouped progress stays conservative";
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
    return "The shell is carrying degraded setup truth. Keep using the grouped dashboard for status, and switch to Full Parameters when a guided card cannot prove its current state.";
  }

  if (unknownCount > 0 || blockedCount > 0) {
    return `${blockedCount} blocked and ${unknownCount} unconfirmed sections remain visible instead of disappearing from the expert path.`;
  }

  return "Use the grouped expert path to move into purpose-built setup editors while the shared review tray keeps ownership of staged changes.";
});
let overviewMetrics = $derived([
  {
    id: "inventory",
    label: "Expert inventory",
    value: `${guidedSections.length} sections`,
    detail: `${guidedGroups.length} groups · ${implementedCount} purpose-built editors`,
  },
  {
    id: "progress",
    label: "Trackable progress",
    value: view.progressText,
    detail: `${availableCount} available · ${blockedCount} blocked`,
  },
  {
    id: "status",
    label: "Conservative truth",
    value: `${unknownCount} unconfirmed`,
    detail: `${inProgressCount} in progress · ${view.statusNotices.length} status notice${view.statusNotices.length === 1 ? "" : "s"}`,
  },
]);

function groupTone(blocked: number, progressText: string): string {
  if (blocked > 0) {
    return "border-warning/30 bg-warning/5";
  }

  if (/^\d+\/\d+ confirmed$/.test(progressText) && !progressText.startsWith("0/")) {
    return "border-border bg-bg-primary/80";
  }

  return "border-border bg-bg-primary/70";
}
</script>

<section class="space-y-4" data-testid={setupWorkspaceTestIds.overviewSection}>
  <div class={`rounded-2xl border px-4 py-4 ${bannerTone}`} data-testid={setupWorkspaceTestIds.overviewBanner}>
    <p class="text-xs font-semibold uppercase tracking-[0.18em]">Overview</p>
    <h3 class="mt-2 text-lg font-semibold text-text-primary">{bannerTitle}</h3>
    <p class="mt-2 text-sm leading-6">{bannerBody}</p>
  </div>

  <div class="grid gap-3 xl:grid-cols-3">
    {#each overviewMetrics as metric (metric.id)}
      <article
        class="rounded-2xl border border-border bg-bg-primary/80 p-4"
        data-testid={`${setupWorkspaceTestIds.overviewMetricPrefix}-${metric.id}`}
      >
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">{metric.label}</p>
        <p class="mt-2 text-base font-semibold text-text-primary">{metric.value}</p>
        <p class="mt-2 text-sm leading-6 text-text-secondary">{metric.detail}</p>
      </article>
    {/each}
  </div>

  <div class="grid gap-3 xl:grid-cols-3">
    {#each overviewDocs as doc (doc.id)}
      {#if doc.url}
        <a
          class="rounded-2xl border border-border bg-bg-primary/80 p-4 transition hover:border-accent hover:text-accent"
          data-testid={`${setupWorkspaceTestIds.overviewDocLinkPrefix}-${doc.id}`}
          href={doc.url}
          rel="noreferrer"
          target="_blank"
        >
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Docs</p>
          <p class="mt-2 text-base font-semibold text-text-primary">{doc.label}</p>
          <p class="mt-2 text-sm leading-6 text-text-secondary">{doc.detail}</p>
        </a>
      {/if}
    {/each}
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
      data-testid={`${setupWorkspaceTestIds.overviewQuickActionPrefix}-flight_modes`}
      onclick={() => onSelect("flight_modes")}
      type="button"
    >
      Open Flight modes
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

  <div class="space-y-4">
    {#each guidedGroups as group (group.id)}
      <article
        class={`rounded-2xl border p-4 ${groupTone(group.blockedCount, group.progressText)}`}
        data-testid={`${setupWorkspaceTestIds.overviewGroupPrefix}-${group.id}`}
      >
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">{group.title}</p>
            <p class="mt-1 text-sm leading-6 text-text-secondary">{group.description}</p>
            <p
              class="mt-2 text-xs text-text-muted"
              data-testid={`${setupWorkspaceTestIds.overviewGroupCountPrefix}-${group.id}`}
            >
              {group.sections.length} sections · {group.implementedCount} purpose-built editors
            </p>
          </div>
          <div class="text-right">
            <p
              class="rounded-full border border-border bg-bg-secondary px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary"
              data-testid={`${setupWorkspaceTestIds.overviewGroupProgressPrefix}-${group.id}`}
            >
              {group.progressText}
            </p>
            <p class="mt-2 text-[11px] text-text-muted">
              {group.blockedCount} blocked · {group.unconfirmedCount} unconfirmed
            </p>
          </div>
        </div>

        <div class="mt-4 grid gap-3 xl:grid-cols-2">
          {#each group.sections as section (section.id)}
            <div
              class="rounded-2xl border border-border bg-bg-secondary/60 p-4"
              data-testid={`${setupWorkspaceTestIds.overviewCardPrefix}-${section.id}`}
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-sm font-semibold text-text-primary">{section.title}</p>
                  <p class="mt-1 text-xs text-text-secondary">{section.description}</p>
                </div>
                <span class="rounded-full border border-border bg-bg-primary/80 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
                  {section.statusText}
                </span>
              </div>

              {#if section.confidenceText}
                <p class="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                  {section.confidenceText}
                </p>
              {/if}

              <p class="mt-3 text-sm leading-6 text-text-secondary">{section.detailText}</p>

              {#if section.gateText}
                <p class="mt-3 text-sm leading-6 text-warning">{section.gateText}</p>
              {/if}

              <button
                class="mt-4 rounded-full border border-border bg-bg-primary/80 px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
                onclick={() => onSelect(section.id)}
                type="button"
              >
                {section.availability === "available" ? `Open ${section.title}` : `Inspect ${section.title}`}
              </button>
            </div>
          {/each}
        </div>
      </article>
    {/each}
  </div>

  <div
    class="rounded-2xl border border-border bg-bg-primary/80 px-4 py-4 text-sm leading-6 text-text-secondary"
    data-testid={setupWorkspaceTestIds.detailRecovery}
  >
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="max-w-3xl">
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Recovery path</p>
        <p class="mt-2">
          Full Parameters stays separate as the raw recovery path, so staged edits continue to flow through the shared shell-owned review tray instead of a setup-local apply queue.
        </p>
      </div>
      <button
        class="rounded-full border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
        data-testid={setupWorkspaceTestIds.overviewRecoveryAction}
        onclick={() => onSelect("full_parameters")}
        type="button"
      >
        Open Full Parameters
      </button>
    </div>
  </div>
</section>
