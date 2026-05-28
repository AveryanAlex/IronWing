<script lang="ts">
import { onDestroy, onMount } from "svelte";
import { fromStore, readable, type Readable } from "svelte/store";

import type { ShellChromeState } from "../../../app/shell/chrome-state";
import {
  getFirmwareWorkspaceContext,
  getSessionViewStoreContext,
  getShellChromeStoreContext,
  type FirmwareWorkspaceContext,
} from "../../../app/shell/runtime-context";
import { createFirmwareFileIo, type FirmwareFileIo } from "../../../lib/firmware-file-io";
import { createFirmwareService, type FirmwareService } from "../../../lib/platform/firmware";
import { createFirmwareWorkspaceStore, type FirmwareWorkspaceStore } from "../../../lib/stores/firmware-workspace";
import { Banner, SelectableCard, WorkspaceShell } from "../../../components/ui";
import FirmwareOutcomePanel from "../../../features/firmware/components/FirmwareOutcomePanel.svelte";
import FirmwareRecoveryPanel from "../../../features/firmware/components/FirmwareRecoveryPanel.svelte";
import FirmwareSerialPanel from "../../../features/firmware/components/FirmwareSerialPanel.svelte";
import {
  firmwareWorkspaceFallbackChromeState,
  resolveFirmwareWorkspaceLayout,
} from "../../../features/firmware/firmware-workspace-layout";
import { firmwareWorkspaceTestIds } from "../../../features/firmware/firmware-workspace-test-ids";
import { REPLAY_READONLY_COPY, REPLAY_READONLY_TITLE, isReplayReadonly } from "../../../lib/replay-readonly";

const internalService = createFirmwareService();
const internalStore = createFirmwareWorkspaceStore(internalService);
const internalFileIo = createFirmwareFileIo();

const defaultFirmwareWorkspace = resolveFirmwareWorkspaceContext();

type WorkspaceMode = "install" | "recovery";

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

function resolveSessionViewStore(): Readable<{ activeSource: "live" | "playback" | null }> {
  try {
    return getSessionViewStoreContext();
  } catch {
    return readable({ activeSource: null });
  }
}

type Props = {
  store?: FirmwareWorkspaceStore;
  service?: FirmwareService;
  fileIo?: FirmwareFileIo;
  chromeStore?: Readable<ShellChromeState>;
};

let {
  store = defaultFirmwareWorkspace.store,
  service = defaultFirmwareWorkspace.service,
  fileIo = defaultFirmwareWorkspace.fileIo,
  chromeStore = resolveChromeStore(),
}: Props = $props();

let selectedMode = $state<WorkspaceMode>("install");
let lastAutoReturnOutcomeKey = "";

let workspaceState = $derived($store);
let shellChrome = $derived($chromeStore);
let sessionView = fromStore(resolveSessionViewStore());
let layout = $derived(resolveFirmwareWorkspaceLayout(shellChrome));
let replayReadonly = $derived(isReplayReadonly(sessionView.current.activeSource));
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

onMount(() => {
  void store.initialize();
});

onDestroy(() => {
  if (store === internalStore) {
    store.reset();
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
  <div class="rounded-lg border border-border bg-bg-secondary p-1">
    <div class="grid gap-1 md:grid-cols-2">
      <SelectableCard
        density="compact"
        selected={effectiveMode === "install"}
        testId={firmwareWorkspaceTestIds.modeInstall}
        disabled={recoveryBusy || serialBusy}
        onSelect={() => (selectedMode = "install")}
      >
        <span class="text-xs font-semibold uppercase tracking-wide text-text-muted">Firmware install/update</span>
        <span class="mt-1 block text-sm font-semibold text-text-primary">Normal firmware path</span>
        <span class="mt-1 block text-sm text-text-secondary">Use the official APJ catalog first, with a clearly marked local APJ override for expert cases.</span>
      </SelectableCard>

      <SelectableCard
        density="compact"
        selected={effectiveMode === "recovery"}
        testId={firmwareWorkspaceTestIds.modeRecovery}
        disabled={recoveryBusy || serialBusy}
        onSelect={() => (selectedMode = "recovery")}
      >
        <span class="text-xs font-semibold uppercase tracking-wide text-text-muted">Bootloader installation</span>
        <span class="mt-1 block text-sm font-semibold text-text-primary">Native DFU bootloader path</span>
        <span class="mt-1 block text-sm text-text-secondary">Install only the bootloader here, then return to firmware install/update for normal firmware.</span>
      </SelectableCard>
    </div>
  </div>

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

  <div class="grid gap-4">
    {#if effectiveMode === "install"}
      <FirmwareSerialPanel {fileIo} layout={layout} {replayReadonly} {service} {store} />
    {:else}
      <FirmwareRecoveryPanel {fileIo} layout={layout} {replayReadonly} {service} {store} />
    {/if}

    <FirmwareOutcomePanel state={workspaceState} {store} />
  </div>
</WorkspaceShell>
