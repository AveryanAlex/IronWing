<script lang="ts">
import { fromStore } from "svelte/store";

import {
  getSetupWorkspaceStoreContext,
  getSetupWorkspaceViewStoreContext,
  getShellChromeStoreContext,
} from "../../app/shell/runtime-context";
import { createSetupWizardStore } from "../../lib/stores/setup-wizard";
import SetupBeginnerWizardSection from "./SetupBeginnerWizardSection.svelte";
import SetupCalibrationSection from "./SetupCalibrationSection.svelte";
import SetupCheckpointBanner from "./SetupCheckpointBanner.svelte";
import SetupBatteryMonitorSection from "./SetupBatteryMonitorSection.svelte";
import SetupFailsafeSection from "./SetupFailsafeSection.svelte";
import SetupFlightModesSection from "./SetupFlightModesSection.svelte";
import SetupFrameOrientationSection from "./SetupFrameOrientationSection.svelte";
import SetupFullParametersSection from "./SetupFullParametersSection.svelte";
import SetupGeofenceSection from "./SetupGeofenceSection.svelte";
import SetupGpsSection from "./SetupGpsSection.svelte";
import SetupArmingSection from "./SetupArmingSection.svelte";
import SetupInitialParamsSection from "./SetupInitialParamsSection.svelte";
import SetupMotorsEscSection from "./SetupMotorsEscSection.svelte";
import SetupOverviewSection from "./SetupOverviewSection.svelte";
import SetupPeripheralsSection from "./SetupPeripheralsSection.svelte";
import SetupPidTuningSection from "./SetupPidTuningSection.svelte";
import SetupRcReceiverSection from "./SetupRcReceiverSection.svelte";
import SetupRtlReturnSection from "./SetupRtlReturnSection.svelte";
import SetupSerialPortsSection from "./SetupSerialPortsSection.svelte";
import SetupServoOutputsSection from "./SetupServoOutputsSection.svelte";
import SetupWorkspaceSectionNav from "./SetupWorkspaceSectionNav.svelte";
import { setupWorkspaceTestIds } from "./setup-workspace-test-ids";

const store = getSetupWorkspaceStoreContext();
const viewStore = fromStore(getSetupWorkspaceViewStoreContext());
const chromeStore = fromStore(getShellChromeStoreContext());
const isPhoneTier = $derived(chromeStore.current.tier === "phone");

let sectionDrawerOpen = $state(false);

function openSectionDrawer() {
  sectionDrawerOpen = true;
}
function closeSectionDrawer() {
  sectionDrawerOpen = false;
}

// Auto-close the drawer when the viewport grows out of the phone tier
// (e.g. device rotation, window resize) so the inline rail is never
// hidden behind a stale drawer on wider screens.
$effect(() => {
  if (!isPhoneTier && sectionDrawerOpen) {
    sectionDrawerOpen = false;
  }
});

// Node 20+ exposes a stub `localStorage` with no methods when `--localstorage-file`
// is not set, so `typeof` alone is not enough — we also need a real getter/setter
// signature before handing the object to the wizard store's persistence layer.
const hasRealLocalStorage =
  typeof localStorage !== "undefined" &&
  typeof localStorage.getItem === "function" &&
  typeof localStorage.setItem === "function" &&
  typeof localStorage.removeItem === "function";
const wizardStore = createSetupWizardStore({
  storage: hasRealLocalStorage ? localStorage : undefined,
});
const wizardView = fromStore(wizardStore);

let view = $derived(viewStore.current);
let selectedSection = $derived(
  view.sections.find((section) => section.id === view.selectedSectionId) ?? view.sections[0] ?? null,
);

