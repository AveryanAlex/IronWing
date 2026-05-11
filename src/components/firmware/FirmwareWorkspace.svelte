<script lang="ts">
import { onDestroy, onMount } from "svelte";
import { fromStore, readable, type Readable } from "svelte/store";

import type { ShellChromeState } from "../../app/shell/chrome-state";
import { getSessionViewStoreContext, getShellChromeStoreContext } from "../../app/shell/runtime-context";
import { createFirmwareFileIo, type FirmwareFileIo } from "../../lib/firmware-file-io";
import {
  createFirmwareService,
  type FirmwareService,
} from "../../lib/platform/firmware";
import {
  createFirmwareWorkspaceStore,
  type FirmwareWorkspaceStore,
} from "../../lib/stores/firmware-workspace";
import FirmwareOutcomePanel from "./FirmwareOutcomePanel.svelte";
import FirmwareRecoveryPanel from "./FirmwareRecoveryPanel.svelte";
import FirmwareSerialPanel from "./FirmwareSerialPanel.svelte";
import {
  firmwareWorkspaceFallbackChromeState,
  resolveFirmwareWorkspaceLayout,
} from "./firmware-workspace-layout";
import { firmwareWorkspaceTestIds } from "./firmware-workspace-test-ids";
import { REPLAY_READONLY_COPY, REPLAY_READONLY_TITLE, isReplayReadonly } from "../../lib/replay-readonly";

const internalService = createFirmwareService();
const internalStore = createFirmwareWorkspaceStore(internalService);
const internalFileIo = createFirmwareFileIo();

type WorkspaceMode = "install" | "recovery";

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
  store = internalStore,
  service = internalService,
  fileIo = internalFileIo,
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
  workspaceState.activePath === "serial_primary"
  || (workspaceState.sessionStatus.kind === "cancelling" && workspaceState.sessionStatus.path === "serial_primary"),
);
let recoveryBusy = $derived(
  workspaceState.activePath === "dfu_recovery"
  || (workspaceState.sessionStatus.kind === "cancelling" && workspaceState.sessionStatus.path === "dfu_recovery"),
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
  effectiveMode === "install"
  && workspaceState.lastCompletedOutcome?.path === "dfu_recovery"
  && workspaceState.lastCompletedOutcome.outcome.result === "verified",
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
  const autoReturnOutcomeKey = workspaceState.lastCompletedOutcome?.path === "dfu_recovery"
    && workspaceState.lastCompletedOutcome.outcome.result === "verified"
    ? "dfu_recovery:verified"
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

<section
  class="firmware-workspace"
  data-actions-enabled={layout.actionsEnabled ? "true" : "false"}
  data-layout-mode={layout.mode}
  data-testid={firmwareWorkspaceTestIds.root}
>
  <div class="flex flex-wrap items-start justify-between gap-4">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Firmware workspace</p>
      <h2 class="mt-2 text-2xl font-semibold text-text-primary">Install / Update and DFU recovery</h2>
      <p class="mt-2 max-w-4xl text-sm leading-relaxed text-text-secondary">
        Keep normal serial install/update and DFU bootloader rescue as separate operator paths while preserving exact retry, source, and outcome facts across workspace switches.
      </p>
    </div>

    <div
      class={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] ${effectiveMode === "install"
        ? "border-accent/30 bg-accent/10 text-accent"
        : "border-warning/30 bg-warning/10 text-warning"}`}
      data-testid={firmwareWorkspaceTestIds.mode}
    >
      {effectiveMode === "install" ? "install-update" : "dfu-recovery"}
    </div>
  </div>

  <div class="mt-4 grid gap-3 md:grid-cols-2">
    <button
      aria-pressed={effectiveMode === "install"}
      class={`rounded-lg border px-4 py-3 text-left transition ${effectiveMode === "install"
        ? "border-accent/40 bg-accent/10"
        : "border-border bg-bg-secondary hover:border-accent/30 hover:bg-bg-primary"}`}
      data-testid={firmwareWorkspaceTestIds.modeInstall}
      disabled={recoveryBusy || serialBusy || replayReadonly}
      onclick={() => (selectedMode = "install")}
      type="button"
    >
      <span class="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Install / Update</span>
      <span class="mt-1 block text-sm font-semibold text-text-primary">Primary serial path</span>
      <span class="mt-1 block text-sm text-text-secondary">Use the official APJ catalog first, with a clearly marked local APJ override for expert cases.</span>
    </button>

    <button
      aria-pressed={effectiveMode === "recovery"}
      class={`rounded-lg border px-4 py-3 text-left transition ${effectiveMode === "recovery"
        ? "border-warning/40 bg-warning/10"
        : "border-border bg-bg-secondary hover:border-warning/30 hover:bg-bg-primary"}`}
      data-testid={firmwareWorkspaceTestIds.modeRecovery}
      disabled={recoveryBusy || serialBusy || replayReadonly}
      onclick={() => (selectedMode = "recovery")}
      type="button"
    >
      <span class="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">DFU recovery</span>
      <span class="mt-1 block text-sm font-semibold text-text-primary">Separate bootloader rescue path</span>
      <span class="mt-1 block text-sm text-text-secondary">Recover only the bootloader here, then return to Install / Update for the normal firmware flash.</span>
    </button>
  </div>

  {#if !layout.actionsEnabled}
    <div
      class="mt-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-4 text-sm text-warning"
      data-testid={firmwareWorkspaceTestIds.blockedCopy}
    >
      <p class="font-semibold" data-testid={firmwareWorkspaceTestIds.blockedReason}>{layout.blockedTitle}</p>
      <p class="mt-1">{layout.blockedDetail}</p>
    </div>
  {/if}

  {#if replayReadonly}
    <div class="mt-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-4 text-sm text-warning" data-testid="firmware-replay-readonly-banner">
      <p class="font-semibold">{REPLAY_READONLY_TITLE}</p>
      <p class="mt-1">{REPLAY_READONLY_COPY}</p>
    </div>
  {/if}

  {#if workspaceState.lastError}
    <div class="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-4 text-sm text-danger">
      {workspaceState.lastError}
    </div>
  {/if}

  {#if showReturnGuidance}
    <div
      class="mt-4 rounded-lg border border-success/30 bg-success/10 px-4 py-4 text-sm text-success"
      data-testid={firmwareWorkspaceTestIds.returnGuidance}
    >
      <p class="font-semibold">Bootloader recovery verified</p>
      <p class="mt-1">Return to Install / Update now, reconnect over serial if needed, and flash the normal flight firmware. The recovery outcome remains visible below until you dismiss it.</p>
    </div>
  {/if}

  <div aria-hidden="true" class="hidden">
    <span data-testid={firmwareWorkspaceTestIds.layoutMode}>{layout.mode}</span>
    <span data-testid={firmwareWorkspaceTestIds.layoutTier}>{layout.tier}</span>
    <span data-testid={firmwareWorkspaceTestIds.layoutTierMismatch}>{layout.tierMismatch ? "mismatch" : "match"}</span>
  </div>

  <div class="mt-4 grid gap-4">
    {#if effectiveMode === "install"}
      <FirmwareSerialPanel {fileIo} layout={layout} {replayReadonly} {service} {store} />
    {:else}
      <FirmwareRecoveryPanel {fileIo} layout={layout} {replayReadonly} {service} {store} />
    {/if}

		<FirmwareOutcomePanel state={workspaceState} {store} />
  </div>
</section>

<style>
  .firmware-workspace {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow-y: auto;
  }
</style>
