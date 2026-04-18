<script lang="ts">
import { onMount } from "svelte";

import type {
  CatalogTargetSummary,
  DfuDeviceInfo,
} from "../../firmware";
import type { FirmwareFileIo } from "../../lib/firmware-file-io";
import type { FirmwareService } from "../../lib/platform/firmware";
import {
  createLocalFileSourceMetadata,
  createOfficialBootloaderSourceMetadata,
  type FirmwareWorkspaceStore,
} from "../../lib/stores/firmware-workspace";
import { sanitizeCatalogTargetSummaries } from "./firmware-target-filter";
import type { FirmwareWorkspaceLayout } from "./firmware-workspace-layout";
import { firmwareWorkspaceTestIds } from "./firmware-workspace-test-ids";

type CatalogLoadPhase = "idle" | "loading" | "ready" | "failed";
type ManualRecoveryKind = "local_apj_bytes" | "local_bin_bytes";

type Props = {
  store: FirmwareWorkspaceStore;
  service: FirmwareService;
  fileIo: FirmwareFileIo;
  layout: FirmwareWorkspaceLayout;
};

let {
  store,
  service,
  fileIo,
  layout,
}: Props = $props();

let state = $derived($store);
let isRecoveryActive = $derived(state.activePath === "dfu_recovery");
let isRecoveryCancelling = $derived(
  state.sessionStatus.kind === "cancelling" && state.sessionStatus.path === "dfu_recovery",
);
let usingManualSource = $derived(
  state.recovery.source?.kind === "local_apj_bytes" || state.recovery.source?.kind === "local_bin_bytes",
);
let usingOfficialSource = $derived(state.recovery.source?.kind === "official_bootloader");

let recoveryTargets = $state<CatalogTargetSummary[]>([]);
let targetPhase = $state<CatalogLoadPhase>("idle");
let targetError = $state<string | null>(null);
let targetRequest = 0;
let advancedRequestedOpen = $state(false);
let manualKind = $state<ManualRecoveryKind>("local_apj_bytes");
let dfuConfirmed = $state(false);
let manualConfirmed = $state(false);
let lastManualSourceKey = "";

function targetKey(target: CatalogTargetSummary | null): string {
  return target ? `${target.board_id}:${target.platform}` : "";
}

function targetLabel(target: CatalogTargetSummary | null): string {
  if (!target) {
    return "No official target selected";
  }

  return target.brand_name ?? target.platform;
}

function targetDetail(target: CatalogTargetSummary | null): string {
  if (!target) {
    return "Explicit target selection required when multiple official bootloaders are available.";
  }

  const details = [
    target.brand_name && target.brand_name !== target.platform ? target.platform : null,
    target.manufacturer,
    `Board ID ${target.board_id}`,
  ].filter((value): value is string => Boolean(value));

  return details.join(" · ");
}

function targetMetadata(target: CatalogTargetSummary): string {
  return [
    target.brand_name && target.brand_name !== target.platform ? target.platform : null,
    target.manufacturer,
    `Board ID ${target.board_id}`,
  ].filter((value): value is string => Boolean(value)).join(" · ");
}

function deviceLabel(device: DfuDeviceInfo | null): string {
  if (!device) {
    return "No DFU device selected";
  }

  return device.product ?? device.manufacturer ?? device.unique_id;
}

function deviceDetail(device: DfuDeviceInfo | null): string {
  if (!device) {
    return "If more than one DFU device is present, choose the exact bootloader target explicitly before recovery starts.";
  }

  const details = [
    device.serial_number,
    device.manufacturer,
    `0x${device.vid.toString(16).padStart(4, "0")}:0x${device.pid.toString(16).padStart(4, "0")}`,
    device.unique_id,
  ].filter((value): value is string => Boolean(value));

  return details.join(" · ");
}

function createOfficialMetadata(target: CatalogTargetSummary) {
  const detail = targetMetadata(target);
  return createOfficialBootloaderSourceMetadata(target.platform, detail.length > 0 ? detail : null);
}