$effect(() => {
  const gpsStatus = view.sectionStatuses.gps;
  const batteryStatus = view.sectionStatuses.battery_monitor;
  const gpsConfigured =
    gpsStatus === "complete" ? true : gpsStatus === "not_started" ? false : null;
  const batteryConfigured =
    batteryStatus === "complete" ? true : batteryStatus === "not_started" ? false : null;
  wizardStore.updateFromWorkspace({
    sectionStatuses: view.sectionStatuses,
    activeEnvelope: view.activeEnvelope,
    gpsConfigured,
    batteryConfigured,
    checkpointPhase: view.checkpoint.phase,
  });
});

// Feed the live wizard phase back into the workspace store so the grouped
// progress dashboard reflects wizard state the same way it reflects any
// other tracked section.
$effect(() => {
  store.setWizardPhase(wizardView.current.phase);
});

// Auto-start the wizard the first time the operator enters the section.
// The store's `start()` is a no-op unless the phase is currently idle, so
// returning to the section mid-run (resume from detour, re-enter from a
// different section) preserves the existing progress.
$effect(() => {
  if (
    view.selectedSectionId === "beginner_wizard" &&
    wizardView.current.phase === "idle"
  ) {
    wizardStore.start();
  }
});

function selectSection(sectionId: string) {
  if (
    view.selectedSectionId === "beginner_wizard" &&
    sectionId !== "beginner_wizard" &&
    wizardView.current.phase === "active"
  ) {
    wizardStore.pause("detour");
  }
  store.selectSection(sectionId);
}

function selectSectionFromDrawer(sectionId: string) {
  selectSection(sectionId);
  closeSectionDrawer();
}

function clearCheckpoint() {
  store.clearCheckpointPlaceholder();
}
</script>

