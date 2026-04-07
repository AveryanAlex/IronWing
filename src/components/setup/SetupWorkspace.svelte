<script lang="ts">
import { fromStore } from "svelte/store";

import {
  getSetupWorkspaceStoreContext,
  getSetupWorkspaceViewStoreContext,
} from "../../app/shell/runtime-context";
import type { SetupWorkspaceSection } from "../../lib/stores/setup-workspace";
import ParameterWorkspace from "../params/ParameterWorkspace.svelte";
import { setupWorkspaceTestIds } from "./setup-workspace-test-ids";

const store = getSetupWorkspaceStoreContext();
const viewStore = fromStore(getSetupWorkspaceViewStoreContext());

let view = $derived(viewStore.current);
let selectedSection = $derived(
  view.sections.find((section) => section.id === view.selectedSectionId) ?? view.sections[0] ?? null,
);
let overviewSections = $derived(view.sections.filter((section) => section.kind === "guided"));

function selectSection(sectionId: string) {
  store.selectSection(sectionId);
}

function sectionTone(section: SetupWorkspaceSection): string {
  if (section.availability === "gated") {
    return "border-warning/40 bg-warning/10";
  }

  switch (section.status) {
    case "complete":
      return "border-success/40 bg-success/10";
    case "in_progress":
      return "border-accent/40 bg-accent/10";
    case "failed":
      return "border-danger/40 bg-danger/10";
    case "not_started":
      return "border-border bg-bg-secondary";
    case "unknown":
    default:
      return "border-border bg-bg-secondary";
  }
}
</script>

<section
  class="rounded-lg border border-border bg-bg-primary p-4"
  data-selected-section={view.selectedSectionId}
  data-setup-readiness={view.readiness}
  data-testid={setupWorkspaceTestIds.root}
