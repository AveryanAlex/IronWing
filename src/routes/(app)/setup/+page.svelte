<script lang="ts">
import { fromStore } from "svelte/store";

import { getParamsStoreContext } from "../../../app/shell/runtime-context";
import { resolveDocsUrl } from "../../../data/ardupilot-docs";
import { createParameterFileIo } from "../../../lib/params/parameter-file-io";
import type { SetupWorkspaceStoreState } from "../../../lib/stores/setup-workspace";
import { setupWorkspaceTestIds } from "../../../features/setup/setup-workspace-test-ids";
import { ActionRow, Button, Card, ExternalLink, Eyebrow, FactTile, HelperText } from "../../../components/ui";
import SetupCard from "../../../features/setup/shared/SetupCard.svelte";
import SetupCardHeader from "../../../features/setup/shared/SetupCardHeader.svelte";
import SetupContentPanel from "../../../features/setup/shared/SetupContentPanel.svelte";
import SetupIntroCard from "../../../features/setup/shared/SetupIntroCard.svelte";
import SetupNotice from "../../../features/setup/shared/SetupNotice.svelte";
import SetupStatusPill from "../../../features/setup/shared/SetupStatusPill.svelte";
import { getSetupWorkspaceRouteContext } from "../../../features/setup/components/setup-workspace-route-context";

const route = getSetupWorkspaceRouteContext();
const viewStore = fromStore(route.viewStore);

let view = $derived(viewStore.current);
const onSelect = route.selectSection;

type NoticeTone = "info" | "warning" | "danger" | "success";

const fileIo = createParameterFileIo();
const paramsStore = getParamsStoreContext();
const paramsState = fromStore(paramsStore);

let fileActionMessage = $state("Imports stage changed values in the shared review tray.");
let fileActionBusy = $state<"refresh" | "save" | "load" | null>(null);
let paramsReady = $derived(paramsState.current.paramStore !== null);
let refreshDisabled = $derived(fileActionBusy !== null || !paramsState.current.liveSessionConnected);
let fileDisabled = $derived(fileActionBusy !== null || !paramsReady);

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
    fileActionMessage =
      result.status === "cancelled"
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
let implementedCount = $derived(guidedSections.filter((section) => section.implemented).length);
let inProgressCount = $derived(guidedSections.filter((section) => section.status === "in_progress").length);
let bannerTone = $derived.by<NoticeTone>(() => {
  if (view.metadataState === "unavailable" || view.readiness === "degraded") {
    return "warning";
  }

  if (unknownCount > 0) {
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
    return "Overview is live, with degraded setup data";
  }

  if (unknownCount > 0) {
    return "Review setup progress before opening a section";
  }

  return "Overview is fully live";
});
let bannerBody = $derived.by(() => {
  if (view.metadataState === "unavailable") {
    return "Guided editors remain reachable, but parameter labels, ranges, and option lists may be incomplete. Use Full Parameters when a guided section cannot show enough detail.";
  }

  if (view.readiness === "bootstrapping") {
    return "Keep the dashboard open while session and parameter domains finish bootstrapping. Unknown sections remain unconfirmed until live facts arrive.";
  }

  if (view.readiness === "degraded") {
    return "Some setup details are limited right now. Use this dashboard to see what is ready, then open any section or Full Parameters for deeper inspection.";
  }

  if (unknownCount > 0) {
    return `${unknownCount} unconfirmed sections remain visible while live setup facts settle.`;
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
    detail: `${implementedCount} ready here · ${unknownCount} unconfirmed`,
  },
  {
    id: "status",
    label: "Needs review",
    value: `${unknownCount} unconfirmed`,
    detail: `${inProgressCount} in progress · ${view.statusNotices.length} status notice${view.statusNotices.length === 1 ? "" : "s"}`,
  },
]);

function groupTone(progressText: string): string {
  if (/^\d+\/\d+ confirmed$/.test(progressText) && !progressText.startsWith("0/")) {
    return "border-border bg-bg-primary/80";
  }

  return "border-border bg-bg-primary/70";
}

function sectionIsComingLater(section: SetupWorkspaceStoreState["sections"][number]): boolean {
  return section.kind === "guided" && !section.implemented;
}
</script>

