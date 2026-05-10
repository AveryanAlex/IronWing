<script lang="ts">
import { fromStore } from "svelte/store";

import { getParamsStoreContext } from "../../app/shell/runtime-context";
import { resolveDocsUrl } from "../../data/ardupilot-docs";
import { createParameterFileIo } from "../../lib/params/parameter-file-io";
import type { SetupWorkspaceStoreState } from "../../lib/stores/setup-workspace";
import { setupWorkspaceTestIds } from "./setup-workspace-test-ids";

let {
  view,
  onSelect,
}: {
  view: SetupWorkspaceStoreState;
  onSelect: (sectionId: string) => void;
} = $props();

const fileIo = createParameterFileIo();
const paramsStore = getParamsStoreContext();
const paramsState = fromStore(paramsStore);

let fileActionMessage = $state("Imports stage changed values in the shared review tray.");
let fileActionBusy = $state<"refresh" | "save" | "load" | null>(null);
let paramsReady = $derived(paramsState.current.paramStore !== null);
let refreshDisabled = $derived(fileActionBusy !== null || !paramsState.current.liveSessionConnected);
let fileDisabled = $derived(fileActionBusy !== null || !paramsReady);
let fullParametersSection = $derived(view.sections.find((section) => section.id === "full_parameters") ?? null);
let fullParametersDisabled = $derived(fullParametersSection?.availability === "blocked");

async function handleRefresh() {
  if (refreshDisabled) {
    return;
  }

  fileActionBusy = "refresh";
  fileActionMessage = "Requesting a fresh parameter download from the vehicle.";
  try {
    await paramsStore.downloadAll();
    fileActionMessage = "Parameter refresh requested.";
  } catch (error) {
    fileActionMessage = `Refresh failed: ${formatActionError(error)}`;
  } finally {
    fileActionBusy = null;
  }
}

async function handleSave() {
  if (fileDisabled) {
    return;
  }

  fileActionBusy = "save";
  fileActionMessage = "Saving the current parameter snapshot.";
  try {
    const result = await fileIo.exportToPicker({ paramStore: paramsState.current.paramStore });
    fileActionMessage = result.status === "cancelled"
      ? "Save cancelled."
      : `Saved ${result.paramCount} parameter${result.paramCount === 1 ? "" : "s"}.`;
  } catch (error) {
    fileActionMessage = `Save failed: ${formatActionError(error)}`;
  } finally {
    fileActionBusy = null;
  }
}

async function handleLoad() {
  if (fileDisabled) {
    return;
  }

  fileActionBusy = "load";
  fileActionMessage = "Loading a parameter file for review.";
  try {
    const result = await fileIo.importFromPicker({
      paramStore: paramsState.current.paramStore,
      metadata: paramsState.current.metadata,
    });
    if (result.status === "success") {
      for (const row of result.stagedRows) {
        paramsStore.stageParameterEdit(row.item, row.nextValue);
      }
      fileActionMessage = `Loaded ${result.totalRows} row${result.totalRows === 1 ? "" : "s"}; staged ${result.stagedCount} changed value${result.stagedCount === 1 ? "" : "s"}.`;
    } else {
      fileActionMessage = "Load cancelled.";
    }
  } catch (error) {
    fileActionMessage = `Load failed: ${formatActionError(error)}`;
  } finally {
    fileActionBusy = null;
  }
}

