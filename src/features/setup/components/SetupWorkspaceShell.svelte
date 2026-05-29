<script lang="ts">
import { Menu, X } from "lucide-svelte";
import { onDestroy, untrack } from "svelte";
import type { Snippet } from "svelte";
import { fromStore } from "svelte/store";

import {
  getSetupWorkspaceStoreContext,
  getSetupWorkspaceViewStoreContext,
  getShellChromeStoreContext,
} from "../../../app/shell/runtime-context";
import { trackAnalytics } from "../../../lib/analytics/client";
import { isSetupSectionId, type SetupSectionId } from "../../../lib/setup-sections";
import { createSetupWizardStore, type SetupWizardStore } from "../../../lib/stores/setup-wizard";
import { IconButton, WorkspaceShell } from "../../../components/ui";
import SetupCheckpointBanner from "./SetupCheckpointBanner.svelte";
import SetupSectionIcon from "./SetupSectionIcon.svelte";
import SetupWorkspaceSectionNav from "./SetupWorkspaceSectionNav.svelte";
import { setSetupWorkspaceRouteContext } from "./setup-workspace-route-context";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";
import ParameterReviewTray from "../../../app/shell/ParameterReviewTray.svelte";

type Props = {
  requestedSectionId?: SetupSectionId | null;
  navigateToSetupSection?: (sectionId: SetupSectionId) => void | Promise<void>;
  wizardStore?: SetupWizardStore;
  children?: Snippet;
};

// Node 20+ exposes a stub `localStorage` with no methods when `--localstorage-file`
// is not set, so `typeof` alone is not enough — we also need a real getter/setter
// signature before handing the object to the wizard store's persistence layer.
const hasRealLocalStorage =
  typeof localStorage !== "undefined" &&
  typeof localStorage.getItem === "function" &&
  typeof localStorage.setItem === "function" &&
  typeof localStorage.removeItem === "function";

function createDefaultWizardStore() {
  return createSetupWizardStore({
    storage: hasRealLocalStorage ? localStorage : undefined,
  });
}

let { requestedSectionId, navigateToSetupSection, wizardStore: providedWizardStore, children }: Props = $props();
const wizardStore = untrack(() => providedWizardStore ?? createDefaultWizardStore());

const store = getSetupWorkspaceStoreContext();
const setupWorkspaceViewStore = getSetupWorkspaceViewStoreContext();
const viewStore = fromStore(setupWorkspaceViewStore);
const chromeStore = fromStore(getShellChromeStoreContext());
const useSectionDrawer = $derived(chromeStore.current.tier === "phone" || chromeStore.current.tier === "tablet");

let sectionDrawerOpen = $state(false);
let sectionDrawerMounted = $state(false);
let sectionDrawerCloseTimer: ReturnType<typeof setTimeout> | null = null;
let suppressedRouteSectionId: SetupSectionId | null = null;
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

const wizardView = fromStore(wizardStore);

setSetupWorkspaceRouteContext({
  viewStore: setupWorkspaceViewStore,
  wizardStore,
  selectSection,
  handleSectionLinkClick,
});

let view = $derived(viewStore.current);
let selectedSection = $derived(view.sections.find((section) => section.id === view.selectedSectionId) ?? null);
let routeSectionSelectionPending = $derived(
  requestedSectionId !== undefined &&
    requestedSectionId !== null &&
    requestedSectionId !== view.selectedSectionId &&
    requestedSectionId !== suppressedRouteSectionId,
);
let lastTrackedSectionId: string | null = null;

