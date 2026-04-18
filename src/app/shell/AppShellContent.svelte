<script lang="ts">
import { onDestroy, onMount } from "svelte";
import { fromStore } from "svelte/store";
import { Toaster } from "svelte-sonner";

import FirmwareWorkspace from "../../components/firmware/FirmwareWorkspace.svelte";
import HudWorkspace from "../../components/hud/HudWorkspace.svelte";
import MissionWorkspace from "../../components/mission/MissionWorkspace.svelte";
import SetupWorkspace from "../../components/setup/SetupWorkspace.svelte";
import { runtimeTestIds } from "../../lib/stores/runtime";
import AppShellPlaceholderWorkspace from "./AppShellPlaceholderWorkspace.svelte";
import AppShellHeader from "./AppShellHeader.svelte";
import { appShellWorkspaces, createAppShellController } from "./app-shell-controller";
import { appShellTestIds } from "./chrome-state";
import OperatorWorkspace from "./OperatorWorkspace.svelte";
import ParameterReviewTray from "./ParameterReviewTray.svelte";
import TelemetrySettingsDialog from "./TelemetrySettingsDialog.svelte";
import {
  getFirmwareWorkspaceContext,
  getLiveSettingsStoreContext,
  getMissionPlannerStoreContext,
  getParameterWorkspaceViewStoreContext,
  getParamsStoreContext,
  getRuntimeStoreContext,
  getSessionStoreContext,
  getSessionViewStoreContext,
  getShellChromeStoreContext,
  setTelemetrySettingsDialogLauncherContext,
} from "./runtime-context";
import VehiclePanelDrawer from "./VehiclePanelDrawer.svelte";
import VehiclePanelContent from "./VehiclePanelContent.svelte";

const sessionStore = getSessionStoreContext();
const parameterStore = getParamsStoreContext();
const liveSettingsStore = getLiveSettingsStoreContext();
const missionPlannerStore = getMissionPlannerStoreContext();
const runtimeStore = getRuntimeStoreContext();
const chromeStore = getShellChromeStoreContext();
const sessionViewStore = getSessionViewStoreContext();
const parameterViewStore = getParameterWorkspaceViewStoreContext();
const firmwareWorkspace = getFirmwareWorkspaceContext();

const controller = createAppShellController({
  sessionStore,
  parameterStore,
  chromeStore,
  parameterViewStore,
});

const activeWorkspaceStore = fromStore(controller.activeWorkspace);
const vehiclePanelOpenStore = fromStore(controller.vehiclePanelOpen);
const parameterReviewOpenStore = fromStore(controller.parameterReviewOpen);
const stagedCountStore = fromStore(controller.stagedCount);
const activeEnvelopeTextStore = fromStore(controller.activeEnvelopeText);
const drawerStateStore = fromStore(controller.drawerState);
const showVehiclePanelButtonStore = fromStore(controller.showVehiclePanelButton);
const showDockedVehiclePanelStore = fromStore(controller.showDockedVehiclePanel);
const vehiclePanelDrawerOpenStore = fromStore(controller.vehiclePanelDrawerOpen);
const sessionView = fromStore(sessionViewStore);

let telemetrySettingsOpen = $state(false);

setTelemetrySettingsDialogLauncherContext({
  open() {
    telemetrySettingsOpen = true;
  },
});

let activeWorkspace = $derived(activeWorkspaceStore.current);
let vehiclePanelOpen = $derived(vehiclePanelOpenStore.current);
let parameterReviewOpen = $derived(parameterReviewOpenStore.current);
let stagedCount = $derived(stagedCountStore.current);
let activeEnvelopeText = $derived(activeEnvelopeTextStore.current);
let drawerState = $derived(drawerStateStore.current);
let showVehiclePanelButton = $derived(showVehiclePanelButtonStore.current);
let showDockedVehiclePanel = $derived(showDockedVehiclePanelStore.current);
let vehiclePanelDrawerOpen = $derived(vehiclePanelDrawerOpenStore.current);
let connectionTone = $derived.by<"neutral" | "positive" | "caution" | "critical">(() => {
  if (sessionView.current.isConnecting) {
    return "caution";
  }

  if (sessionView.current.connected) {
    return "positive";
  }

  if (sessionView.current.lastError) {
    return "critical";
  }

  return "neutral";
});

