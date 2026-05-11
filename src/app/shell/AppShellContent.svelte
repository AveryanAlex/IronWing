<script lang="ts">
import { onDestroy, onMount } from "svelte";
import { fromStore } from "svelte/store";
import { Toaster } from "svelte-sonner";

import FirmwareWorkspace from "../../components/firmware/FirmwareWorkspace.svelte";
import HudWorkspace from "../../components/hud/HudWorkspace.svelte";
import LogsWorkspace from "../../components/logs/LogsWorkspace.svelte";
import MissionWorkspace from "../../components/mission/MissionWorkspace.svelte";
import SetupWorkspace from "../../components/setup/SetupWorkspace.svelte";
import SettingsWorkspace from "../../components/settings/SettingsWorkspace.svelte";
import TelemetryWorkspace from "../../components/telemetry/TelemetryWorkspace.svelte";
import { queryFlightPath } from "../../logs";
import {
  buildReplayMarkerFlightPathQuery,
  createReplayPathOverlay,
  resolveReplayMapOverlayMarker,
  type ReplayMapOverlayState,
} from "../../lib/replay-map-overlay";
import { runtimeTestIds } from "../../lib/stores/runtime";
import { REPLAY_READONLY_COPY, REPLAY_READONLY_TITLE, isReplayReadonly } from "../../lib/replay-readonly";
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
const REPLAY_MAP_HANDOFF_MAX_POINTS = 2000;

let telemetrySettingsOpen = $state(false);
let replayMapOverlay = $state<ReplayMapOverlayState | null>(null);
let replayMapOverlayRequest = 0;

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
let drawerState: "open" | "closed" | "docked" = $derived(drawerStateStore.current as "open" | "closed" | "docked");
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
let replayReadonly = $derived(isReplayReadonly($sessionStore.activeSource));

onMount(() => {
  void Promise.all([controller.initialize(), liveSettingsStore.initialize(), missionPlannerStore.initialize()]);
});

onDestroy(() => {
  missionPlannerStore.reset();
  controller.destroy();
});

function dismissReplayMapOverlay() {
  replayMapOverlay = null;
}

function formatReplayMapOverlayError(error: unknown): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : typeof error === "string" && error.trim().length > 0
      ? error
      : "Unable to load the replay path for the mission map overlay.";
}

async function handleLogsMapHandoff(
  handoff:
    | {
        kind: "path";
        entryId: string;
        startUsec: number | null;
        endUsec: number | null;
      }
    | {
        kind: "replay_marker";
        entryId: string;
        cursorUsec: number | null;
      },
) {
  const requestId = ++replayMapOverlayRequest;
  const currentOverlay = replayMapOverlay?.entryId === handoff.entryId ? replayMapOverlay : null;

  controller.showWorkspace("mission");

  if (handoff.kind === "path") {
    replayMapOverlay = createReplayPathOverlay(handoff.entryId, "loading", currentOverlay?.path ?? [], null);

    try {
      const path = await queryFlightPath({
        entry_id: handoff.entryId,
        start_usec: handoff.startUsec,
        end_usec: handoff.endUsec,
        max_points: REPLAY_MAP_HANDOFF_MAX_POINTS,
      });

      if (requestId !== replayMapOverlayRequest) {
        return;
      }

      replayMapOverlay = createReplayPathOverlay(handoff.entryId, "ready", path, null);
    } catch (error) {
      if (requestId !== replayMapOverlayRequest) {
        return;
      }

      replayMapOverlay = createReplayPathOverlay(
        handoff.entryId,
        "failed",
        currentOverlay?.path ?? [],
        formatReplayMapOverlayError(error),
      );
    }

    return;
  }

  const existingPath = currentOverlay?.path ?? [];
  if (existingPath.length > 0) {
    replayMapOverlay = {
      phase: "ready",
      entryId: handoff.entryId,
      path: existingPath,
      marker: resolveReplayMapOverlayMarker(existingPath, handoff.cursorUsec),
      error: null,
    };
    return;
  }

  replayMapOverlay = {
    phase: "loading",
    entryId: handoff.entryId,
    path: [],
    marker: null,
    error: null,
  };

  try {
    const markerQuery = buildReplayMarkerFlightPathQuery(handoff.entryId, handoff.cursorUsec);
    const markerPath = markerQuery === null ? [] : await queryFlightPath(markerQuery);

    if (requestId !== replayMapOverlayRequest) {
      return;
    }

    replayMapOverlay = {
      phase: "ready",
      entryId: handoff.entryId,
      path: markerPath,
      marker: resolveReplayMapOverlayMarker(markerPath, handoff.cursorUsec),
      error: null,
    };
  } catch (error) {
    if (requestId !== replayMapOverlayRequest) {
      return;
    }

    replayMapOverlay = {
      phase: "failed",
      entryId: handoff.entryId,
      path: [],
      marker: null,
      error: formatReplayMapOverlayError(error),
    };
  }
}
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

    {#if replayReadonly}
      <div
        class="mx-3 mt-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning"
        data-testid={appShellTestIds.replayReadonlyBanner}
      >
        <p class="font-semibold">{REPLAY_READONLY_TITLE}</p>
        <p class="mt-1">{REPLAY_READONLY_COPY}</p>
      </div>
    {/if}

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
        {:else if activeWorkspace === "hud"}
          <HudWorkspace />
        {:else if activeWorkspace === "telemetry"}
          <TelemetryWorkspace />
        {:else if activeWorkspace === "mission"}
          <MissionWorkspace onDismissReplayMapOverlay={dismissReplayMapOverlay} replayMapOverlay={replayMapOverlay} />
        {:else if activeWorkspace === "logs"}
          <LogsWorkspace onMapHandoff={handleLogsMapHandoff} />
        {:else if activeWorkspace === "firmware"}
          <FirmwareWorkspace
            chromeStore={chromeStore}
            fileIo={firmwareWorkspace.fileIo}
            service={firmwareWorkspace.service}
            store={firmwareWorkspace.store}
          />
        {:else if activeWorkspace === "settings"}
          <SettingsWorkspace />
        {:else}
          <AppShellPlaceholderWorkspace
            description="Setup workflows and calibration entry points will live here."
            title="Setup"
          />
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
