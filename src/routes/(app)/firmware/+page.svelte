<script lang="ts">
import { onDestroy, onMount } from "svelte";
import { readable, type Readable } from "svelte/store";

import type { ShellChromeState } from "../../../app/shell/chrome-state";
import {
  getFirmwareWorkspaceContext,
  getSerialPortInventoryContext,
  getSessionStoreContext,
  getSessionViewStoreContext,
  getShellChromeStoreContext,
  type FirmwareWorkspaceContext,
} from "../../../app/shell/runtime-context";
import { createFirmwareFileIo, type FirmwareFileIo } from "../../../lib/firmware-file-io";
import { createFirmwareService, type FirmwareService } from "../../../lib/platform/firmware";
import { createFirmwareWorkspaceStore, type FirmwareWorkspaceStore } from "../../../lib/stores/firmware-workspace";
import {
  createSerialPortInventoryStore,
  type SerialPortInventoryStore,
} from "../../../lib/stores/serial-port-inventory";
import type { SessionStore } from "../../../lib/stores/session";
import type { SessionEnvelope } from "../../../session";
import { Banner, WorkspaceShell } from "../../../components/ui";
import FirmwareOperationRail from "../../../features/firmware/components/FirmwareOperationRail.svelte";
import FirmwareRecoveryPanel from "../../../features/firmware/components/FirmwareRecoveryPanel.svelte";
import FirmwareSerialPanel from "../../../features/firmware/components/FirmwareSerialPanel.svelte";
import FirmwareTaskChooser from "../../../features/firmware/components/FirmwareTaskChooser.svelte";
import {
  firmwareWorkspaceFallbackChromeState,
  resolveFirmwareWorkspaceLayout,
} from "../../../features/firmware/firmware-workspace-layout";
import { firmwareWorkspaceTestIds } from "../../../features/firmware/firmware-workspace-test-ids";
import { REPLAY_READONLY_COPY, REPLAY_READONLY_TITLE, isReplayReadonly } from "../../../lib/replay-readonly";

const internalService = createFirmwareService();
const internalStore = createFirmwareWorkspaceStore(internalService);
const internalFileIo = createFirmwareFileIo();
const internalSerialInventory = createSerialPortInventoryStore();

const defaultFirmwareWorkspace = resolveFirmwareWorkspaceContext();

type WorkspaceMode = "install" | "recovery";
type FirmwareRouteSessionView = {
  activeSource: "live" | "playback" | null;
  activeEnvelope: SessionEnvelope | null;
  connected: boolean;
  isConnecting: boolean;
};

function resolveFirmwareWorkspaceContext(): FirmwareWorkspaceContext {
  try {
    return getFirmwareWorkspaceContext();
  } catch {
    return {
      store: internalStore,
      service: internalService,
      fileIo: internalFileIo,
    };
  }
}

function resolveChromeStore(): Readable<ShellChromeState> {
  try {
    return getShellChromeStoreContext();
  } catch {
    return readable(firmwareWorkspaceFallbackChromeState);
  }
}

function resolveSessionStore(): SessionStore | null {
  try {
    return getSessionStoreContext();
  } catch {
    return null;
  }
}

function resolveSessionViewStore(): Readable<FirmwareRouteSessionView> {
  try {
    return getSessionViewStoreContext() as Readable<FirmwareRouteSessionView>;
  } catch {
    return readable({ activeSource: null, activeEnvelope: null, connected: false, isConnecting: false });
  }
}

function resolveSerialPortInventory(): SerialPortInventoryStore {
  try {
    return getSerialPortInventoryContext();
  } catch {
    return internalSerialInventory;
  }
}

type Props = {
  store?: FirmwareWorkspaceStore;
  service?: FirmwareService;
  fileIo?: FirmwareFileIo;
  chromeStore?: Readable<ShellChromeState>;
  serialInventory?: SerialPortInventoryStore;
  sessionStore?: SessionStore | null;
  sessionViewStore?: Readable<FirmwareRouteSessionView>;
};

let {
  store = defaultFirmwareWorkspace.store,
  service = defaultFirmwareWorkspace.service,
  fileIo = defaultFirmwareWorkspace.fileIo,
  chromeStore = resolveChromeStore(),
  serialInventory = resolveSerialPortInventory(),
  sessionStore = resolveSessionStore(),
  sessionViewStore = resolveSessionViewStore(),
}: Props = $props();

let selectedMode = $state<WorkspaceMode>("install");
let lastAutoReturnOutcomeKey = "";