async function selectOfficialTarget(target: CatalogTargetSummary | null) {
  store.setRecoveryTarget(target);

  if (!target) {
    store.setRecoverySource(null, null);
    return;
  }

  store.setRecoverySource(
    { kind: "official_bootloader", board_target: target.platform },
    createOfficialMetadata(target),
  );
}

async function loadRecoveryTargets() {
  const requestId = ++targetRequest;
  targetPhase = "loading";
  targetError = null;

  try {
    const rawTargets = await service.recoveryCatalogTargets();
    if (requestId !== targetRequest) {
      return;
    }

    if (!Array.isArray(rawTargets)) {
      throw new Error("Firmware recovery catalog targets returned an unexpected payload.");
    }

    recoveryTargets = sanitizeCatalogTargetSummaries(rawTargets);
    targetPhase = "ready";
    targetError = null;

    const matchedTarget = state.recovery.target
      ? recoveryTargets.find((target) => targetKey(target) === targetKey(state.recovery.target)) ?? null
      : null;

    if (matchedTarget) {
      if (state.recovery.source?.kind === "official_bootloader" && state.recovery.source.board_target !== matchedTarget.platform) {
        await selectOfficialTarget(matchedTarget);
      } else if (!state.recovery.target || targetKey(state.recovery.target) !== targetKey(matchedTarget)) {
        store.setRecoveryTarget(matchedTarget);
      }
      return;
    }

    if (recoveryTargets.length === 1 && !usingManualSource) {
      await selectOfficialTarget(recoveryTargets[0]);
      return;
    }

    if (state.recovery.target !== null) {
      store.setRecoveryTarget(null);
    }

    if (state.recovery.source?.kind === "official_bootloader") {
      store.setRecoverySource(null, null);
    }
  } catch (error) {
    if (requestId !== targetRequest) {
      return;
    }

    targetPhase = "failed";
    targetError = service.formatError(error);
  }
}

async function handleManualBrowse() {
  try {
    const result = manualKind === "local_apj_bytes"
      ? await fileIo.pickApjFile()
      : await fileIo.pickBinFile();
    if (result.status === "cancelled") {
      return;
    }

    store.setRecoverySource(
      result.selection,
      createLocalFileSourceMetadata({
        kind: result.selection.kind,
        fileName: result.selection.fileName,
        byteLength: result.selection.byteLength,
        digest: result.selection.digest,
        detail: `${result.selection.byteLength} bytes`,
      }),
    );
  } catch (error) {
    manualConfirmed = false;
    store.setRecoverySourceError(service.formatError(error));
  }
}

function setManualKind(nextKind: ManualRecoveryKind) {
  manualKind = nextKind;
  manualConfirmed = false;
  store.setRecoverySourceError(null);

  if (state.recovery.source?.kind === "local_apj_bytes" || state.recovery.source?.kind === "local_bin_bytes") {
    if (state.recovery.source.kind !== nextKind) {
      store.setRecoverySource(null, null);
    }
  }
}

function recoveryStateLabel() {
  if (isRecoveryCancelling) {
    return "cancelling";
  }

  if (isRecoveryActive) {
    return `active:${state.sessionPhase ?? "running"}`;
  }

  if (usingOfficialSource) {
    return "official-ready";
  }

  if (usingManualSource) {
    return "manual-armed";
  }

  return state.recovery.scanPhase;
}