<section
  class="setup-workspace"
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

  <div
    class="setup-workspace-layout mt-4"
    class:setup-workspace-layout--phone={isPhoneTier}
    data-shell-tier={chromeStore.current.tier}
  >
    {#if !isPhoneTier}
      <SetupWorkspaceSectionNav
        onSelect={selectSection}
        sectionGroups={view.sectionGroups}
        selectedSectionId={view.selectedSectionId}
      />
    {/if}

    <div class="setup-workspace-detail" data-testid={setupWorkspaceTestIds.detail}>
      <span aria-hidden="true" class="sr-only" data-testid={setupWorkspaceTestIds.selectedSection}>
        {view.selectedSectionId}
      </span>

      {#if isPhoneTier}
        <div class="mb-3 flex items-center justify-between">
          <button
            class="rounded-full border border-border bg-bg-primary px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary hover:border-accent hover:text-accent"
            data-testid={setupWorkspaceTestIds.sectionDrawerToggle}
            onclick={openSectionDrawer}
            type="button"
          >
            Sections
          </button>
          <span class="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
            {selectedSection?.title ?? "Overview"}
          </span>
        </div>
      {/if}

      {#if view.selectedSectionId === "overview"}
        <SetupOverviewSection {view} onSelect={selectSection} />
      {:else if view.selectedSectionId === "beginner_wizard"}
        <SetupBeginnerWizardSection {view} {wizardStore} onSelectSection={selectSection} />
      {:else if view.selectedSectionId === "frame_orientation" && selectedSection}
        <SetupFrameOrientationSection
          checkpoint={view.checkpoint}
          onSelectRecovery={() => selectSection("full_parameters")}
          section={selectedSection}
        />
      {:else if view.selectedSectionId === "gps" && selectedSection}
        <SetupGpsSection
          onSelectRecovery={() => selectSection("full_parameters")}
          section={selectedSection}
          {view}
        />
      {:else if view.selectedSectionId === "battery_monitor" && selectedSection}
        <SetupBatteryMonitorSection
          onSelectRecovery={() => selectSection("full_parameters")}
          section={selectedSection}
          {view}
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
      {:else if view.selectedSectionId === "serial_ports" && selectedSection}
        <SetupSerialPortsSection
          onSelectRecovery={() => selectSection("full_parameters")}
          section={selectedSection}
          {view}
        />
      {:else if view.selectedSectionId === "flight_modes" && selectedSection}
        <SetupFlightModesSection
          onSelectRecovery={() => selectSection("full_parameters")}
          section={selectedSection}
          {view}
        />
      {:else if view.selectedSectionId === "failsafe" && selectedSection}
        <SetupFailsafeSection
          onSelectRecovery={() => selectSection("full_parameters")}
          section={selectedSection}
          {view}
        />
      {:else if view.selectedSectionId === "rtl_return" && selectedSection}
        <SetupRtlReturnSection
          onSelectRecovery={() => selectSection("full_parameters")}
          section={selectedSection}
          {view}
        />
      {:else if view.selectedSectionId === "geofence" && selectedSection}
        <SetupGeofenceSection
          onSelectRecovery={() => selectSection("full_parameters")}
          section={selectedSection}
          {view}
        />
      {:else if view.selectedSectionId === "arming" && selectedSection}
        <SetupArmingSection
          onSelectRecovery={() => selectSection("full_parameters")}
          section={selectedSection}
          {view}
        />
      {:else if view.selectedSectionId === "initial_params" && selectedSection}
        <SetupInitialParamsSection
          onSelectRecovery={() => selectSection("full_parameters")}
          section={selectedSection}
          {view}
        />
      {:else if view.selectedSectionId === "pid_tuning" && selectedSection}
        <SetupPidTuningSection
          onSelectRecovery={() => selectSection("full_parameters")}
          section={selectedSection}
          {view}
        />
      {:else if view.selectedSectionId === "peripherals" && selectedSection}
        <SetupPeripheralsSection
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
            <div class="rounded-lg border border-warning/40 bg-warning/10 px-4 py-4 text-sm leading-6 text-warning">
              {selectedSection.gateText}
            </div>
          {/if}

          <div class="rounded-lg border border-border bg-bg-primary/80 px-4 py-4 text-sm leading-6 text-text-secondary">
            {#if selectedSection.implemented}
              This expert section already has a dedicated surface elsewhere in the workspace; this fallback panel only appears when the selection contract gets ahead of the mounted detail components.
            {:else}
              This section scaffold keeps current-scope status, blocking reasons, and recovery guidance visible until its dedicated editor lands later in the slice.
            {/if}
          </div>

          <button
            class="rounded-md border border-border bg-bg-primary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
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

  {#if isPhoneTier && sectionDrawerOpen}
    <div
      class="fixed inset-0 z-50 bg-black/60"
      data-testid={setupWorkspaceTestIds.sectionDrawerBackdrop}
      onclick={closeSectionDrawer}
      onkeydown={(event) => {
        if (event.key === "Escape") {
          closeSectionDrawer();
        }
      }}
      role="button"
      tabindex="-1"
    ></div>
    <aside
      class="fixed inset-y-0 left-0 z-50 w-[88vw] max-w-[22rem] overflow-y-auto bg-bg-primary p-4 shadow-2xl"
      data-testid={setupWorkspaceTestIds.sectionDrawer}
    >
      <div class="mb-3 flex items-center justify-between">
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Setup sections</p>
        <button
          class="rounded-full border border-border bg-bg-primary px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary hover:border-accent hover:text-accent"
          data-testid={setupWorkspaceTestIds.sectionDrawerClose}
          onclick={closeSectionDrawer}
          type="button"
        >
          Close
        </button>
      </div>
      <SetupWorkspaceSectionNav
        onSelect={selectSectionFromDrawer}
        sectionGroups={view.sectionGroups}
        selectedSectionId={view.selectedSectionId}
      />
    </aside>
  {/if}
</section>

<style>
  .setup-workspace {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }

  .setup-workspace-layout {
    display: flex;
    gap: 8px;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }
  .setup-workspace-layout > :global(nav) {
    width: 200px;
    flex-shrink: 0;
    overflow-y: auto;
    border-right: 1px solid var(--color-border);
  }
  .setup-workspace-detail {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
    padding: 8px;
  }
  .setup-workspace-layout--phone {
    flex-direction: column;
  }
</style>
