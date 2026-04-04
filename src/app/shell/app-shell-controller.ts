import { derived, writable, type Readable } from "svelte/store";

import type { ParameterWorkspaceViewStore, ParamsStore } from "../../lib/stores/params";
import type { SessionStore } from "../../lib/stores/session";
import type { ShellChromeStore } from "./runtime-context";

export type AppShellWorkspace =
  | "overview"
  | "telemetry"
  | "hud"
  | "mission"
  | "logs"
  | "firmware"
  | "settings"
  | "setup";

export const appShellWorkspaces: ReadonlyArray<{
  key: AppShellWorkspace;
  label: string;
}> = [
  { key: "overview", label: "Overview" },
  { key: "telemetry", label: "Telemetry" },
  { key: "hud", label: "HUD" },
  { key: "mission", label: "Mission" },
  { key: "logs", label: "Logs" },
  { key: "firmware", label: "Firmware" },
  { key: "setup", label: "Setup" },
  { key: "settings", label: "App settings" },
];

export type AppShellController = ReturnType<typeof createAppShellController>;

export function createAppShellController(stores: {
  sessionStore: SessionStore;
  parameterStore: ParamsStore;
  chromeStore: ShellChromeStore;
  parameterViewStore: ParameterWorkspaceViewStore;
}) {
  const { sessionStore, parameterStore, chromeStore, parameterViewStore } = stores;

  const activeWorkspace = writable<AppShellWorkspace>("overview");
  const vehiclePanelOpen = writable(false);
  const parameterReviewOpen = writable(false);

  const stagedCount = derived(parameterViewStore, ($parameterViewStore) => $parameterViewStore.stagedCount);
  const activeEnvelopeText = derived(sessionStore, ($sessionStore) =>
    $sessionStore.activeEnvelope
      ? `${$sessionStore.activeEnvelope.session_id} · rev ${$sessionStore.activeEnvelope.reset_revision}`
      : "no active session",
  );
  const drawerState = derived(
    [chromeStore, vehiclePanelOpen],
    ([$chromeStore, $vehiclePanelOpen]) =>
      $chromeStore.vehiclePanelMode === "drawer" ? ($vehiclePanelOpen ? "open" : "closed") : "docked",
  );
  const showVehiclePanelButton = derived(chromeStore, ($chromeStore) => $chromeStore.vehiclePanelMode === "drawer");
  const showDockedVehiclePanel = derived(drawerState, ($drawerState) => $drawerState === "docked");
  const vehiclePanelDrawerOpen = derived(drawerState, ($drawerState) => $drawerState === "open");

  const stopCloseDrawerWhenDocked = chromeStore.subscribe(($chromeStore) => {
    if ($chromeStore.vehiclePanelMode !== "drawer") {
      vehiclePanelOpen.set(false);
    }
  });
  const stopCloseReviewWhenNoStagedEdits = stagedCount.subscribe((nextStagedCount) => {
    if (nextStagedCount === 0) {
      parameterReviewOpen.set(false);
    }
  });

  async function initialize() {
    await Promise.all([sessionStore.initialize(), parameterStore.initialize()]);
  }

  function showWorkspace(workspace: AppShellWorkspace) {
    activeWorkspace.set(workspace);
  }

  const showOverviewWorkspace = () => showWorkspace("overview");
  const showSetupWorkspace = () => showWorkspace("setup");
  const showSettingsWorkspace = () => showWorkspace("settings");
  // Compatibility shim while tests/components still reference the previous helper name.
  const showParameterWorkspace = showSetupWorkspace;

  function toggleVehiclePanel() {
    vehiclePanelOpen.update((open) => !open);
  }

  function closeVehiclePanel() {
    vehiclePanelOpen.set(false);
  }

  function toggleParameterReview() {
    parameterReviewOpen.update((open) => !open);
  }

  function destroy() {
    stopCloseDrawerWhenDocked();
    stopCloseReviewWhenNoStagedEdits();
  }

  return {
    activeWorkspace,
    vehiclePanelOpen,
    parameterReviewOpen,
    stagedCount,
    activeEnvelopeText,
    drawerState,
    showVehiclePanelButton,
    showDockedVehiclePanel,
    vehiclePanelDrawerOpen,
    showWorkspace,
    initialize,
    showOverviewWorkspace,
    showSetupWorkspace,
    showSettingsWorkspace,
    showParameterWorkspace,
    toggleVehiclePanel,
    closeVehiclePanel,
    toggleParameterReview,
    destroy,
  } satisfies {
    activeWorkspace: Readable<AppShellWorkspace>;
    vehiclePanelOpen: Readable<boolean>;
    parameterReviewOpen: Readable<boolean>;
    stagedCount: Readable<number>;
    activeEnvelopeText: Readable<string>;
    drawerState: Readable<"open" | "closed" | "docked">;
    showVehiclePanelButton: Readable<boolean>;
    showDockedVehiclePanel: Readable<boolean>;
    vehiclePanelDrawerOpen: Readable<boolean>;
    showWorkspace: (workspace: AppShellWorkspace) => void;
    initialize: () => Promise<void>;
    showOverviewWorkspace: () => void;
    showSetupWorkspace: () => void;
    showSettingsWorkspace: () => void;
    showParameterWorkspace: () => void;
    toggleVehiclePanel: () => void;
    closeVehiclePanel: () => void;
    toggleParameterReview: () => void;
    destroy: () => void;
  };
}
