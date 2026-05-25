<script lang="ts">
import { Download, Plug, X } from "lucide-svelte";
import { fromStore } from "svelte/store";

import { getParamsStoreContext } from "../../../app/shell/runtime-context";
import { resolveDocsUrl } from "../../../data/ardupilot-docs";
import { createParameterFileIo } from "../../../lib/params/parameter-file-io";
import { paramProgressCounts, paramProgressPhase } from "../../../params";
import type { SetupWorkspaceStoreState } from "../../../lib/stores/setup-workspace";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";
import SetupCard from "../shared/SetupCard.svelte";
import SetupCardHeader from "../shared/SetupCardHeader.svelte";
import SetupContentPanel from "../shared/SetupContentPanel.svelte";
import SetupIntroCard from "../shared/SetupIntroCard.svelte";
import SetupNotice from "../shared/SetupNotice.svelte";
import SetupStatusPill from "../shared/SetupStatusPill.svelte";

type NoticeTone = "info" | "warning" | "danger" | "success";

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
let flightModesSection = $derived(view.sections.find((section) => section.id === "flight_modes") ?? null);
let fullParametersDisabled = $derived(fullParametersSection?.availability === "blocked");
let flightModesDisabled = $derived(flightModesSection?.availability === "blocked");
let paramProgress = $derived(paramsState.current.paramProgress);
let paramProgressPhaseValue = $derived(paramProgress ? paramProgressPhase(paramProgress) : null);
let paramProgressCountsValue = $derived(paramProgress ? paramProgressCounts(paramProgress) : null);
let downloadInFlight = $derived(paramProgressPhaseValue === "downloading");
let downloadProgressPct = $derived.by(() => {
  if (!downloadInFlight || !paramProgressCountsValue?.expected || paramProgressCountsValue.expected <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round((paramProgressCountsValue.received / paramProgressCountsValue.expected) * 100)));
});

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

