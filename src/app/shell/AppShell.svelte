<svelte:options runes={false} />

<script lang="ts">
import { onMount } from "svelte";
import { Toaster } from "svelte-sonner";

import ParameterWorkspace from "../../components/params/ParameterWorkspace.svelte";
import ConnectionPanel from "../../components/connection/ConnectionPanel.svelte";
import VehicleStatusCard from "../../components/status/VehicleStatusCard.svelte";
import TelemetrySummary from "../../components/telemetry/TelemetrySummary.svelte";
import {
  createParameterWorkspaceViewStore,
  params,
  type ParamsStore,
} from "../../lib/stores/params";
import { runtime, runtimeTestIds } from "../../lib/stores/runtime";
import { session, type SessionStore } from "../../lib/stores/session";
import AppShellHeader from "./AppShellHeader.svelte";
import { appShellTestIds, createShellChromeStore } from "./chrome-state";
import ParameterReviewTray from "./ParameterReviewTray.svelte";
import VehiclePanelDrawer from "./VehiclePanelDrawer.svelte";

export let store: SessionStore = session;
export let parameterStore: ParamsStore = params;

const chrome = createShellChromeStore();

let vehiclePanelOpen = false;
let parameterReviewOpen = false;
let activeEnvelopeText = "no active session";
let drawerState: "open" | "closed" | "docked" = "docked";
let activeWorkspace: "overview" | "params" = "overview";
let parameterView = createParameterWorkspaceViewStore(parameterStore);

onMount(() => {
  void Promise.all([store.initialize(), parameterStore.initialize()]);
});

$: parameterView = createParameterWorkspaceViewStore(parameterStore);
$: activeEnvelopeText = $store.activeEnvelope
  ? `${$store.activeEnvelope.session_id} · rev ${$store.activeEnvelope.reset_revision}`
  : "no active session";
$: drawerState = $chrome.vehiclePanelMode === "drawer" ? (vehiclePanelOpen ? "open" : "closed") : "docked";
$: if ($chrome.vehiclePanelMode !== "drawer" && vehiclePanelOpen) {
  vehiclePanelOpen = false;
}
$: if ($parameterView.stagedCount === 0 && parameterReviewOpen) {
  parameterReviewOpen = false;
}

function toggleVehiclePanel() {
  vehiclePanelOpen = !vehiclePanelOpen;
}

function closeVehiclePanel() {
  vehiclePanelOpen = false;
}

function showOverviewWorkspace() {
  activeWorkspace = "overview";
}

function showParameterWorkspace() {
  activeWorkspace = "params";
}

function toggleParameterReview() {
  parameterReviewOpen = !parameterReviewOpen;
}
</script>

<Toaster closeButton richColors />

<main
  class="runtime-shell"
  data-runtime-phase={$runtime.bootstrapState}
  data-shell-tier={$chrome.tier}
  data-testid={runtimeTestIds.shell}
>
  <section
    class={`runtime-shell__content app-shell-frame ${$parameterView.stagedCount > 0 ? "pb-36 sm:pb-40" : ""}`}
    data-shell-tier={$chrome.tier}
  >
    <AppShellHeader
      activeEnvelopeText={activeEnvelopeText}
      activeSource={$store.activeSource}
      bootedAt={$runtime.bootedAt}
      bootstrapState={$runtime.bootstrapState}
      drawerState={drawerState}
      entrypoint={$runtime.entrypoint}
      framework={$runtime.framework}
      handleVehiclePanelToggle={toggleVehiclePanel}
      lastPhase={$store.lastPhase}
      legacyBoundary={$runtime.legacyRuntimeLocation}
      showVehiclePanelButton={$chrome.vehiclePanelMode === "drawer"}
      tier={$chrome.tier}
      vehiclePanelOpen={vehiclePanelOpen}
    />

    <div class="app-shell-layout" data-shell-tier={$chrome.tier}>
      {#if $chrome.vehiclePanelMode === "docked"}
        <aside class="app-shell-layout__vehicle-panel">
          <ConnectionPanel {store} />
        </aside>
      {/if}

      <section class="app-shell-layout__main">
        <div class="mb-4 flex flex-wrap items-center gap-3">
          <button
            class={`rounded-full border px-4 py-2 text-sm font-semibold transition ${activeWorkspace === "overview" ? "border-accent bg-accent text-bg-primary" : "border-border bg-bg-primary/70 text-text-secondary hover:border-border-light hover:text-text-primary"}`}
            data-testid={appShellTestIds.overviewWorkspaceButton}
            onclick={showOverviewWorkspace}
            type="button"
          >
            Overview
          </button>
          <button
            class={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${activeWorkspace === "params" ? "border-accent bg-accent text-bg-primary" : "border-border bg-bg-primary/70 text-text-secondary hover:border-border-light hover:text-text-primary"}`}
            data-testid={appShellTestIds.parameterWorkspaceButton}
            onclick={showParameterWorkspace}
            type="button"
          >
            <span>Parameters</span>
            {#if $parameterView.stagedCount > 0}
              <span
                class={`rounded-full px-2 py-0.5 text-xs font-semibold ${activeWorkspace === "params" ? "bg-bg-primary/20 text-bg-primary" : "bg-accent/10 text-accent"}`}
                data-testid={appShellTestIds.parameterWorkspacePendingCount}
              >
                {$parameterView.stagedCount}
              </span>
            {/if}
          </button>
          <span class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted" data-testid={appShellTestIds.activeWorkspace}>
            {activeWorkspace}
          </span>
        </div>

        {#if activeWorkspace === "overview"}
          <div class="app-shell-live-grid">
            <VehicleStatusCard {store} />
            <TelemetrySummary {store} />
          </div>
        {:else}
          <ParameterWorkspace store={parameterStore} />
        {/if}
      </section>
    </div>
  </section>

  <ParameterReviewTray onToggle={toggleParameterReview} open={parameterReviewOpen} store={parameterStore} tier={$chrome.tier} />

  <VehiclePanelDrawer {store} onClose={closeVehiclePanel} open={vehiclePanelOpen && $chrome.vehiclePanelMode === "drawer"} />
</main>
