import { derived, get, writable, type Readable } from "svelte/store";

import type { ParamsStore } from "../../lib/stores/params";
import type { SessionStore } from "../../lib/stores/session";
import type { ShellChromeStore } from "./runtime-context";
import { trackAnalytics } from "../../lib/analytics/client";
import { isAutoConnectSitlEnabled } from "../../lib/platform/session";

export type AppShellController = ReturnType<typeof createAppShellController>;

export function createAppShellController(stores: {
  sessionStore: SessionStore;
  parameterStore: ParamsStore;
  chromeStore: ShellChromeStore;
}) {
  const { sessionStore, parameterStore, chromeStore } = stores;

  const vehiclePanelOpen = writable(false);

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
  async function initialize() {
    await Promise.all([sessionStore.initialize(), parameterStore.initialize()]);

    const sessionState = get(sessionStore);
    const selectedTransportDescriptor = sessionState.transportDescriptors.find(
      (descriptor) => descriptor.kind === sessionState.connectionForm.mode,
    );
    const canAutoConnect =
      isAutoConnectSitlEnabled() &&
      !sessionState.optimisticConnection &&
      sessionState.sessionDomain.value?.connection.kind === "disconnected" &&
      selectedTransportDescriptor?.available === true;

    if (canAutoConnect) {
      void sessionStore.connect();
    }
  }

  function toggleVehiclePanel() {
    const nextOpen = !get(vehiclePanelOpen);
    const layout = get(chromeStore).vehiclePanelMode;
    vehiclePanelOpen.set(nextOpen);
    trackAnalytics("vehicle_panel_toggled", {
      state: nextOpen ? "open" : "closed",
      layout,
    });
  }

  function closeVehiclePanel() {
    vehiclePanelOpen.set(false);
  }

  function destroy() {
    stopCloseDrawerWhenDocked();
  }

  return {
    vehiclePanelOpen,
    activeEnvelopeText,
    drawerState,
    showVehiclePanelButton,
    showDockedVehiclePanel,
    vehiclePanelDrawerOpen,
    initialize,
    toggleVehiclePanel,
    closeVehiclePanel,
    destroy,
  } satisfies {
    vehiclePanelOpen: Readable<boolean>;
    activeEnvelopeText: Readable<string>;
    drawerState: Readable<"open" | "closed" | "docked">;
    showVehiclePanelButton: Readable<boolean>;
    showDockedVehiclePanel: Readable<boolean>;
    vehiclePanelDrawerOpen: Readable<boolean>;
    initialize: () => Promise<void>;
    toggleVehiclePanel: () => void;
    closeVehiclePanel: () => void;
    destroy: () => void;
  };
}