onMount(() => {
  void Promise.all([controller.initialize(), liveSettingsStore.initialize(), missionPlannerStore.initialize()]);
});

onDestroy(() => {
  missionPlannerStore.reset();
  controller.destroy();
});
</script>

<Toaster closeButton richColors />

<main
  class="runtime-shell"
  data-runtime-phase={$runtimeStore.bootstrapState}
  data-shell-tier={$chromeStore.tier}
  data-testid={runtimeTestIds.shell}
>
  <section
    class={`runtime-shell__content app-shell-frame ${stagedCount > 0 ? "pb-36 sm:pb-40" : ""}`}
    data-has-staged-edits={stagedCount > 0 ? "true" : "false"}
    data-shell-tier={$chromeStore.tier}
  >
    <AppShellHeader
      activeWorkspace={activeWorkspace}
      activeEnvelopeText={activeEnvelopeText}
      activeSource={$sessionStore.activeSource}
      bootedAt={$runtimeStore.bootedAt}
      bootstrapState={$runtimeStore.bootstrapState}
      drawerState={drawerState}
      entrypoint={$runtimeStore.entrypoint}
      framework={$runtimeStore.framework}
      handleVehiclePanelToggle={controller.toggleVehiclePanel}
      lastPhase={$sessionStore.lastPhase}
      legacyBoundary={$runtimeStore.legacyRuntimeLocation}
      onSelectWorkspace={controller.showWorkspace}
      connectionTone={connectionTone}
      showVehiclePanelButton={showVehiclePanelButton}
      stagedCount={stagedCount}
      tier={$chromeStore.tier}
      vehiclePanelOpen={vehiclePanelOpen}
      workspaces={appShellWorkspaces}
    />

    <div class="app-shell-layout" data-shell-tier={$chromeStore.tier}>
      {#if showDockedVehiclePanel}
        <aside
          class="app-shell-layout__vehicle-panel"
          data-panel-state="docked"
          data-testid={appShellTestIds.vehiclePanelRail}
        >
          <VehiclePanelContent />
        </aside>
      {/if}

      <section class="app-shell-layout__main" data-testid={appShellTestIds.mainViewport}>
        <span aria-hidden="true" class="sr-only" data-testid={appShellTestIds.activeWorkspace}>
          {activeWorkspace}
        </span>

        {#if activeWorkspace === "overview"}
          <OperatorWorkspace />
        {:else if activeWorkspace === "setup"}
          <SetupWorkspace />
        {:else}
          <div class="app-shell-main-panel">
            {#if activeWorkspace === "telemetry"}
              <AppShellPlaceholderWorkspace
                description="Telemetry charts and channels will land here in the active Svelte shell."
                title="Telemetry"
              />
            {:else if activeWorkspace === "hud"}
              <HudWorkspace />
            {:else if activeWorkspace === "mission"}
              <MissionWorkspace />
            {:else if activeWorkspace === "logs"}
              <AppShellPlaceholderWorkspace
                description="Log browsing and playback surfaces are planned for this tab."
                title="Logs"
              />
            {:else if activeWorkspace === "firmware"}
              <FirmwareWorkspace
                chromeStore={chromeStore}
                fileIo={firmwareWorkspace.fileIo}
                service={firmwareWorkspace.service}
                store={firmwareWorkspace.store}
              />
            {:else if activeWorkspace === "settings"}
              <AppShellPlaceholderWorkspace
                description="Application-level preferences and shell behavior controls will live in this workspace."
                title="App settings"
              />
            {:else}
              <AppShellPlaceholderWorkspace
                description="Setup workflows and calibration entry points will live here."
                title="Setup"
              />
            {/if}
          </div>
        {/if}
      </section>
    </div>
  </section>

  <ParameterReviewTray onToggle={controller.toggleParameterReview} open={parameterReviewOpen} />

  <VehiclePanelDrawer
    onClose={controller.closeVehiclePanel}
    open={vehiclePanelDrawerOpen}
  />

  <TelemetrySettingsDialog onClose={() => (telemetrySettingsOpen = false)} open={telemetrySettingsOpen} />
</main>