function formatActionError(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return "Unknown parameter action error.";
}

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
    return "Review setup progress before opening a section";
  }

  return "Overview is fully live";
});
let bannerBody = $derived.by(() => {
  if (view.metadataState === "unavailable") {
    return "Guided editors are blocked because parameter labels and option lists are unavailable. You can still review setup status here and use Full Parameters to inspect the raw list.";
  }

  if (view.readiness === "bootstrapping") {
    return "Keep the dashboard open while session and parameter domains finish bootstrapping. Unknown sections remain unconfirmed until live facts arrive.";
  }

  if (view.readiness === "degraded") {
    return "Some setup details are limited right now. Use this dashboard to see what is ready, then open Full Parameters when a guided section cannot show enough detail.";
  }

  if (unknownCount > 0 || blockedCount > 0) {
    return `${blockedCount} blocked and ${unknownCount} unconfirmed sections remain visible instead of disappearing from the expert path.`;
  }

  return "Open a section below to inspect settings and queue changes in the review tray.";
});
let overviewMetrics = $derived([
  {
    id: "inventory",
    label: "Sections available here",
    value: `${guidedSections.length} sections`,
    detail: `${guidedGroups.length} groups · ${implementedCount} ready here`,
  },
  {
    id: "progress",
    label: "Setup progress",
    value: view.progressText,
    detail: `${availableCount} available · ${blockedCount} blocked`,
  },
  {
    id: "status",
    label: "Needs review",
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

function sectionIsComingLater(section: SetupWorkspaceStoreState["sections"][number]): boolean {
  return section.kind === "guided" && !section.implemented;
}

let overviewMode = $derived.by(() => {
  if (!paramsReady) {
    return view.liveSessionConnected ? "needs_params" : "disconnected";
  }

  if (view.metadataState === "idle" || view.metadataState === "loading") {
    return "loading_metadata";
  }

  if (view.metadataState === "unavailable") {
    return "metadata_failed";
  }

  return "ready";
});

let refreshCopy = $derived(fileActionBusy === "refresh" ? "Downloading..." : "Download parameters");
</script>

<section class="space-y-4" data-testid={setupWorkspaceTestIds.overviewSection}>
  {#if overviewMode === "disconnected"}
    <div class="rounded-lg border border-border bg-bg-primary/80 px-4 py-4 text-text-secondary" data-testid={setupWorkspaceTestIds.overviewBanner}>
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Overview</p>
      <h3 class="mt-2 text-lg font-semibold text-text-primary">Connect to a vehicle to begin setup</h3>
      <p class="mt-2 text-sm leading-6">Setup editors stay locked until a live vehicle session is connected.</p>
    </div>
  {:else if overviewMode === "needs_params"}
    <div class="rounded-lg border border-border bg-bg-primary/80 px-4 py-4 text-text-secondary" data-testid={setupWorkspaceTestIds.overviewBanner}>
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Overview</p>
      <h3 class="mt-2 text-lg font-semibold text-text-primary">Download parameters to continue</h3>
      <p class="mt-2 text-sm leading-6">Setup editors stay locked until the vehicle parameter list has been downloaded.</p>
      <div class="mt-4 flex flex-wrap gap-2">
        <button
          class="rounded-md border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
          disabled={refreshDisabled}
          onclick={handleRefresh}
          type="button"
        >
          {refreshCopy}
        </button>
      </div>
      <p class="mt-3 text-xs text-text-muted">{fileActionMessage}</p>
    </div>
  {:else if overviewMode === "loading_metadata"}
    <div class="rounded-lg border border-border bg-bg-primary/80 px-4 py-4 text-text-secondary" data-testid={setupWorkspaceTestIds.overviewBanner}>
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Overview</p>
      <h3 class="mt-2 text-lg font-semibold text-text-primary">Loading parameter descriptions</h3>
      <p class="mt-2 text-sm leading-6">Setup editors stay locked until parameter descriptions finish loading.</p>
    </div>
  {:else}
    <div class={`rounded-lg border px-4 py-4 ${bannerTone}`} data-testid={setupWorkspaceTestIds.overviewBanner}>
      <p class="text-xs font-semibold uppercase tracking-[0.18em]">Overview</p>
      <h3 class="mt-2 text-lg font-semibold text-text-primary">{bannerTitle}</h3>
      <p class="mt-2 text-sm leading-6">{bannerBody}</p>
    </div>

    <div class="grid gap-3 xl:grid-cols-3">
      {#each overviewMetrics as metric (metric.id)}
        <article
          class="rounded-lg border border-border bg-bg-primary/80 p-3"
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
            class="rounded-lg border border-border bg-bg-primary/80 p-3 transition hover:border-accent hover:text-accent"
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

    <div class="rounded-lg border border-border bg-bg-primary/80 p-4">
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Parameter actions</p>
      <p class="mt-2 text-sm text-text-secondary">Refresh all values from the vehicle, or save/load a parameter file snapshot. File imports stage changes in the review tray.</p>
      <div class="mt-4 flex flex-wrap gap-2">
        <button
          class="rounded-md border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
          disabled={refreshDisabled}
          onclick={handleRefresh}
          type="button"
        >
          {fileActionBusy === "refresh" ? "Refreshing..." : "Refresh all"}
        </button>
        <button
          class="rounded-md border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
          disabled={fileDisabled}
          onclick={handleSave}
          type="button"
        >
          {fileActionBusy === "save" ? "Saving..." : "Save to file"}
        </button>
        <button
          class="rounded-md border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
          disabled={fileDisabled}
          onclick={handleLoad}
          type="button"
        >
          {fileActionBusy === "load" ? "Loading..." : "Load from file"}
        </button>
      </div>
      <p class="mt-3 text-xs text-text-muted">{fileActionMessage}</p>
    </div>
  {/if}

  {#if view.statusNotices.length > 0}
    <div
      class="rounded-lg border border-border bg-bg-secondary/60 p-4"
      data-testid={setupWorkspaceTestIds.notices}
    >
      <p class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Status text</p>
      <ul class="mt-3 space-y-2">
        {#each view.statusNotices as notice (notice.id)}
          <li
            class="rounded-md border border-border bg-bg-primary px-3 py-2 text-sm text-text-secondary"
            data-testid={`${setupWorkspaceTestIds.statusNoticePrefix}-${notice.id}`}
          >
            {notice.text}
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if overviewMode === "ready" || overviewMode === "metadata_failed"}
    <div class="flex flex-wrap gap-2">
      <button
        class="rounded-md border border-border bg-bg-primary/80 px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
        data-testid={`${setupWorkspaceTestIds.overviewQuickActionPrefix}-frame_orientation`}
        onclick={() => onSelect("frame_orientation")}
        type="button"
      >
        Open Frame &amp; orientation
      </button>
      <button
        class="rounded-md border border-border bg-bg-primary/80 px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
        data-testid={`${setupWorkspaceTestIds.overviewQuickActionPrefix}-flight_modes`}
        onclick={() => onSelect("flight_modes")}
        type="button"
      >
        Open Flight modes
      </button>
      <button
        class="rounded-md border border-border bg-bg-primary/80 px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
        data-testid={`${setupWorkspaceTestIds.overviewQuickActionPrefix}-full_parameters`}
        disabled={fullParametersDisabled}
        onclick={() => onSelect("full_parameters")}
        type="button"
      >
        Open Full Parameters
      </button>
    </div>

    <div class="space-y-4">
      {#each guidedGroups as group (group.id)}
        <article
          class={`rounded-lg border p-3 ${groupTone(group.blockedCount, group.progressText)}`}
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
                {group.sections.length} sections · {group.implementedCount} ready here
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
                class="rounded-lg border border-border bg-bg-secondary/60 p-3"
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
                  <p
                    class="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted"
                    data-testid={`${setupWorkspaceTestIds.sectionConfidencePrefix}-${section.id}`}
                  >
                    {section.confidenceText}
                  </p>
                {/if}

                <p class="mt-3 text-sm leading-6 text-text-secondary">{section.detailText}</p>

                {#if section.gateText}
                  <p class="mt-3 text-sm leading-6 text-warning">{section.gateText}</p>
                {/if}

                {#if sectionIsComingLater(section)}
                  <p class="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Coming later</p>
                {:else}
                  <button
                    class="mt-4 rounded-md border border-border bg-bg-primary/80 px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
                    onclick={() => onSelect(section.id)}
                    type="button"
                  >
                    {section.availability === "available" ? `Open ${section.title}` : `Inspect ${section.title}`}
                  </button>
                {/if}
              </div>
            {/each}
          </div>
        </article>
      {/each}
    </div>

    <div
      class="rounded-lg border border-border bg-bg-primary/80 px-4 py-4 text-sm leading-6 text-text-secondary"
      data-testid={setupWorkspaceTestIds.detailRecovery}
    >
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="max-w-3xl">
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Recovery path</p>
          <p class="mt-2">
            Full Parameters stays separate from the guided sections. Open Full Parameters to inspect settings not covered above, check blocked items, and queue raw changes in the review tray.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            class="rounded-md border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
            data-testid={setupWorkspaceTestIds.overviewWizardLaunch}
            onclick={() => onSelect("beginner_wizard")}
            type="button"
          >
            Start beginner wizard
          </button>
          <button
            class="rounded-md border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
            data-testid={setupWorkspaceTestIds.overviewRecoveryAction}
            disabled={fullParametersDisabled}
            onclick={() => onSelect("full_parameters")}
            type="button"
          >
            Open Full Parameters
          </button>
        </div>
      </div>
    </div>
  {/if}
</section>
