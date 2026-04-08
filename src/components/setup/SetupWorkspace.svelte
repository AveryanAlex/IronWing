<script lang="ts">
import { fromStore } from "svelte/store";

import {
  getSetupWorkspaceStoreContext,
  getSetupWorkspaceViewStoreContext,
} from "../../app/shell/runtime-context";
import SetupCalibrationSection from "./SetupCalibrationSection.svelte";
import SetupCheckpointBanner from "./SetupCheckpointBanner.svelte";
import SetupFrameOrientationSection from "./SetupFrameOrientationSection.svelte";
import SetupFullParametersSection from "./SetupFullParametersSection.svelte";
import SetupMotorsEscSection from "./SetupMotorsEscSection.svelte";
import SetupOverviewSection from "./SetupOverviewSection.svelte";
import SetupRcReceiverSection from "./SetupRcReceiverSection.svelte";
import SetupServoOutputsSection from "./SetupServoOutputsSection.svelte";
import SetupWorkspaceSectionNav from "./SetupWorkspaceSectionNav.svelte";
import { setupWorkspaceTestIds } from "./setup-workspace-test-ids";

const store = getSetupWorkspaceStoreContext();
const viewStore = fromStore(getSetupWorkspaceViewStoreContext());

let view = $derived(viewStore.current);
let selectedSection = $derived(
  view.sections.find((section) => section.id === view.selectedSectionId) ?? view.sections[0] ?? null,
);

function selectSection(sectionId: string) {
  store.selectSection(sectionId);
}

function clearCheckpoint() {
  store.clearCheckpointPlaceholder();
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
      <h2 class="mt-1 text-base font-semibold text-text-primary">Section-first expert setup</h2>
      <p class="mt-1 max-w-3xl text-sm text-text-secondary">
        The full expert path stays grouped and explicit here. Hardware, safety, tuning, and recovery sections stay visible even when they are blocked, unconfirmed, or still waiting on purpose-built controls.
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

  <SetupCheckpointBanner checkpoint={view.checkpoint} onClear={clearCheckpoint} />

  {#if view.statusNotices.length > 0}
    <div
      class="mt-4 rounded-lg border border-border bg-bg-secondary/60 p-3"
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

  <div class="mt-4 grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
    <SetupWorkspaceSectionNav
      onSelect={selectSection}
      sectionGroups={view.sectionGroups}
      selectedSectionId={view.selectedSectionId}
    />

    <div class="rounded-[24px] border border-border bg-bg-secondary/60 p-4" data-testid={setupWorkspaceTestIds.detail}>
      <span aria-hidden="true" class="sr-only" data-testid={setupWorkspaceTestIds.selectedSection}>
        {view.selectedSectionId}
      </span>

      {#if view.selectedSectionId === "overview"}
        <SetupOverviewSection {view} onSelect={selectSection} />
      {:else if view.selectedSectionId === "frame_orientation" && selectedSection}
        <SetupFrameOrientationSection
          checkpoint={view.checkpoint}
          onSelectRecovery={() => selectSection("full_parameters")}
          section={selectedSection}
        />
      {:else if view.selectedSectionId === "motors_esc" && selectedSection}
        <SetupMotorsEscSection
          onSelectRecovery={() => selectSection("full_parameters")}
          section={selectedSection}
          {view}
        />
      {:else if view.selectedSectionId === "servo_outputs" && selectedSection}
        <SetupServoOutputsSection
          onSelectRecovery={() => selectSection("full_parameters")}
          section={selectedSection}
          {view}
        />
      {:else if view.selectedSectionId === "rc_receiver"}
        <SetupRcReceiverSection {view} />
      {:else if view.selectedSectionId === "calibration"}
        <SetupCalibrationSection {view} />
      {:else if view.selectedSectionId === "full_parameters"}
        <SetupFullParametersSection canOpen={view.canOpenFullParameters} />
      {:else if selectedSection}
        <div class="space-y-4" data-testid={setupWorkspaceTestIds.plannedSection}>
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">{selectedSection.groupTitle}</p>
              <h3 class="mt-2 text-lg font-semibold text-text-primary">{selectedSection.title}</h3>
              <p class="mt-2 text-sm leading-6 text-text-secondary">{selectedSection.description}</p>
            </div>
            <div class="text-right">
              <p class="rounded-full border border-border bg-bg-primary/80 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
                {selectedSection.statusText}
              </p>
              <p class="mt-2 text-[11px] text-text-muted">
                {selectedSection.availability === "available" ? "Inspectable" : "Blocked but inspectable"}
              </p>
            </div>
          </div>

          {#if selectedSection.confidenceText}
            <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
              {selectedSection.confidenceText}
            </p>
          {/if}

          <p class="text-sm leading-6 text-text-secondary" data-testid={setupWorkspaceTestIds.detailStatus}>
            {selectedSection.detailText}
          </p>

          {#if selectedSection.gateText}
            <div class="rounded-2xl border border-warning/40 bg-warning/10 px-4 py-4 text-sm leading-6 text-warning">
              {selectedSection.gateText}
            </div>
          {/if}

          <div class="rounded-2xl border border-border bg-bg-primary/80 px-4 py-4 text-sm leading-6 text-text-secondary">
            {#if selectedSection.implemented}
              This expert section already has a dedicated surface elsewhere in the workspace; this fallback panel only appears when the selection contract gets ahead of the mounted detail components.
            {:else}
              This section scaffold keeps current-scope status, blocking reasons, and recovery guidance visible until its dedicated editor lands later in the slice.
            {/if}
          </div>

          <button
            class="rounded-full border border-border bg-bg-primary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
            data-testid={setupWorkspaceTestIds.plannedSectionRecovery}
            onclick={() => selectSection("full_parameters")}
            type="button"
          >
            Open Full Parameters recovery
          </button>
        </div>
      {/if}
    </div>
  </div>
</section>
