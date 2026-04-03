<svelte:options runes={false} />

<script lang="ts">
import { onMount } from "svelte";
import { Toaster } from "svelte-sonner";

import ConnectionPanel from "../../components/connection/ConnectionPanel.svelte";
import VehicleStatusCard from "../../components/status/VehicleStatusCard.svelte";
import TelemetrySummary from "../../components/telemetry/TelemetrySummary.svelte";
import { runtime, runtimeTestIds } from "../../lib/stores/runtime";
import { session, type SessionStore } from "../../lib/stores/session";
import AppShellHeader from "./AppShellHeader.svelte";
import { createShellChromeStore } from "./chrome-state";
import VehiclePanelDrawer from "./VehiclePanelDrawer.svelte";

export let store: SessionStore = session;

const chrome = createShellChromeStore();

let vehiclePanelOpen = false;
let activeEnvelopeText = "no active session";
let drawerState: "open" | "closed" | "docked" = "docked";

onMount(() => {
  void store.initialize();
});

$: activeEnvelopeText = $store.activeEnvelope
  ? `${$store.activeEnvelope.session_id} · rev ${$store.activeEnvelope.reset_revision}`
  : "no active session";
$: drawerState = $chrome.vehiclePanelMode === "drawer" ? (vehiclePanelOpen ? "open" : "closed") : "docked";
$: if ($chrome.vehiclePanelMode !== "drawer" && vehiclePanelOpen) {
  vehiclePanelOpen = false;
}

function toggleVehiclePanel() {
  vehiclePanelOpen = !vehiclePanelOpen;
}

function closeVehiclePanel() {
  vehiclePanelOpen = false;
}
</script>

<Toaster closeButton richColors />

<main
  class="runtime-shell"
  data-runtime-phase={$runtime.bootstrapState}
  data-shell-tier={$chrome.tier}
  data-testid={runtimeTestIds.shell}
>
  <section class="runtime-shell__content app-shell-frame" data-shell-tier={$chrome.tier}>
    <AppShellHeader
      activeEnvelopeText={activeEnvelopeText}
      activeSource={$store.activeSource}
      bootedAt={$runtime.bootedAt}
      bootstrapState={$runtime.bootstrapState}
      drawerState={drawerState}
      entrypoint={$runtime.entrypoint}
      framework={$runtime.framework}
      lastPhase={$store.lastPhase}
      legacyBoundary={$runtime.legacyRuntimeLocation}
      handleVehiclePanelToggle={toggleVehiclePanel}
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
        <div class="app-shell-live-grid">
          <VehicleStatusCard {store} />
          <TelemetrySummary {store} />
        </div>
      </section>
    </div>
  </section>

  <VehiclePanelDrawer {store} onClose={closeVehiclePanel} open={vehiclePanelOpen && $chrome.vehiclePanelMode === "drawer"} />
</main>
