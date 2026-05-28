<script lang="ts">
import { onDestroy, onMount } from "svelte";
import type { Snippet } from "svelte";
import { fromStore, get, writable } from "svelte/store";
import { Toaster } from "svelte-sonner";

import { queryFlightPath } from "../../logs";
import { trackAnalytics } from "../../lib/analytics/client";
import {
  buildReplayMarkerFlightPathQuery,
  createReplayPathOverlay,
  resolveReplayMapOverlayMarker,
  type ReplayMapOverlayState,
} from "../../lib/replay-map-overlay";
import { runtimeTestIds } from "../../lib/stores/runtime";
import { REPLAY_READONLY_COPY, REPLAY_READONLY_TITLE, isReplayReadonly } from "../../lib/replay-readonly";
import AppShellHeader from "./AppShellHeader.svelte";
import { createAppShellController } from "./app-shell-controller";
import { appShellTestIds } from "./chrome-state";
import TelemetrySettingsDialog from "./TelemetrySettingsDialog.svelte";
import { appShellWorkspaces, type AppShellWorkspace } from "./workspace-routes";
import {
  getLiveSettingsStoreContext,
  setLogsWorkspaceRouteContext,
  getMissionPlannerStoreContext,
  getParamsStoreContext,
  getRuntimeStoreContext,
  getSessionStoreContext,
  getSessionViewStoreContext,
  getShellChromeStoreContext,
  setMissionWorkspaceRouteContext,
  setTelemetrySettingsDialogLauncherContext,
} from "./runtime-context";
import VehiclePanelDrawer from "./VehiclePanelDrawer.svelte";
import VehiclePanelContent from "./VehiclePanelContent.svelte";

type Props = {
  activeWorkspace: AppShellWorkspace;
  navigateWorkspace: (workspace: AppShellWorkspace) => void | Promise<void>;
  children: Snippet;
};

let { activeWorkspace, navigateWorkspace, children }: Props = $props();

const sessionStore = getSessionStoreContext();
const parameterStore = getParamsStoreContext();
const liveSettingsStore = getLiveSettingsStoreContext();
const missionPlannerStore = getMissionPlannerStoreContext();
const runtimeStore = getRuntimeStoreContext();
const chromeStore = getShellChromeStoreContext();
const sessionViewStore = getSessionViewStoreContext();

const controller = createAppShellController({
  sessionStore,
  parameterStore,
  chromeStore,
});

const vehiclePanelOpenStore = fromStore(controller.vehiclePanelOpen);
const activeEnvelopeTextStore = fromStore(controller.activeEnvelopeText);
const drawerStateStore = fromStore(controller.drawerState);
const showVehiclePanelButtonStore = fromStore(controller.showVehiclePanelButton);
const showDockedVehiclePanelStore = fromStore(controller.showDockedVehiclePanel);
const vehiclePanelDrawerOpenStore = fromStore(controller.vehiclePanelDrawerOpen);
const sessionView = fromStore(sessionViewStore);
const REPLAY_MAP_HANDOFF_MAX_POINTS = 2000;

let telemetrySettingsOpen = $state(false);
const replayMapOverlayStore = writable<ReplayMapOverlayState | null>(null);
let replayMapOverlayRequest = 0;
let lastTrackedWorkspace: AppShellWorkspace | null = null;

setTelemetrySettingsDialogLauncherContext({
  open() {
    telemetrySettingsOpen = true;
  },
});
setMissionWorkspaceRouteContext({
  replayMapOverlay: replayMapOverlayStore,
  dismissReplayMapOverlay,
});
setLogsWorkspaceRouteContext({
  handleLogsMapHandoff,
});

let vehiclePanelOpen = $derived(vehiclePanelOpenStore.current);
let activeEnvelopeText = $derived(activeEnvelopeTextStore.current);
let drawerState: "open" | "closed" | "docked" = $derived(drawerStateStore.current as "open" | "closed" | "docked");
let showVehiclePanelButton = $derived(showVehiclePanelButtonStore.current);
let showDockedVehiclePanel = $derived(showDockedVehiclePanelStore.current);
let vehiclePanelDrawerOpen = $derived(vehiclePanelDrawerOpenStore.current);
let useMobileToasterPosition = $derived($chromeStore.tier === "phone" || $chromeStore.tier === "tablet");
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