<section class="space-y-4" data-testid={setupWorkspaceTestIds.overviewSection}>
  <SetupIntroCard
    sectionId="overview"
    title="Overview"
    description="Review setup readiness, download vehicle parameters, and open guided setup sections from one place."
  />

  <SetupContentPanel>
    <SetupNotice tone={bannerTone} testId={setupWorkspaceTestIds.overviewBanner}>
      <Eyebrow tracking="widest">Overview</Eyebrow>
      <h3 class="mt-2 text-lg font-semibold text-text-primary">{bannerTitle}</h3>
      <p class="mt-2 text-sm leading-6">{bannerBody}</p>
    </SetupNotice>

    <div class="grid gap-3 xl:grid-cols-3">
      {#each overviewMetrics as metric (metric.id)}
        <FactTile label={metric.label} value={metric.value} detail={metric.detail} density="default" testId={`${setupWorkspaceTestIds.overviewMetricPrefix}-${metric.id}`} />
      {/each}
    </div>

    <div class="grid gap-3 xl:grid-cols-3">
      {#each overviewDocs as doc (doc.id)}
        {#if doc.url}
          <ExternalLink
            class="bg-bg-tertiary/50"
            href={doc.url}
            testId={`${setupWorkspaceTestIds.overviewDocLinkPrefix}-${doc.id}`}
            variant="card"
          >
            <span class="block">
              <Eyebrow as="span" tracking="widest">Docs</Eyebrow>
              <span class="mt-2 block text-base font-semibold text-text-primary">{doc.label}</span>
              <HelperText as="span" class="mt-2 block">{doc.detail}</HelperText>
            </span>
          </ExternalLink>
        {/if}
      {/each}
    </div>

    <SetupCard variant="primary">
      <SetupCardHeader title="Parameter actions" />
      <HelperText class="mt-2">Refresh all values from the vehicle, or save/load a parameter file snapshot. File imports stage changes in the review tray.</HelperText>
      <ActionRow align="start" class="mt-4">
        <Button
          variant="secondary"
          disabled={refreshDisabled}
          onclick={handleRefresh}
        >
          {fileActionBusy === "refresh" ? "Refreshing..." : "Refresh all"}
        </Button>
        <Button
          variant="secondary"
          disabled={fileDisabled}
          onclick={handleSave}
        >
          {fileActionBusy === "save" ? "Saving..." : "Save to file"}
        </Button>
        <Button
          variant="secondary"
          disabled={fileDisabled}
          onclick={handleLoad}
        >
          {fileActionBusy === "load" ? "Loading..." : "Load from file"}
        </Button>
      </ActionRow>
      <HelperText class="mt-3" size="xs" tone="muted">{fileActionMessage}</HelperText>
    </SetupCard>

  {#if view.statusNotices.length > 0}
    <SetupCard testId={setupWorkspaceTestIds.notices}>
      <SetupCardHeader title="Status text" />
      <ul class="mt-3 space-y-2">
        {#each view.statusNotices as notice (notice.id)}
          <li data-testid={`${setupWorkspaceTestIds.statusNoticePrefix}-${notice.id}`}>
            <Card.Root density="compact" surface="primary" class="text-sm text-text-secondary">
              {notice.text}
            </Card.Root>
          </li>
        {/each}
      </ul>
    </SetupCard>
  {/if}

  <ActionRow align="start">
    <Button
      variant="outline"
      testId={`${setupWorkspaceTestIds.overviewQuickActionPrefix}-frame_orientation`}
      onclick={() => onSelect("frame_orientation")}
    >
      Open Frame &amp; orientation
    </Button>
    <Button
      variant="outline"
      testId={`${setupWorkspaceTestIds.overviewQuickActionPrefix}-flight_modes`}
      onclick={() => onSelect("flight_modes")}
    >
      Open Flight modes
    </Button>
    <Button
      variant="outline"
      testId={`${setupWorkspaceTestIds.overviewQuickActionPrefix}-full_parameters`}
      onclick={() => onSelect("full_parameters")}
    >
      Open Full Parameters
    </Button>
  </ActionRow>

    <div class="space-y-4">
      {#each guidedGroups as group (group.id)}
        <SetupCard class={`p-3 ${groupTone(group.progressText)}`} testId={`${setupWorkspaceTestIds.overviewGroupPrefix}-${group.id}`}>
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Eyebrow tracking="widest">{group.title}</Eyebrow>
              <HelperText class="mt-1">{group.description}</HelperText>
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
              <HelperText class="mt-2" size="xs" tone="muted">
                {group.unconfirmedCount} unconfirmed
              </HelperText>
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
                  <Eyebrow
                    class="mt-3"
                    tracking="widest"
                    testId={`${setupWorkspaceTestIds.sectionConfidencePrefix}-${section.id}`}
                  >
                    {section.confidenceText}
                  </Eyebrow>
                {/if}

                <HelperText class="mt-3">{section.detailText}</HelperText>

                {#if sectionIsComingLater(section)}
                  <Eyebrow class="mt-4" tracking="widest">Coming later</Eyebrow>
                {:else}
                  <Button
                    variant="outline"
                    class="mt-4"
                    onclick={() => onSelect(section.id)}
                  >
                    {`Open ${section.title}`}
                  </Button>
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
          <Eyebrow tracking="widest">Recovery path</Eyebrow>
          <HelperText class="mt-2">
            Full Parameters stays separate from the guided sections. Open Full Parameters to inspect settings not covered above and queue raw changes in the review tray.
          </HelperText>
        </div>
        <ActionRow align="start">
          <Button
            variant="secondary"
            testId={setupWorkspaceTestIds.overviewWizardLaunch}
            onclick={() => onSelect("beginner_wizard")}
          >
            Start beginner wizard
          </Button>
            <Button
              variant="secondary"
              testId={setupWorkspaceTestIds.overviewRecoveryAction}
              onclick={() => onSelect("full_parameters")}
            >
            Open Full Parameters
          </Button>
        </ActionRow>
      </div>
    </SetupCard>
  </SetupContentPanel>
</section>