let selectedTargetKey = $derived(state.recovery.target ? targetKey(state.recovery.target) : "");
let manualPanelOpen = $derived(advancedRequestedOpen || usingManualSource || Boolean(state.recovery.sourceError));
let recoverySourceState = $derived.by(() => {
  const metadata = state.recovery.sourceMetadata;
  if (!metadata) {
    return "No DFU recovery source armed";
  }

  const detail = metadata.detail ? ` · ${metadata.detail}` : "";
  return `${metadata.kind} · ${metadata.label}${detail}`;
});
let recoveryBlockedReason = $derived.by(() => {
  if (!layout.actionsEnabled) {
    return layout.blockedDetail ?? "Firmware start is blocked on constrained layouts.";
  }

  if (state.recovery.scanPhase === "loading" && state.recovery.devices.length === 0) {
    return "Scanning for DFU devices. Keep the controller in DFU mode until it appears here.";
  }

  if (state.recovery.scanError) {
    return state.recovery.scanError;
  }

  if (state.recovery.devices.length === 0) {
    return "No DFU device is currently visible. Connect the controller in DFU mode and rescan.";
  }

  if (state.recovery.device === null) {
    return "More than one DFU device is visible. Choose the exact device explicitly before starting recovery.";
  }

  if (usingOfficialSource && state.recovery.target === null) {
    return recoveryTargets.length === 0
      ? "No official bootloader target is available right now. Retry the target list or use a validated manual recovery image."
      : "Choose the exact official bootloader target before starting recovery.";
  }

  if (state.recovery.source === null) {
    return "Choose an official bootloader target or supply a validated manual APJ/BIN image before starting recovery.";
  }

  if (state.recovery.sourceError) {
    return state.recovery.sourceError;
  }

  if (usingManualSource && !manualConfirmed) {
    return "Manual APJ/BIN recovery stays disabled until you confirm the supplied file is the exact bootloader image for this board.";
  }

  if (!dfuConfirmed) {
    return "Acknowledge the DFU safety warning before starting recovery.";
  }

  return "Ready to recover the bootloader. After a verified recovery, return to Install / Update and flash normal firmware over serial.";
});
let canStartRecovery = $derived(
  layout.actionsEnabled
  && !isRecoveryActive
  && !isRecoveryCancelling
  && state.recovery.device !== null
  && state.recovery.source !== null
  && (!usingOfficialSource || state.recovery.target !== null)
  && (!usingManualSource || manualConfirmed)
  && dfuConfirmed,
);

onMount(() => {
  void loadRecoveryTargets();
});

$effect(() => {
  const currentSourceKey = state.recovery.source?.kind === "local_apj_bytes"
    ? `local_apj_bytes:${state.recovery.source.data.length}:${state.recovery.sourceMetadata?.digest ?? ""}`
    : state.recovery.source?.kind === "local_bin_bytes"
      ? `local_bin_bytes:${state.recovery.source.data.length}:${state.recovery.sourceMetadata?.digest ?? ""}`
      : state.recovery.source?.kind ?? "none";

  if (currentSourceKey === lastManualSourceKey) {
    return;
  }

  lastManualSourceKey = currentSourceKey;
  manualConfirmed = false;

  if (state.recovery.source?.kind === "local_apj_bytes" || state.recovery.source?.kind === "local_bin_bytes") {
    manualKind = state.recovery.source.kind;
  }
});
</script>

<section
  class="rounded-lg border border-border bg-bg-secondary/40 p-3"
  data-testid={firmwareWorkspaceTestIds.recoveryPanel}
