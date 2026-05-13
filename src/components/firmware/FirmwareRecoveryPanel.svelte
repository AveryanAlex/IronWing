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
import { Banner, Button, Panel, SectionHeader, StatusPill } from "../ui";

type CatalogLoadPhase = "idle" | "loading" | "ready" | "failed";
type ManualRecoveryKind = "local_apj_bytes" | "local_bin_bytes";

type Props = {
  store: FirmwareWorkspaceStore;
  service: FirmwareService;
  fileIo: FirmwareFileIo;
  layout: FirmwareWorkspaceLayout;
  replayReadonly: boolean;
};

let {
  store,
  service,
  fileIo,
  layout,
  replayReadonly,
}: Props = $props();

let workspaceState = $derived($store);
let isRecoveryActive = $derived(workspaceState.activePath === "dfu_recovery");
let isRecoveryCancelling = $derived(
  workspaceState.sessionStatus.kind === "cancelling" && workspaceState.sessionStatus.path === "dfu_recovery",
);
let usingManualSource = $derived(
  workspaceState.recovery.source?.kind === "local_apj_bytes" || workspaceState.recovery.source?.kind === "local_bin_bytes",
);
let usingOfficialSource = $derived(workspaceState.recovery.source?.kind === "official_bootloader");

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

    const matchedTarget = workspaceState.recovery.target
      ? recoveryTargets.find((target) => targetKey(target) === targetKey(workspaceState.recovery.target)) ?? null
      : null;

    if (matchedTarget) {
      if (workspaceState.recovery.source?.kind === "official_bootloader" && workspaceState.recovery.source.board_target !== matchedTarget.platform) {
        await selectOfficialTarget(matchedTarget);
      } else if (!workspaceState.recovery.target || targetKey(workspaceState.recovery.target) !== targetKey(matchedTarget)) {
        store.setRecoveryTarget(matchedTarget);
      }
      return;
    }

    if (recoveryTargets.length === 1 && !usingManualSource) {
      await selectOfficialTarget(recoveryTargets[0]);
      return;
    }

    if (workspaceState.recovery.target !== null) {
      store.setRecoveryTarget(null);
    }

    if (workspaceState.recovery.source?.kind === "official_bootloader") {
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

  if (workspaceState.recovery.source?.kind === "local_apj_bytes" || workspaceState.recovery.source?.kind === "local_bin_bytes") {
    if (workspaceState.recovery.source.kind !== nextKind) {
      store.setRecoverySource(null, null);
    }
  }
}

function recoveryStateLabel() {
  if (isRecoveryCancelling) {
    return "cancelling";
  }

  if (isRecoveryActive) {
    return `active:${workspaceState.sessionPhase ?? "running"}`;
  }

  if (usingOfficialSource) {
    return "official-ready";
  }

  if (usingManualSource) {
    return "manual-armed";
  }

  return workspaceState.recovery.scanPhase;
}