let workspaceState = $derived($store);
let shellChrome = $derived($chromeStore);
let sessionView = $derived($sessionViewStore);
let layout = $derived(resolveFirmwareWorkspaceLayout(shellChrome));
let replayReadonly = $derived(isReplayReadonly(sessionView.activeSource));
let serialBusy = $derived(
  workspaceState.activePath === "firmware_install_update" ||
    (workspaceState.sessionStatus.kind === "cancelling" &&
      workspaceState.sessionStatus.path === "firmware_install_update"),
);
let recoveryBusy = $derived(
  workspaceState.activePath === "bootloader_installation" ||
    (workspaceState.sessionStatus.kind === "cancelling" &&
      workspaceState.sessionStatus.path === "bootloader_installation"),
);
let effectiveMode = $derived.by<WorkspaceMode>(() => {
  if (serialBusy) {
    return "install";
  }

  if (recoveryBusy) {
    return "recovery";
  }

  return selectedMode;
});
let showReturnGuidance = $derived(
  effectiveMode === "install" &&
    workspaceState.lastCompletedOutcome?.path === "bootloader_installation" &&
    workspaceState.lastCompletedOutcome.outcome.result === "verified",
);
let splitOperationRail = $derived(layout.panelColumns === "split");
let workspaceBodyClass = $derived(
  splitOperationRail ? "grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start" : "grid gap-4",
);

onMount(() => {
  void store.initialize();
});

onDestroy(() => {
  if (store === internalStore) {
    store.reset();
  }
  if (serialInventory === internalSerialInventory) {
    serialInventory.reset();
  }
});

$effect(() => {
  const autoReturnOutcomeKey =
    workspaceState.lastCompletedOutcome?.path === "bootloader_installation" &&
    workspaceState.lastCompletedOutcome.outcome.result === "verified"
      ? "bootloader_installation:verified"
      : "";

  if (autoReturnOutcomeKey.length === 0) {
    lastAutoReturnOutcomeKey = "";
    return;
  }

  if (autoReturnOutcomeKey === lastAutoReturnOutcomeKey) {
    return;
  }

  lastAutoReturnOutcomeKey = autoReturnOutcomeKey;
  selectedMode = "install";
});
</script>

<WorkspaceShell mode="inset" testId={firmwareWorkspaceTestIds.root}>
  <FirmwareTaskChooser
    mode={effectiveMode}
    disabled={recoveryBusy || serialBusy}
    onModeChange={(mode) => (selectedMode = mode)}
  />

  {#if !layout.actionsEnabled}
    <div data-testid={firmwareWorkspaceTestIds.blockedCopy}>
      <Banner
        severity="warning"
        title={layout.blockedTitle ?? "Firmware actions blocked"}
        titleTestId={firmwareWorkspaceTestIds.blockedReason}
        message={layout.blockedDetail ?? undefined}
      />
    </div>
  {/if}

  {#if replayReadonly}
    <Banner
      severity="warning"
      title={REPLAY_READONLY_TITLE}
      message={REPLAY_READONLY_COPY}
      testId="firmware-replay-readonly-banner"
    />
  {/if}

  {#if workspaceState.lastError}
    <Banner severity="danger" title={workspaceState.lastError} />
  {/if}

  {#if showReturnGuidance}
    <Banner
      severity="success"
      title="Bootloader installation verified"
      message="Return to firmware install/update now, reconnect over serial if needed, and flash the normal flight firmware. The bootloader outcome remains visible below until you dismiss it."
      testId={firmwareWorkspaceTestIds.returnGuidance}
    />
  {/if}

  <div aria-hidden="true" class="hidden">
    <span data-testid={firmwareWorkspaceTestIds.mode}
      >{effectiveMode === "install" ? "firmware-install-update" : "bootloader-installation"}</span
    >
    <span data-testid={firmwareWorkspaceTestIds.layoutMode}>{layout.mode}</span>
  </div>

  <div class={workspaceBodyClass}>
    <div class="grid min-w-0 gap-4">
      {#if effectiveMode === "install"}
        <FirmwareSerialPanel {fileIo} layout={layout} {replayReadonly} {serialInventory} {service} {sessionStore} {sessionView} {store} />
      {:else}
        <FirmwareRecoveryPanel {fileIo} layout={layout} {replayReadonly} {service} {store} />
      {/if}
    </div>

    <FirmwareOperationRail state={workspaceState} {store} split={splitOperationRail} />
  </div>
</WorkspaceShell>