async function handleCancelDownload() {
  try {
    await paramsStore.cancelDownload();
  } catch (error) {
    fileActionMessage = `Cancel failed: ${formatActionError(error)}`;
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
let bannerTone = $derived.by<NoticeTone>(() => {
  if (view.metadataState === "unavailable" || view.readiness === "degraded") {
    return "warning";
  }

  if (unknownCount > 0 || blockedCount > 0) {
    return "info";
  }

  return "success";
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
  if (!view.liveSessionConnected) {
    return "disconnected";
  }

  if (!paramsReady) {
    return "needs_params";
  }

  if (view.metadataState !== "ready") {
    return "needs_metadata";
  }

  return "ready";
});

let refreshCopy = $derived(fileActionBusy === "refresh" ? "Downloading..." : "Download parameters");
</script>

<section class="space-y-4" data-testid={setupWorkspaceTestIds.overviewSection}>
  <SetupIntroCard
    sectionId="overview"
    title="Overview"
    description="Review setup readiness, download vehicle parameters, and open guided setup sections from one place."
  />

  <SetupContentPanel>
  {#if overviewMode === "disconnected"}
    <SetupCard class="px-6 py-10 text-center text-text-secondary" testId={setupWorkspaceTestIds.overviewBanner}>
      <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-accent/30 bg-accent/15 text-accent shadow-lg shadow-accent/10">
        <Plug aria-hidden="true" size={30} />
      </div>
      <h3 class="mt-6 text-2xl font-semibold text-text-primary">Connect vehicle to get started</h3>
      <p class="mx-auto mt-3 max-w-xl text-sm leading-7 text-text-secondary">
        Setup editors unlock after IronWing connects to a live vehicle session.
      </p>
    </SetupCard>
  {:else if overviewMode === "needs_params"}
    <div class="space-y-4">
      <SetupCard variant="primary" class="grid gap-3 sm:grid-cols-3">
        <div>
          <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">Type</p>
          <p class="mt-2 text-lg font-semibold text-text-primary">{view.activeEnvelope ? "Connected vehicle" : "Waiting"}</p>
        </div>
        <div>
          <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">Autopilot</p>
          <p class="mt-2 text-lg font-semibold text-text-primary">Live session</p>
        </div>
        <div>
          <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">Setup access</p>
          <p class="mt-2 text-lg font-semibold text-text-primary">Overview only</p>
        </div>
      </SetupCard>

      <SetupCard class="border-accent/30 bg-accent/5 px-6 py-8 text-center" testId={setupWorkspaceTestIds.overviewBanner}>
        <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent/15 text-accent">
          <Download aria-hidden="true" size={24} />
        </div>
        <h3 class="mt-6 text-2xl font-semibold text-text-primary">Download Parameters to Get Started</h3>
        <p class="mx-auto mt-4 max-w-2xl text-sm leading-7 text-text-secondary">
          Vehicle parameters define your aircraft's configuration — frame type, sensor calibration, flight modes, safety limits, and more. Download them to unlock setup sections.
        </p>

        <div class="mt-6 flex justify-center">
          {#if downloadInFlight}
            <button
              class="inline-flex items-center gap-2 rounded-md border border-danger/40 bg-danger/10 px-5 py-2.5 text-sm font-semibold text-danger transition hover:bg-danger/15"
              onclick={handleCancelDownload}
              type="button"
            >
              <X aria-hidden="true" size={16} />
              Cancel
            </button>
          {:else}
            <button
              class="inline-flex items-center gap-2 rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-bg-primary transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={refreshDisabled}
              onclick={handleRefresh}
              type="button"
            >
              <Download aria-hidden="true" size={16} />
              Download Parameters
            </button>
          {/if}
        </div>

        {#if downloadInFlight}
          <div class="mx-auto mt-5 max-w-sm">
            <div class="h-2 overflow-hidden rounded-full bg-bg-secondary">
              <div class="h-full rounded-full bg-accent transition-all duration-300" style={`width: ${downloadProgressPct}%`}></div>
            </div>
            <p class="mt-2 text-sm text-text-muted">
              {paramProgressCountsValue?.received ?? 0} / {paramProgressCountsValue?.expected ?? "?"} parameters
            </p>
          </div>
        {/if}
      </SetupCard>
    </div>
  {:else if overviewMode === "needs_metadata"}
    <div class="space-y-4">
      <SetupNotice tone="success">
        <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">Overview</p>
        <p class="mt-2 text-sm font-semibold text-text-primary">
          Parameters downloaded — {Object.keys(paramsState.current.paramStore?.params ?? {}).length} parameters
        </p>
      </SetupNotice>

      <SetupCard variant="primary" class="px-6 py-6 text-center" testId={setupWorkspaceTestIds.overviewBanner}>
        <h3 class="text-xl font-semibold text-text-primary">
          {view.metadataState === "unavailable" ? "Parameter descriptions are unavailable" : "Loading parameter descriptions"}
        </h3>
        <p class="mx-auto mt-3 max-w-2xl text-sm leading-7 text-text-secondary">
          {view.metadataState === "unavailable"
            ? "Guided setup sections stay locked because labels, ranges, and option lists are unavailable for this vehicle. Full Parameters remains available as the only editor until descriptions are restored."
            : "Guided setup sections stay locked until parameter descriptions finish loading. Full Parameters is available if you need raw access while descriptions settle."}
        </p>

        <div class="mt-6 flex flex-wrap justify-center gap-3">
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
      </SetupCard>
    </div>
  {:else}
    <SetupNotice tone={bannerTone} testId={setupWorkspaceTestIds.overviewBanner}>
      <p class="text-xs font-semibold uppercase tracking-widest">Overview</p>
      <h3 class="mt-2 text-lg font-semibold text-text-primary">{bannerTitle}</h3>
      <p class="mt-2 text-sm leading-6">{bannerBody}</p>
    </SetupNotice>

    <div class="grid gap-3 xl:grid-cols-3">
      {#each overviewMetrics as metric (metric.id)}
        <SetupCard variant="primary" class="p-3" testId={`${setupWorkspaceTestIds.overviewMetricPrefix}-${metric.id}`}>
          <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">{metric.label}</p>
          <p class="mt-2 text-base font-semibold text-text-primary">{metric.value}</p>
          <p class="mt-2 text-sm leading-6 text-text-secondary">{metric.detail}</p>
        </SetupCard>
      {/each}
    </div>

    <div class="grid gap-3 xl:grid-cols-3">
      {#each overviewDocs as doc (doc.id)}
        {#if doc.url}
          <a
            class="rounded-lg border border-border bg-bg-tertiary/50 p-3 transition hover:border-accent hover:text-accent"
            data-testid={`${setupWorkspaceTestIds.overviewDocLinkPrefix}-${doc.id}`}
            href={doc.url}
            rel="noreferrer"
            target="_blank"
          >
            <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">Docs</p>
            <p class="mt-2 text-base font-semibold text-text-primary">{doc.label}</p>
            <p class="mt-2 text-sm leading-6 text-text-secondary">{doc.detail}</p>
          </a>
        {/if}
      {/each}
    </div>

    <SetupCard variant="primary">
      <SetupCardHeader title="Parameter actions" />
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
    </SetupCard>
  {/if}

  {#if view.statusNotices.length > 0}
    <SetupCard testId={setupWorkspaceTestIds.notices}>
      <SetupCardHeader title="Status text" />
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
    </SetupCard>
  {/if}

  {#if overviewMode === "ready"}
    <div class="flex flex-wrap gap-2">
      <button
        class="rounded-md border border-border bg-bg-primary/80 px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
        data-testid={`${setupWorkspaceTestIds.overviewQuickActionPrefix}-frame_orientation`}
        disabled={view.sections.find((section) => section.id === "frame_orientation")?.availability === "blocked"}
        onclick={() => onSelect("frame_orientation")}
        type="button"
      >
        Open Frame &amp; orientation
      </button>
      <button
        class="rounded-md border border-border bg-bg-primary/80 px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
        data-testid={`${setupWorkspaceTestIds.overviewQuickActionPrefix}-flight_modes`}
        disabled={flightModesDisabled}
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
        <SetupCard class={`p-3 ${groupTone(group.blockedCount, group.progressText)}`} testId={`${setupWorkspaceTestIds.overviewGroupPrefix}-${group.id}`}>
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">{group.title}</p>
              <p class="mt-1 text-sm leading-6 text-text-secondary">{group.description}</p>
              <p
                class="mt-2 text-xs text-text-muted"
                data-testid={`${setupWorkspaceTestIds.overviewGroupCountPrefix}-${group.id}`}
              >
                {group.sections.length} sections · {group.implementedCount} ready here
              </p>
            </div>
            <div class="text-right">
                <SetupStatusPill tone="muted" testId={`${setupWorkspaceTestIds.overviewGroupProgressPrefix}-${group.id}`}>
                  {group.progressText}
                </SetupStatusPill>
              <p class="mt-2 text-xs text-text-muted">
                {group.blockedCount} blocked · {group.unconfirmedCount} unconfirmed
              </p>
            </div>
          </div>

          <div class="mt-4 grid gap-3 xl:grid-cols-2">
            {#each group.sections as section (section.id)}
              <SetupCard class="p-3" testId={`${setupWorkspaceTestIds.overviewCardPrefix}-${section.id}`}>
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="text-sm font-semibold text-text-primary">{section.title}</p>
                    <p class="mt-1 text-xs text-text-secondary">{section.description}</p>
                  </div>
                  <SetupStatusPill tone="muted">
                    {section.statusText}
                  </SetupStatusPill>
                </div>

                {#if section.confidenceText}
                  <p
                    class="mt-3 text-xs font-semibold uppercase tracking-widest text-text-muted"
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
                  <p class="mt-4 text-xs font-semibold uppercase tracking-widest text-text-muted">Coming later</p>
                {:else if section.availability === "blocked"}
                  <p class="mt-4 text-xs font-semibold uppercase tracking-widest text-text-muted">
                    {section.gateText ?? "Locked until setup is ready"}
                  </p>
                {:else}
                  <button
                    class="mt-4 rounded-md border border-border bg-bg-primary/80 px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
                    onclick={() => onSelect(section.id)}
                    type="button"
                  >
                    {`Open ${section.title}`}
                  </button>
                {/if}
              </SetupCard>
            {/each}
          </div>
        </SetupCard>
      {/each}
    </div>

    <SetupCard variant="primary" class="text-sm leading-6 text-text-secondary" testId={setupWorkspaceTestIds.detailRecovery}>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="max-w-3xl">
          <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">Recovery path</p>
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
    </SetupCard>
  {/if}
  </SetupContentPanel>
</section>