let selectedTargetKey = $derived(workspaceState.recovery.target ? targetKey(workspaceState.recovery.target) : "");
let manualPanelOpen = $derived(advancedRequestedOpen || usingManualSource || Boolean(workspaceState.recovery.sourceError));
let recoverySourceState = $derived.by(() => {
  const metadata = workspaceState.recovery.sourceMetadata;
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

  if (workspaceState.recovery.scanPhase === "loading" && workspaceState.recovery.devices.length === 0) {
    return "Scanning for DFU devices. Keep the controller in DFU mode until it appears here.";
  }

  if (workspaceState.recovery.scanError) {
    return workspaceState.recovery.scanError;
  }

  if (workspaceState.recovery.devices.length === 0) {
    return "No DFU device is currently visible. Connect the controller in DFU mode and rescan.";
  }

  if (workspaceState.recovery.device === null) {
    return "More than one DFU device is visible. Choose the exact device explicitly before starting recovery.";
  }

  if (usingOfficialSource && workspaceState.recovery.target === null) {
    return recoveryTargets.length === 0
      ? "No official bootloader target is available right now. Retry the target list or use a validated manual recovery image."
      : "Choose the exact official bootloader target before starting recovery.";
  }

  if (workspaceState.recovery.source === null) {
    return "Choose an official bootloader target or supply a validated manual APJ/BIN image before starting recovery.";
  }

  if (workspaceState.recovery.sourceError) {
    return workspaceState.recovery.sourceError;
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
  && workspaceState.recovery.device !== null
  && workspaceState.recovery.source !== null
  && (!usingOfficialSource || workspaceState.recovery.target !== null)
  && (!usingManualSource || manualConfirmed)
  && dfuConfirmed,
);

const proseClass = "mt-[var(--space-3)] max-w-[60ch] text-[0.88rem] leading-[1.5] text-[var(--color-text-secondary)]";
const fieldLabelClass = "text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]";
const selectClass = "mt-[var(--space-2)] w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-input)] px-3 py-2 text-[0.86rem] text-[var(--color-text-primary)]";
const infoBlockClass = "mt-[var(--space-3)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-input)] px-3 py-2 text-[0.78rem] text-[var(--color-text-secondary)]";
const standaloneInfoBlockClass = `${infoBlockClass} text-[0.86rem]`;
const eyebrowClass = "m-0 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]";
const subtitleClass = "m-0 mt-1 text-[0.92rem] font-semibold text-[var(--color-text-primary)]";
const checkboxClass = "flex items-start gap-[var(--space-3)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-input)] p-3 text-[0.86rem] text-[var(--color-text-secondary)]";

onMount(() => {
  void loadRecoveryTargets();
});

$effect(() => {
  const currentSourceKey = workspaceState.recovery.source?.kind === "local_apj_bytes"
    ? `local_apj_bytes:${workspaceState.recovery.source.data.length}:${workspaceState.recovery.sourceMetadata?.digest ?? ""}`
    : workspaceState.recovery.source?.kind === "local_bin_bytes"
      ? `local_bin_bytes:${workspaceState.recovery.source.data.length}:${workspaceState.recovery.sourceMetadata?.digest ?? ""}`
      : workspaceState.recovery.source?.kind ?? "none";

  if (currentSourceKey === lastManualSourceKey) {
    return;
  }

  lastManualSourceKey = currentSourceKey;
  manualConfirmed = false;

  if (workspaceState.recovery.source?.kind === "local_apj_bytes" || workspaceState.recovery.source?.kind === "local_bin_bytes") {
    manualKind = workspaceState.recovery.source.kind;
  }
});
</script>

<Panel padded testId={firmwareWorkspaceTestIds.recoveryPanel}>
  <SectionHeader
    eyebrow="DFU recovery"
    title="Recover bootloader"
  >
    {#snippet actions()}
      <div data-testid={firmwareWorkspaceTestIds.recoveryState}>
        <StatusPill tone="warning">{recoveryStateLabel()}</StatusPill>
      </div>
    {/snippet}
  </SectionHeader>

  <p class={proseClass} data-testid={firmwareWorkspaceTestIds.recoveryGuidance}>
    This is a separate rescue path for boards that need bootloader recovery. Restore the bootloader here, then return to Install / Update and flash normal ArduPilot firmware over serial.
  </p>

  <div class="mt-[var(--space-3)] grid gap-[var(--space-3)] xl:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
    <Panel padded>
      <div class="grid gap-[var(--space-3)] md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <label class="flex flex-col">
          <span class={fieldLabelClass}>DFU device</span>
          <select
            class={selectClass}
            data-testid={firmwareWorkspaceTestIds.recoveryDeviceSelect}
            disabled={isRecoveryActive}
            onchange={(event) => store.setRecoveryDevice(
              workspaceState.recovery.devices.find((device) => device.unique_id === (event.currentTarget as HTMLSelectElement).value) ?? null,
            )}
            value={workspaceState.recovery.device?.unique_id ?? ""}
          >
            <option value="">Choose DFU device…</option>
            {#each workspaceState.recovery.devices as device (device.unique_id)}
              <option value={device.unique_id}>{deviceLabel(device)}</option>
            {/each}
          </select>
        </label>

        <Button
          testId={firmwareWorkspaceTestIds.recoveryDeviceRefresh}
          disabled={isRecoveryActive}
          onclick={() => void store.refreshRecoveryDevices()}
        >
          Rescan DFU
        </Button>
      </div>

      <div class={infoBlockClass} data-testid={firmwareWorkspaceTestIds.recoveryDeviceState}>
        <span class="font-semibold text-[var(--color-text-primary)]">Selected device</span>
        <p class="m-0 mt-[var(--space-1)]">{deviceLabel(workspaceState.recovery.device)} · {deviceDetail(workspaceState.recovery.device)}</p>
      </div>

      {#if workspaceState.recovery.scanError}
        <div class="mt-[var(--space-3)]">
          <Banner severity="danger" title={workspaceState.recovery.scanError} />
        </div>
      {/if}

      <div class="mt-[var(--space-3)]">
        <Panel padded tone="success">
          <div class="flex flex-wrap items-start justify-between gap-[var(--space-3)]">
            <div>
              <p class={eyebrowClass}>Official bootloader</p>
              <h4 class={subtitleClass}>Primary recovery source</h4>
            </div>
            {#if !usingOfficialSource && workspaceState.recovery.target}
              <Button
                size="sm"
                tone="success"
                testId={firmwareWorkspaceTestIds.recoveryOfficialAction}
                onclick={() => void selectOfficialTarget(workspaceState.recovery.target)}
              >
                Use official bootloader
              </Button>
            {/if}
          </div>

          <p class={proseClass}>
            Official bootloader recovery stays primary. It writes the known bootloader image for the selected target, then hands you back to Install / Update for the normal firmware flash.
          </p>

          <label class="mt-[var(--space-3)] block">
            <span class={fieldLabelClass}>Official target</span>
            <select
              class={selectClass}
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
            <div class="mt-[var(--space-3)]" data-testid={firmwareWorkspaceTestIds.recoveryTargetError}>
              <Banner
                severity="danger"
                title={targetError}
                actionLabel="Retry targets"
                onAction={() => void loadRecoveryTargets()}
                actionTestId={firmwareWorkspaceTestIds.recoveryTargetRetry}
              />
            </div>
          {/if}

          {#if targetPhase === "ready" && recoveryTargets.length === 0}
            <p
              class={standaloneInfoBlockClass}
              data-testid={firmwareWorkspaceTestIds.recoveryTargetEmpty}
            >
              No official bootloader targets are available right now. Retry the target list or supply a validated manual APJ/BIN image.
            </p>
          {/if}

          <div class={infoBlockClass} data-testid={firmwareWorkspaceTestIds.recoveryTargetState}>
            <span class="font-semibold text-[var(--color-text-primary)]">Active official target</span>
            <p class="m-0 mt-[var(--space-1)]">{targetLabel(workspaceState.recovery.target)} · {targetDetail(workspaceState.recovery.target)}</p>
          </div>
        </Panel>
      </div>
    </Panel>

    <Panel padded tone="warning">
      <div class="flex flex-wrap items-start justify-between gap-[var(--space-3)]">
        <div>
          <p class={eyebrowClass}>Advanced recovery</p>
          <h4 class={subtitleClass}>Manual APJ / BIN source</h4>
        </div>
        <Button
          size="sm"
          tone="warning"
          testId={firmwareWorkspaceTestIds.recoveryAdvancedToggle}
          onclick={() => (advancedRequestedOpen = !advancedRequestedOpen)}
        >
          {manualPanelOpen ? "Hide advanced" : "Show advanced"}
        </Button>
      </div>

      <p class={proseClass}>
        Use manual recovery only when you deliberately need to bypass the official bootloader catalog.
      </p>

      <div class={infoBlockClass} data-testid={firmwareWorkspaceTestIds.recoverySourceState}>
        <span class="font-semibold text-[var(--color-text-primary)]">Active recovery source</span>
        <p class="m-0 mt-[var(--space-1)]">{recoverySourceState}</p>
      </div>

      {#if manualPanelOpen}
        <div class="mt-[var(--space-3)] flex flex-col gap-[var(--space-3)]" data-testid={firmwareWorkspaceTestIds.recoveryManualPanel}>
          <div data-testid={firmwareWorkspaceTestIds.recoveryManualWarning}>
            <Banner
              severity="warning"
              title="Manual local files may replace bootloader contents or leave the board non-bootable if the wrong image is used. Keep this path for expert recovery only."
            />
          </div>

          <div class="grid gap-[var(--space-2)] sm:grid-cols-2">
            <Button
              tone={manualKind === "local_apj_bytes" ? "warning" : "neutral"}
              testId={firmwareWorkspaceTestIds.recoveryManualApj}
              onclick={() => setManualKind("local_apj_bytes")}
            >
              Use manual APJ
            </Button>
            <Button
              tone={manualKind === "local_bin_bytes" ? "warning" : "neutral"}
              testId={firmwareWorkspaceTestIds.recoveryManualBin}
              onclick={() => setManualKind("local_bin_bytes")}
            >
              Use manual BIN
            </Button>
          </div>

          <Button
            tone="warning"
            testId={firmwareWorkspaceTestIds.recoveryBrowse}
            disabled={isRecoveryActive}
            onclick={() => void handleManualBrowse()}
          >
            {manualKind === "local_apj_bytes" ? "Choose manual APJ" : "Choose manual BIN"}
          </Button>

          {#if workspaceState.recovery.sourceError}
            <div data-testid={firmwareWorkspaceTestIds.recoverySourceError}>
              <Banner severity="danger" title={workspaceState.recovery.sourceError} />
            </div>
          {/if}

          {#if usingManualSource}
            <label class={checkboxClass}>
              <input
                class="mt-1"
                checked={manualConfirmed}
                data-testid={firmwareWorkspaceTestIds.recoveryManualConfirm}
                onchange={(event) => (manualConfirmed = (event.currentTarget as HTMLInputElement).checked)}
                type="checkbox"
              />
              <span>
                <span class="font-semibold text-[var(--color-text-primary)]">Manual file confirmation</span><br />
                I confirm I am manually supplying the exact bootloader image for this board and understand that the wrong APJ/BIN can leave it non-bootable.
              </span>
            </label>
          {/if}
        </div>
      {/if}
    </Panel>
  </div>

  <Panel padded>
    <label class={`${checkboxClass} border-[color-mix(in_srgb,var(--color-warning)_35%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-warning)_8%,var(--color-bg-input))]`}>
      <input
        class="mt-1"
        checked={dfuConfirmed}
        data-testid={firmwareWorkspaceTestIds.recoverySafetyConfirm}
        onchange={(event) => (dfuConfirmed = (event.currentTarget as HTMLInputElement).checked)}
        type="checkbox"
      />
      <span>
        <span class="font-semibold text-[var(--color-text-primary)]">DFU safety acknowledgment</span><br />
        I understand that DFU bootloader recovery bypasses the normal serial safety flow and should only be used for explicit bootloader rescue.
      </span>
    </label>

    <div class={standaloneInfoBlockClass}>
      <p data-testid={firmwareWorkspaceTestIds.recoveryBlockedReason}>{recoveryBlockedReason}</p>
    </div>

    {#if isRecoveryActive}
      <div class="mt-[var(--space-3)] rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--color-warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] p-3 text-[0.86rem] text-[var(--color-text-primary)]">
        <p class="m-0 font-semibold">DFU recovery in progress</p>
        <p class="m-0 mt-1">{workspaceState.progress?.phase_label ?? workspaceState.sessionPhase ?? "working"}</p>
        {#if workspaceState.progress}
          <div class="mt-[var(--space-3)] h-2 overflow-hidden rounded-full bg-[var(--color-bg-primary)]" data-testid={firmwareWorkspaceTestIds.recoveryProgress}>
            <div class="h-full rounded-full bg-[var(--color-warning)] transition-[width] duration-200 ease-in-out" style={`width: ${Math.max(0, Math.min(100, workspaceState.progress.pct))}%`}></div>
          </div>
          <p class="m-0 mt-[var(--space-2)] text-[0.72rem] text-[var(--color-text-secondary)]">
            {workspaceState.progress.bytes_written} / {workspaceState.progress.bytes_total} bytes · {Math.round(workspaceState.progress.pct)}%
          </p>
        {/if}
      </div>
    {/if}

    <div class="mt-[var(--space-4)] flex flex-wrap gap-[var(--space-3)]">
      {#if isRecoveryActive && !isRecoveryCancelling}
        <Button
          tone="warning"
          testId={firmwareWorkspaceTestIds.cancelRecovery}
          onclick={() => void store.cancel()}
        >
          Cancel recovery
        </Button>
      {/if}

      <Button
        tone="warning"
        testId={firmwareWorkspaceTestIds.startRecovery}
        disabled={!canStartRecovery || isRecoveryActive || isRecoveryCancelling || replayReadonly}
        onclick={() => void store.startDfuRecovery()}
      >
        Start recovery
      </Button>
    </div>
  </Panel>
</Panel>
