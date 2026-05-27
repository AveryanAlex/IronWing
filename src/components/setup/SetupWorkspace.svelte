<script lang="ts">
import { Menu, X } from "lucide-svelte";
import { onDestroy } from "svelte";
import { fromStore } from "svelte/store";

import {
  getSetupWorkspaceStoreContext,
  getSetupWorkspaceViewStoreContext,
  getShellChromeStoreContext,
} from "../../app/shell/runtime-context";
import { trackAnalytics } from "../../lib/analytics/client";
import { createSetupWizardStore } from "../../lib/stores/setup-wizard";
import { WorkspaceShell } from "../ui";
import SetupBeginnerWizardSection from "./sections/SetupBeginnerWizardSection.svelte";
import SetupCalibrationSection from "./sections/SetupCalibrationSection.svelte";
import SetupCheckpointBanner from "./SetupCheckpointBanner.svelte";
import SetupBatteryMonitorSection from "./sections/SetupBatteryMonitorSection.svelte";
import SetupFailsafeSection from "./sections/SetupFailsafeSection.svelte";
import SetupFlightModesSection from "./sections/SetupFlightModesSection.svelte";
import SetupFrameOrientationSection from "./sections/SetupFrameOrientationSection.svelte";
import SetupFullParametersSection from "./sections/SetupFullParametersSection.svelte";
import SetupGeofenceSection from "./sections/SetupGeofenceSection.svelte";
import SetupGpsSection from "./sections/SetupGpsSection.svelte";
import SetupArmingSection from "./sections/SetupArmingSection.svelte";
import SetupInitialParamsSection from "./sections/SetupInitialParamsSection.svelte";
import SetupMotorsEscSection from "./sections/SetupMotorsEscSection.svelte";
import SetupOverviewSection from "./sections/SetupOverviewSection.svelte";
import SetupPeripheralsSection from "./sections/SetupPeripheralsSection.svelte";
import SetupPidTuningSection from "./sections/SetupPidTuningSection.svelte";
import SetupRcReceiverSection from "./sections/SetupRcReceiverSection.svelte";
import SetupRtlReturnSection from "./sections/SetupRtlReturnSection.svelte";
import SetupSerialPortsSection from "./sections/SetupSerialPortsSection.svelte";
import SetupSectionIcon from "./SetupSectionIcon.svelte";
import SetupServoOutputsSection from "./sections/SetupServoOutputsSection.svelte";
import SetupWorkspaceSectionNav from "./SetupWorkspaceSectionNav.svelte";
import { setupWorkspaceTestIds } from "./setup-workspace-test-ids";
import ParameterReviewTray from "../../app/shell/ParameterReviewTray.svelte";

const store = getSetupWorkspaceStoreContext();
const viewStore = fromStore(getSetupWorkspaceViewStoreContext());
const chromeStore = fromStore(getShellChromeStoreContext());
const useSectionDrawer = $derived(chromeStore.current.tier === "phone" || chromeStore.current.tier === "tablet");

let sectionDrawerOpen = $state(false);
let sectionDrawerMounted = $state(false);
let sectionDrawerCloseTimer: ReturnType<typeof setTimeout> | null = null;
const sectionDrawerId = "setup-section-drawer";

function clearSectionDrawerCloseTimer() {
  if (sectionDrawerCloseTimer) {
    clearTimeout(sectionDrawerCloseTimer);
    sectionDrawerCloseTimer = null;
  }
}

function openSectionDrawer() {
  clearSectionDrawerCloseTimer();
  sectionDrawerMounted = true;
  sectionDrawerOpen = true;
}
function closeSectionDrawer() {
  if (!sectionDrawerMounted) {
    return;
  }

  clearSectionDrawerCloseTimer();
  sectionDrawerOpen = false;
  sectionDrawerCloseTimer = setTimeout(() => {
    sectionDrawerMounted = false;
    sectionDrawerCloseTimer = null;
  }, 180);
}

function resetSectionDrawer() {
  clearSectionDrawerCloseTimer();
  sectionDrawerOpen = false;
  sectionDrawerMounted = false;
}

function handleSectionDrawerKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && sectionDrawerOpen) {
    closeSectionDrawer();
  }
}

// Auto-close the drawer when the viewport grows out of the compact setup tier
// (e.g. device rotation, window resize) so the inline rail is never hidden
// behind a stale drawer on wider screens.
$effect(() => {
  if (!useSectionDrawer && sectionDrawerMounted) {
    resetSectionDrawer();
  }
});