>
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">DFU recovery</p>
      <h3 class="mt-2 text-lg font-semibold text-text-primary">Recover bootloader</h3>
      <p class="mt-2 max-w-3xl text-sm leading-relaxed text-text-secondary" data-testid={firmwareWorkspaceTestIds.recoveryGuidance}>
        This is a separate rescue path for boards that need bootloader recovery. Restore the bootloader here, then return to Install / Update and flash normal ArduPilot firmware over serial.
      </p>
    </div>

    <div
      class="rounded-full border border-border bg-bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary"
      data-testid={firmwareWorkspaceTestIds.recoveryState}
    >
      {recoveryStateLabel()}
    </div>
  </div>

  <div class="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
    <article class="rounded-lg border border-border bg-bg-primary/80 p-3">
      <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <label>
          <span class="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">DFU device</span>
          <select
            class="mt-2 w-full rounded-xl border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary"
            data-testid={firmwareWorkspaceTestIds.recoveryDeviceSelect}
            disabled={isRecoveryActive}
            onchange={(event) => store.setRecoveryDevice(
              state.recovery.devices.find((device) => device.unique_id === (event.currentTarget as HTMLSelectElement).value) ?? null,
            )}
            value={state.recovery.device?.unique_id ?? ""}
          >
            <option value="">Choose DFU device…</option>
            {#each state.recovery.devices as device (device.unique_id)}
              <option value={device.unique_id}>{deviceLabel(device)}</option>
            {/each}
          </select>
        </label>

        <button
          class="rounded-xl border border-border bg-bg-secondary px-3 py-2 text-sm font-semibold text-text-primary transition hover:border-border-light hover:bg-bg-primary disabled:opacity-50"
          data-testid={firmwareWorkspaceTestIds.recoveryDeviceRefresh}
          disabled={isRecoveryActive}
          onclick={() => void store.refreshRecoveryDevices()}
          type="button"
        >
          Rescan DFU
        </button>
      </div>

      <div
        class="mt-3 rounded-xl border border-border/70 bg-bg-primary px-3 py-2 text-xs text-text-secondary"
        data-testid={firmwareWorkspaceTestIds.recoveryDeviceState}
      >
        <span class="font-semibold text-text-primary">Selected device</span>
        <p class="mt-1">{deviceLabel(state.recovery.device)} · {deviceDetail(state.recovery.device)}</p>
      </div>

      {#if state.recovery.scanError}
        <div class="mt-3 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.recovery.scanError}
        </div>
      {/if}

      <div class="mt-4 rounded-lg border border-success/30 bg-success/10 p-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Official bootloader</p>
            <h4 class="mt-1 text-sm font-semibold text-text-primary">Primary recovery source</h4>
          </div>
          {#if !usingOfficialSource && state.recovery.target}
            <button
              class="rounded-md border border-success/30 bg-bg-primary px-3 py-1.5 text-xs font-semibold text-success transition hover:bg-success/5"
              data-testid={firmwareWorkspaceTestIds.recoveryOfficialAction}
              onclick={() => void selectOfficialTarget(state.recovery.target)}
              type="button"
            >
              Use official bootloader
            </button>
          {/if}
        </div>

        <p class="mt-2 text-sm leading-relaxed text-text-secondary">
          Official bootloader recovery stays primary. It writes the known bootloader image for the selected target, then hands you back to Install / Update for the normal firmware flash.
        </p>

        <label class="mt-3 block">
          <span class="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Official target</span>
          <select
            class="mt-2 w-full rounded-xl border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary"
            data-testid={firmwareWorkspaceTestIds.recoveryTargetSelect}
            disabled={isRecoveryActive || recoveryTargets.length === 0}
            onchange={(event) => {
              const key = (event.currentTarget as HTMLSelectElement).value;
              const nextTarget = recoveryTargets.find((target) => targetKey(target) === key) ?? null;
              void selectOfficialTarget(nextTarget);
            }}
            value={selectedTargetKey}
          >
            <option value="">Choose official bootloader target…</option>
            {#each recoveryTargets as target (targetKey(target))}
              <option value={targetKey(target)}>{targetLabel(target)} · {targetMetadata(target)}</option>
            {/each}
          </select>
        </label>

        {#if targetError}
          <div
            class="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
            data-testid={firmwareWorkspaceTestIds.recoveryTargetError}
          >
            <span>{targetError}</span>
            <button
              class="rounded-md border border-danger/40 bg-bg-primary px-3 py-1.5 text-xs font-semibold text-danger transition hover:bg-danger/5"
              data-testid={firmwareWorkspaceTestIds.recoveryTargetRetry}
              onclick={() => void loadRecoveryTargets()}
              type="button"
            >
              Retry targets
            </button>
          </div>
        {/if}

        {#if targetPhase === "ready" && recoveryTargets.length === 0}
          <p
            class="mt-3 rounded-xl border border-border bg-bg-primary px-3 py-2 text-sm text-text-secondary"
            data-testid={firmwareWorkspaceTestIds.recoveryTargetEmpty}
          >
            No official bootloader targets are available right now. Retry the target list or supply a validated manual APJ/BIN image.
          </p>
        {/if}

        <div
          class="mt-3 rounded-xl border border-border/70 bg-bg-primary px-3 py-2 text-xs text-text-secondary"
          data-testid={firmwareWorkspaceTestIds.recoveryTargetState}
        >
          <span class="font-semibold text-text-primary">Active official target</span>
          <p class="mt-1">{targetLabel(state.recovery.target)} · {targetDetail(state.recovery.target)}</p>
        </div>
      </div>
    </article>

    <article class="rounded-lg border border-warning/40 bg-warning/10 p-3">
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Advanced recovery</p>
          <h4 class="mt-1 text-sm font-semibold text-text-primary">Manual APJ / BIN source</h4>
        </div>
        <button
          class="rounded-md border border-warning/30 bg-bg-primary px-3 py-1.5 text-xs font-semibold text-warning transition hover:bg-warning/5"
          data-testid={firmwareWorkspaceTestIds.recoveryAdvancedToggle}
          onclick={() => (advancedRequestedOpen = !advancedRequestedOpen)}
          type="button"
        >
          {manualPanelOpen ? "Hide advanced" : "Show advanced"}
        </button>
      </div>

      <p class="mt-2 text-sm leading-relaxed text-text-secondary">
        Use manual recovery only when you deliberately need to bypass the official bootloader catalog.
      </p>

      <div
        class="mt-3 rounded-xl border border-border/70 bg-bg-primary px-3 py-2 text-xs text-text-secondary"
        data-testid={firmwareWorkspaceTestIds.recoverySourceState}
      >
        <span class="font-semibold text-text-primary">Active recovery source</span>
        <p class="mt-1">{recoverySourceState}</p>
      </div>

      {#if manualPanelOpen}
        <div class="mt-3 space-y-3" data-testid={firmwareWorkspaceTestIds.recoveryManualPanel}>
          <div
            class="rounded-xl border border-warning/40 bg-bg-primary px-3 py-3 text-sm text-warning"
            data-testid={firmwareWorkspaceTestIds.recoveryManualWarning}
          >
            Manual local files may replace bootloader contents or leave the board non-bootable if the wrong image is used. Keep this path for expert recovery only.
          </div>

          <div class="grid gap-2 sm:grid-cols-2">
            <button
              class={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${manualKind === "local_apj_bytes"
                ? "border-warning/40 bg-warning/10 text-warning"
                : "border-border bg-bg-primary text-text-primary hover:border-warning/30 hover:text-warning"}`}
              data-testid={firmwareWorkspaceTestIds.recoveryManualApj}
              onclick={() => setManualKind("local_apj_bytes")}
              type="button"
            >
              Use manual APJ
            </button>
            <button
              class={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${manualKind === "local_bin_bytes"
                ? "border-warning/40 bg-warning/10 text-warning"
                : "border-border bg-bg-primary text-text-primary hover:border-warning/30 hover:text-warning"}`}
              data-testid={firmwareWorkspaceTestIds.recoveryManualBin}
              onclick={() => setManualKind("local_bin_bytes")}
              type="button"
            >
              Use manual BIN
            </button>
          </div>

          <button
            class="rounded-xl border border-border bg-bg-primary px-3 py-2 text-sm font-semibold text-text-primary transition hover:border-warning hover:text-warning"
            data-testid={firmwareWorkspaceTestIds.recoveryBrowse}
            disabled={isRecoveryActive}
            onclick={() => void handleManualBrowse()}
            type="button"
          >
            {manualKind === "local_apj_bytes" ? "Choose manual APJ" : "Choose manual BIN"}
          </button>

          {#if state.recovery.sourceError}
            <div
              class="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
              data-testid={firmwareWorkspaceTestIds.recoverySourceError}
            >
              {state.recovery.sourceError}
            </div>
          {/if}

          {#if usingManualSource}
            <label class="flex items-start gap-3 rounded-xl border border-warning/30 bg-bg-primary px-3 py-3 text-sm text-text-secondary">
              <input
                checked={manualConfirmed}
                class="mt-1"
                data-testid={firmwareWorkspaceTestIds.recoveryManualConfirm}
                onchange={(event) => (manualConfirmed = (event.currentTarget as HTMLInputElement).checked)}
                type="checkbox"
              />
              <span>
                <span class="font-semibold text-text-primary">Manual file confirmation</span><br />
                I confirm I am manually supplying the exact bootloader image for this board and understand that the wrong APJ/BIN can leave it non-bootable.
              </span>
            </label>
          {/if}
        </div>
      {/if}
    </article>
  </div>

  <div class="mt-4 rounded-lg border border-border/70 bg-bg-primary/80 p-3">
    <label class="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-3 text-sm text-text-secondary">
      <input
        checked={dfuConfirmed}
        class="mt-1"
        data-testid={firmwareWorkspaceTestIds.recoverySafetyConfirm}
        onchange={(event) => (dfuConfirmed = (event.currentTarget as HTMLInputElement).checked)}
        type="checkbox"
      />
      <span>
        <span class="font-semibold text-text-primary">DFU safety acknowledgment</span><br />
        I understand that DFU bootloader recovery bypasses the normal serial safety flow and should only be used for explicit bootloader rescue.
      </span>
    </label>

    <div class="mt-3 rounded-xl border border-border bg-bg-secondary px-3 py-3 text-sm text-text-secondary">
      <p data-testid={firmwareWorkspaceTestIds.recoveryBlockedReason}>{recoveryBlockedReason}</p>
    </div>

    {#if isRecoveryActive}
      <div class="mt-3 rounded-xl border border-warning/40 bg-warning/10 px-3 py-3 text-sm text-text-primary">
        <p class="font-semibold">DFU recovery in progress</p>
        <p class="mt-1">{state.progress?.phase_label ?? state.sessionPhase ?? "working"}</p>
        {#if state.progress}
          <div class="mt-3 h-2 overflow-hidden rounded-full bg-bg-primary/70" data-testid={firmwareWorkspaceTestIds.recoveryProgress}>
            <div class="h-full rounded-full bg-warning transition-[width]" style={`width: ${Math.max(0, Math.min(100, state.progress.pct))}%`}></div>
          </div>
          <p class="mt-2 text-xs text-text-secondary">
            {state.progress.bytes_written} / {state.progress.bytes_total} bytes · {Math.round(state.progress.pct)}%
          </p>
        {/if}
      </div>
    {/if}

    <div class="mt-4 flex flex-wrap gap-3">
      {#if isRecoveryActive && !isRecoveryCancelling}
        <button
          class="rounded-xl border border-warning/40 bg-warning/10 px-4 py-2 text-sm font-semibold text-warning transition hover:brightness-105"
          data-testid={firmwareWorkspaceTestIds.cancelRecovery}
          onclick={() => void store.cancel()}
          type="button"
        >
          Cancel recovery
        </button>
      {/if}

      <button
        class="rounded-xl bg-warning px-4 py-2 text-sm font-semibold text-bg-primary transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
        data-testid={firmwareWorkspaceTestIds.startRecovery}
        disabled={!canStartRecovery || isRecoveryActive || isRecoveryCancelling}
        onclick={() => void store.startDfuRecovery()}
        type="button"
      >
        Start recovery
      </button>
    </div>
  </div>
</section>