$effect(() => {
  if (activeWorkspace === lastTrackedWorkspace) {
    return;
  }

  lastTrackedWorkspace = activeWorkspace;
  trackAnalytics("workspace_viewed", { workspace: activeWorkspace });
});

onMount(() => {
  void Promise.all([controller.initialize(), liveSettingsStore.initialize(), missionPlannerStore.initialize()]);
});

onDestroy(() => {
  missionPlannerStore.reset();
  controller.destroy();
});

function dismissReplayMapOverlay() {
  replayMapOverlayStore.set(null);
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
  const currentReplayOverlay = get(replayMapOverlayStore);
  const currentOverlay = currentReplayOverlay?.entryId === handoff.entryId ? currentReplayOverlay : null;

  await navigateWorkspace("mission");

  if (handoff.kind === "path") {
    replayMapOverlayStore.set(createReplayPathOverlay(handoff.entryId, "loading", currentOverlay?.path ?? [], null));

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

      replayMapOverlayStore.set(createReplayPathOverlay(handoff.entryId, "ready", path, null));
    } catch (error) {
      if (requestId !== replayMapOverlayRequest) {
        return;
      }

      replayMapOverlayStore.set(
        createReplayPathOverlay(
          handoff.entryId,
          "failed",
          currentOverlay?.path ?? [],
          formatReplayMapOverlayError(error),
        ),
      );
    }

    return;
  }

  const existingPath = currentOverlay?.path ?? [];
  if (existingPath.length > 0) {
    replayMapOverlayStore.set({
      phase: "ready",
      entryId: handoff.entryId,
      path: existingPath,
      marker: resolveReplayMapOverlayMarker(existingPath, handoff.cursorUsec),
      error: null,
    });
    return;
  }

  replayMapOverlayStore.set({
    phase: "loading",
    entryId: handoff.entryId,
    path: [],
    marker: null,
    error: null,
  });

  try {
    const markerQuery = buildReplayMarkerFlightPathQuery(handoff.entryId, handoff.cursorUsec);
    const markerPath = markerQuery === null ? [] : await queryFlightPath(markerQuery);

    if (requestId !== replayMapOverlayRequest) {
      return;
    }

    replayMapOverlayStore.set({
      phase: "ready",
      entryId: handoff.entryId,
      path: markerPath,
      marker: resolveReplayMapOverlayMarker(markerPath, handoff.cursorUsec),
      error: null,
    });
  } catch (error) {
    if (requestId !== replayMapOverlayRequest) {
      return;
    }

    replayMapOverlayStore.set({
      phase: "failed",
      entryId: handoff.entryId,
      path: [],
      marker: null,
      error: formatReplayMapOverlayError(error),
    });
  }
}
</script>

<Toaster
  closeButton
  position={useMobileToasterPosition ? "top-center" : "bottom-right"}
  richColors
  style={useMobileToasterPosition ? "top: var(--safe-area-top, 0px)" : undefined}
  theme="dark"
/>

<main
  class="runtime-shell"
  data-runtime-phase={$runtimeStore.bootstrapState}
  data-shell-tier={$chromeStore.tier}
  data-testid={runtimeTestIds.shell}
>
  <section
    class="runtime-shell__content app-shell-frame"
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
      connectionTone={connectionTone}
      showVehiclePanelButton={showVehiclePanelButton}
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

        {@render children()}
      </section>
    </div>
  </section>

  <VehiclePanelDrawer
    onClose={controller.closeVehiclePanel}
    open={vehiclePanelDrawerOpen}
  />

  <TelemetrySettingsDialog onClose={() => (telemetrySettingsOpen = false)} open={telemetrySettingsOpen} />
</main>