$effect(() => {
  if (routeSectionSelectionPending) {
    return;
  }

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
  const navigationStatus = view.sectionStatuses.navigation;
  const batteryStatus = view.sectionStatuses.battery_monitor;
  const navigationConfigured =
    navigationStatus === "complete" ? true : navigationStatus === "not_started" ? false : null;
  const batteryConfigured =
    batteryStatus === "complete" ? true : batteryStatus === "not_started" ? false : null;
  wizardStore.updateFromWorkspace({
    sectionStatuses: view.sectionStatuses,
    activeEnvelope: view.activeEnvelope,
    navigationConfigured,
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

function applySectionSelection(sectionId: SetupSectionId) {
  if (
    view.selectedSectionId === "beginner_wizard" &&
    sectionId !== "beginner_wizard" &&
    wizardView.current.phase === "active"
  ) {
    wizardStore.pause("detour");
  }
  store.selectSection(sectionId);
}

function prepareSectionNavigation(sectionId: string): SetupSectionId | null {
  if (!isSetupSectionId(sectionId)) {
    return null;
  }

  if (requestedSectionId && requestedSectionId !== sectionId) {
    suppressedRouteSectionId = requestedSectionId;
  }

  applySectionSelection(sectionId);
  return sectionId;
}

function selectSection(sectionId: string) {
  const selectedSectionId = prepareSectionNavigation(sectionId);
  if (!selectedSectionId) {
    return;
  }

  void navigateToSetupSection?.(selectedSectionId);
}

function isPlainLeftClick(event: MouseEvent) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

function handleSectionLinkClick(sectionId: string, event: MouseEvent) {
  if (!isPlainLeftClick(event)) {
    return;
  }

  prepareSectionNavigation(sectionId);
}

$effect(() => {
  if (
    requestedSectionId === undefined ||
    requestedSectionId === null ||
    requestedSectionId === view.selectedSectionId
  ) {
    return;
  }

  if (requestedSectionId !== suppressedRouteSectionId) {
    suppressedRouteSectionId = null;
  } else if (requestedSectionId !== view.selectedSectionId) {
    return;
  }

  applySectionSelection(requestedSectionId);
});

function handleSectionDrawerLinkClick(sectionId: string, event: MouseEvent) {
  if (!isPlainLeftClick(event)) {
    return;
  }

  if (prepareSectionNavigation(sectionId)) {
    closeSectionDrawer();
  }
}

function clearCheckpoint() {
  store.clearCheckpointPlaceholder();
}
</script>

<svelte:window onkeydown={handleSectionDrawerKeydown} />

{#snippet sectionNav()}
  <div class="flex h-full min-h-0 flex-col overflow-hidden border-r border-border bg-bg-primary px-1.5 py-2">
    <SetupWorkspaceSectionNav
      onSectionLinkClick={handleSectionLinkClick}
      sectionGroups={view.sectionGroups}
      selectedSectionId={view.selectedSectionId}
    />
  </div>
{/snippet}

{#snippet selectedSectionDetail()}
  <div class="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 md:p-5" data-testid={setupWorkspaceTestIds.detail}>
    {#if useSectionDrawer}
      <div class="mb-3 flex items-center gap-3">
        <IconButton
          aria-controls={sectionDrawerId}
          aria-expanded={sectionDrawerOpen}
          ariaLabel="Open setup sections"
          class="shrink-0 bg-bg-primary text-text-secondary hover:border-accent hover:text-accent"
          testId={setupWorkspaceTestIds.sectionDrawerToggle}
          onclick={openSectionDrawer}
        >
          <Menu size={18} aria-hidden="true" />
        </IconButton>
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

    {@render children?.()}
  </div>
{/snippet}

<WorkspaceShell mode="split" testId={setupWorkspaceTestIds.root}>
  <div
    class="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden"
    data-setup-metadata={view.metadataText}
    data-selected-section={view.selectedSectionId}
    data-setup-readiness={view.readiness}
  >
    <SetupCheckpointBanner checkpoint={view.checkpoint} onClear={clearCheckpoint} />

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
          <IconButton
            ariaLabel="Close setup sections"
            size="icon-sm"
            class="bg-bg-primary text-text-secondary hover:border-accent hover:text-accent"
            testId={setupWorkspaceTestIds.sectionDrawerClose}
            onclick={closeSectionDrawer}
          >
            <X size={16} aria-hidden="true" />
          </IconButton>
        </div>
        <SetupWorkspaceSectionNav
          onSectionLinkClick={handleSectionDrawerLinkClick}
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