onDestroy(() => {
  clearSectionDrawerCloseTimer();
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
let selectedSection = $derived(view.sections.find((section) => section.id === view.selectedSectionId) ?? null);
let lastTrackedSectionId: string | null = null;

$effect(() => {
  if (view.selectedSectionId === lastTrackedSectionId) {
    return;
  }

  lastTrackedSectionId = view.selectedSectionId;
  trackAnalytics("setup_section_viewed", {
    section: view.selectedSectionId,
    connected: view.liveSessionConnected ? 1 : 0,
  });
});

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

<svelte:window onkeydown={handleSectionDrawerKeydown} />

{#snippet sectionNav()}
  <div class="flex h-full min-h-0 flex-col overflow-hidden border-r border-border bg-bg-primary px-1.5 py-2">
    <SetupWorkspaceSectionNav
      onSelect={selectSection}
      sectionGroups={view.sectionGroups}
      selectedSectionId={view.selectedSectionId}
    />
  </div>
{/snippet}

{#snippet selectedSectionDetail()}
  <div class="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 md:p-5" data-testid={setupWorkspaceTestIds.detail}>
    <span aria-hidden="true" class="sr-only" data-testid={setupWorkspaceTestIds.selectedSection}>
      {view.selectedSectionId}
    </span>

    {#if useSectionDrawer}
      <div class="mb-3 flex items-center gap-3">
        <button
          aria-controls={sectionDrawerId}
          aria-expanded={sectionDrawerOpen}
          aria-label="Open setup sections"
          class="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-bg-primary text-text-secondary transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          data-testid={setupWorkspaceTestIds.sectionDrawerToggle}
          onclick={openSectionDrawer}
          type="button"
        >
          <Menu size={18} aria-hidden="true" />
        </button>
        {#if selectedSection}
          <div class="min-w-0">
            <p class="text-[10px] font-semibold uppercase tracking-widest text-text-muted">Setup section</p>
            <p class="mt-1 inline-flex min-w-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-text-secondary">
              <SetupSectionIcon sectionId={selectedSection.id} size={12} />
              <span class="truncate">{selectedSection.title}</span>
            </p>
          </div>
        {:else}
          <span class="text-xs font-semibold uppercase tracking-widest text-text-muted">Overview</span>
        {/if}
      </div>
    {/if}

    {#if view.selectedSectionId === "overview"}
        <SetupOverviewSection {view} onSelect={selectSection} />
      {:else if view.selectedSectionId === "beginner_wizard"}
        <SetupBeginnerWizardSection {view} {wizardStore} onSelectSection={selectSection} />
      {:else if view.selectedSectionId === "frame_orientation" && selectedSection}
        <SetupFrameOrientationSection
          checkpoint={view.checkpoint}
          section={selectedSection}
        />
      {:else if view.selectedSectionId === "gps" && selectedSection}
        <SetupGpsSection
          section={selectedSection}
          {view}
        />
      {:else if view.selectedSectionId === "battery_monitor" && selectedSection}
        <SetupBatteryMonitorSection
          section={selectedSection}
          {view}
        />
      {:else if view.selectedSectionId === "motors_esc" && selectedSection}
        <SetupMotorsEscSection
          section={selectedSection}
          {view}
        />
      {:else if view.selectedSectionId === "servo_outputs" && selectedSection}
        <SetupServoOutputsSection
          section={selectedSection}
          {view}
        />
      {:else if view.selectedSectionId === "serial_ports" && selectedSection}
        <SetupSerialPortsSection
          section={selectedSection}
          {view}
        />
      {:else if view.selectedSectionId === "flight_modes" && selectedSection}
        <SetupFlightModesSection
          section={selectedSection}
          {view}
        />
      {:else if view.selectedSectionId === "failsafe" && selectedSection}
        <SetupFailsafeSection
          section={selectedSection}
          {view}
        />
      {:else if view.selectedSectionId === "rtl_return" && selectedSection}
        <SetupRtlReturnSection
          section={selectedSection}
          {view}
        />
      {:else if view.selectedSectionId === "geofence" && selectedSection}
        <SetupGeofenceSection
          section={selectedSection}
          {view}
        />
      {:else if view.selectedSectionId === "arming" && selectedSection}
        <SetupArmingSection
          section={selectedSection}
          {view}
        />
      {:else if view.selectedSectionId === "initial_params" && selectedSection}
        <SetupInitialParamsSection
          section={selectedSection}
          {view}
        />
      {:else if view.selectedSectionId === "pid_tuning" && selectedSection}
        <SetupPidTuningSection
          section={selectedSection}
          {view}
        />
      {:else if view.selectedSectionId === "peripherals" && selectedSection}
        <SetupPeripheralsSection
          section={selectedSection}
          {view}
        />
      {:else if view.selectedSectionId === "rc_receiver"}
        <SetupRcReceiverSection {view} />
      {:else if view.selectedSectionId === "calibration"}
        <SetupCalibrationSection {view} />
      {:else if view.selectedSectionId === "full_parameters"}
        <SetupFullParametersSection canOpen={view.canOpenFullParameters} />
      {:else}
        <div class="rounded-lg border border-border bg-bg-primary/80 px-4 py-4 text-sm leading-6 text-text-secondary">
          This section is not available right now.
        </div>
      {/if}
  </div>
{/snippet}

<WorkspaceShell mode="split" testId={setupWorkspaceTestIds.root}>
  <div
    class="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden"
    data-selected-section={view.selectedSectionId}
    data-setup-readiness={view.readiness}
  >
    <SetupCheckpointBanner checkpoint={view.checkpoint} onClear={clearCheckpoint} />

    <div aria-hidden="true" class="hidden">
      <span data-testid={setupWorkspaceTestIds.state}>{view.stateText}</span>
      <span data-testid={setupWorkspaceTestIds.scope}>{view.scopeText}</span>
      <span data-testid={setupWorkspaceTestIds.metadata}>{view.metadataText}</span>
      <span data-testid={setupWorkspaceTestIds.progress}>{view.progressText}</span>
      <span data-testid={setupWorkspaceTestIds.notice}>{view.noticeText ?? ""}</span>
    </div>

    {#if useSectionDrawer}
      <div
        class="flex flex-1 min-h-0 flex-col gap-2 overflow-hidden"
        data-setup-section-nav-mode="drawer"
        data-shell-tier={chromeStore.current.tier}
      >
        <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {@render selectedSectionDetail()}
        </div>
      </div>
    {:else}
      <div
        class="grid min-h-0 flex-1 grid-cols-[224px_minmax(0,1fr)] overflow-hidden"
        data-setup-section-nav-mode="rail"
        data-shell-tier={chromeStore.current.tier}
      >
        <div class="flex min-h-0 min-w-0 flex-col overflow-hidden">
          {@render sectionNav()}
        </div>
        <div class="flex min-h-0 min-w-0 flex-col overflow-hidden">
          {@render selectedSectionDetail()}
        </div>
      </div>
    {/if}

    <ParameterReviewTray />

    {#if useSectionDrawer && sectionDrawerMounted}
      <button
        aria-label="Close setup sections"
        class={[
          "setup-section-drawer-backdrop absolute inset-0 z-30 cursor-default border-0 bg-black/60 p-0 transition-opacity duration-150 ease-out",
          sectionDrawerOpen ? "opacity-100" : "opacity-0",
        ]}
        data-open={sectionDrawerOpen ? "true" : "false"}
        data-testid={setupWorkspaceTestIds.sectionDrawerBackdrop}
        onclick={closeSectionDrawer}
        type="button"
      ></button>
      <div
        aria-label="Setup sections"
        aria-modal="true"
        class={[
          "setup-section-drawer-panel absolute inset-y-0 left-0 z-40 flex w-80 max-w-[88vw] flex-col overflow-hidden border-r border-border bg-bg-primary px-1.5 py-3 shadow-2xl transition-transform duration-200 ease-out",
          sectionDrawerOpen ? "translate-x-0" : "-translate-x-full",
        ]}
        data-open={sectionDrawerOpen ? "true" : "false"}
        data-testid={setupWorkspaceTestIds.sectionDrawer}
        id={sectionDrawerId}
        role="dialog"
      >
        <div class="mb-3 flex items-center justify-between gap-3 px-2">
          <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">Setup sections</p>
          <button
            aria-label="Close setup sections"
            class="inline-flex size-8 items-center justify-center rounded-md border border-border bg-bg-primary text-text-secondary transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            data-testid={setupWorkspaceTestIds.sectionDrawerClose}
            onclick={closeSectionDrawer}
            type="button"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <SetupWorkspaceSectionNav
          onSelect={selectSectionFromDrawer}
          sectionGroups={view.sectionGroups}
          selectedSectionId={view.selectedSectionId}
        />
      </div>
    {/if}
  </div>
</WorkspaceShell>

<style>
  .setup-section-drawer-backdrop[data-open="true"] {
    animation: setup-section-drawer-fade-in 140ms ease-out;
  }

  .setup-section-drawer-panel[data-open="true"] {
    animation: setup-section-drawer-slide-in 180ms ease-out;
  }

  @keyframes setup-section-drawer-fade-in {
    from {
      opacity: 0;
    }
  }

  @keyframes setup-section-drawer-slide-in {
    from {
      transform: translateX(-100%);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .setup-section-drawer-backdrop,
    .setup-section-drawer-panel {
      animation: none;
      transition: none;
    }
  }
</style>