>
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">Setup workspace</p>
      <h2 class="mt-1 text-base font-semibold text-text-primary">Truthful setup landing</h2>
      <p class="mt-1 max-w-3xl text-sm text-text-secondary">
        Overview stays mounted while the setup store composes session, support, configuration, calibration, status text, and parameter metadata into section-first truth.
      </p>
    </div>

    <p
      class="inline-flex items-center rounded-md border border-border bg-bg-secondary px-2 py-1 text-xs font-semibold text-text-secondary"
      data-testid={setupWorkspaceTestIds.state}
    >
      {view.stateText}
    </p>
  </div>

  <div class="mt-4 grid gap-2 md:grid-cols-3">
    <p
      class="rounded-lg border border-border bg-bg-secondary px-3 py-2 text-xs text-text-secondary"
      data-testid={setupWorkspaceTestIds.scope}
    >
      Scope · {view.scopeText}
    </p>
    <p
      class="rounded-lg border border-border bg-bg-secondary px-3 py-2 text-xs text-text-secondary"
      data-testid={setupWorkspaceTestIds.metadata}
    >
      Metadata · {view.metadataText}
    </p>
    <p
      class="rounded-lg border border-border bg-bg-secondary px-3 py-2 text-xs text-text-secondary"
      data-testid={setupWorkspaceTestIds.progress}
    >
      Progress · {view.progressText}
    </p>
  </div>

  {#if view.noticeText}
    <div
      class="mt-4 rounded-lg border border-warning/40 bg-warning/10 px-3 py-3 text-sm text-warning"
      data-testid={setupWorkspaceTestIds.notice}
    >
      {view.noticeText}
    </div>
  {/if}

  {#if view.checkpoint.phase !== "idle"}
    <div
      class="mt-4 rounded-lg border border-accent/40 bg-accent/10 px-3 py-3 text-sm text-accent"
      data-testid={setupWorkspaceTestIds.checkpoint}
    >
      {view.checkpoint.reason ?? "Setup checkpoint pending."}
    </div>
  {/if}

  {#if view.statusNotices.length > 0}
    <div class="mt-4 rounded-lg border border-border bg-bg-secondary/60 p-3" data-testid={setupWorkspaceTestIds.notices}>
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

  <div class="mt-4 grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
    <nav class="space-y-2" aria-label="Setup sections">
      {#each view.sections as section (section.id)}
        <button
          class={`w-full rounded-lg border px-3 py-3 text-left transition ${sectionTone(section)} ${view.selectedSectionId === section.id ? "ring-1 ring-accent" : ""} ${section.availability === "gated" ? "cursor-not-allowed opacity-80" : "hover:border-accent"}`}
          data-testid={`${setupWorkspaceTestIds.navPrefix}-${section.id}`}
          disabled={section.availability === "gated"}
          onclick={() => selectSection(section.id)}
          type="button"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-sm font-semibold text-text-primary">{section.title}</p>
              <p class="mt-1 text-xs text-text-secondary">{section.description}</p>
            </div>
            <span
              class="rounded-full border border-border bg-bg-primary/80 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary"
              data-testid={`${setupWorkspaceTestIds.sectionStatusPrefix}-${section.id}`}
            >
              {section.statusText}
            </span>
          </div>

          {#if section.confidenceText}
            <p
              class="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-text-muted"
              data-testid={`${setupWorkspaceTestIds.sectionConfidencePrefix}-${section.id}`}
            >
              {section.confidenceText}
            </p>
          {/if}

          {#if section.gateText}
            <p
              class="mt-2 text-xs text-warning"
              data-testid={`${setupWorkspaceTestIds.sectionGatePrefix}-${section.id}`}
            >
              {section.gateText}
            </p>
          {/if}
        </button>
      {/each}
    </nav>

    <div class="rounded-[24px] border border-border bg-bg-secondary/60 p-4" data-testid={setupWorkspaceTestIds.detail}>
      <span aria-hidden="true" class="sr-only" data-testid={setupWorkspaceTestIds.selectedSection}>
        {view.selectedSectionId}
      </span>

      {#if view.selectedSectionId === "overview"}
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Overview</p>
          <h3 class="mt-2 text-lg font-semibold text-text-primary">Section-first setup truth</h3>
          <p class="mt-2 text-sm leading-6 text-text-secondary">
            The active shell now lands on a dedicated setup workspace instead of aliasing directly to raw parameters. Guided sections stay explicit, and recovery stays separate.
          </p>

          <div class="mt-4 grid gap-3 md:grid-cols-3">
            {#each overviewSections as section (section.id)}
              <article
                class={`rounded-lg border p-3 ${sectionTone(section)}`}
                data-testid={`${setupWorkspaceTestIds.overviewCardPrefix}-${section.id}`}
              >
                <div class="flex items-start justify-between gap-2">
                  <div>
                    <p class="text-sm font-semibold text-text-primary">{section.title}</p>
                    <p class="mt-1 text-xs text-text-secondary">{section.description}</p>
                  </div>
                  <span class="rounded-full border border-border bg-bg-primary/80 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
                    {section.statusText}
                  </span>
                </div>

                {#if section.confidenceText}
                  <p class="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                    {section.confidenceText}
                  </p>
                {/if}

                <p class="mt-3 text-sm text-text-secondary">{section.detailText}</p>
              </article>
            {/each}
          </div>

          <div
            class="mt-4 rounded-lg border border-border bg-bg-primary/80 px-4 py-4 text-sm text-text-secondary"
            data-testid={setupWorkspaceTestIds.detailRecovery}
          >
            Full Parameters stays separate as the raw recovery path so staged edits still flow through the shared shell-owned review tray.
          </div>
        </div>
      {:else if view.selectedSectionId === "full_parameters"}
        <div data-testid={setupWorkspaceTestIds.fullParameters}>
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Full Parameters</p>
          <h3 class="mt-2 text-lg font-semibold text-text-primary">Recovery stays explicit</h3>
          <p class="mt-2 text-sm leading-6 text-text-secondary">
            Raw parameter browsing remains available here as the recovery surface. The shell review tray still owns staging, apply progress, and retained failures.
          </p>

          {#if view.canOpenFullParameters}
            <div class="mt-4">
              <ParameterWorkspace />
            </div>
          {:else}
            <div class="mt-4 rounded-lg border border-warning/40 bg-warning/10 px-3 py-3 text-sm text-warning">
              Full Parameters recovery is disabled for the current scope.
            </div>
          {/if}
        </div>
      {:else if selectedSection}
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">{selectedSection.title}</p>
          <h3 class="mt-2 text-lg font-semibold text-text-primary">{selectedSection.statusText}</h3>
          <p class="mt-2 text-sm leading-6 text-text-secondary" data-testid={setupWorkspaceTestIds.detailStatus}>
            {selectedSection.detailText}
          </p>

          {#if selectedSection.gateText}
            <div class="mt-4 rounded-lg border border-warning/40 bg-warning/10 px-3 py-3 text-sm text-warning">
              {selectedSection.gateText}
            </div>
          {:else}
            <div class="mt-4 rounded-lg border border-border bg-bg-primary/80 px-3 py-3 text-sm text-text-secondary">
              The dedicated controls for {selectedSection.title.toLowerCase()} land next in this slice. The setup store already carries truthful live status and keeps recovery separate.
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</section>
