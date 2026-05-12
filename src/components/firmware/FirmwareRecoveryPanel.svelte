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

  <p class="recovery-prose" data-testid={firmwareWorkspaceTestIds.recoveryGuidance}>
    This is a separate rescue path for boards that need bootloader recovery. Restore the bootloader here, then return to Install / Update and flash normal ArduPilot firmware over serial.
  </p>

  <div class="recovery-grid-main">
    <Panel padded>
      <div class="recovery-row recovery-row--device">
        <label class="recovery-field">
          <span class="recovery-field__label">DFU device</span>
          <select
            class="recovery-select"
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

      <div class="recovery-info-block" data-testid={firmwareWorkspaceTestIds.recoveryDeviceState}>
        <span class="recovery-info-block__title">Selected device</span>
        <p class="recovery-info-block__value">{deviceLabel(workspaceState.recovery.device)} · {deviceDetail(workspaceState.recovery.device)}</p>
      </div>

      {#if workspaceState.recovery.scanError}
        <div class="recovery-stack">
          <Banner severity="danger" title={workspaceState.recovery.scanError} />
        </div>
      {/if}

      <div class="recovery-stack">
        <Panel padded tone="success">
          <div class="recovery-row recovery-row--between">
            <div>
              <p class="recovery-eyebrow">Official bootloader</p>
              <h4 class="recovery-subtitle">Primary recovery source</h4>
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

          <p class="recovery-prose">
            Official bootloader recovery stays primary. It writes the known bootloader image for the selected target, then hands you back to Install / Update for the normal firmware flash.
          </p>

          <label class="recovery-field recovery-field--block">
            <span class="recovery-field__label">Official target</span>
            <select
              class="recovery-select"
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
            <div class="recovery-stack" data-testid={firmwareWorkspaceTestIds.recoveryTargetError}>
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
              class="recovery-info-block recovery-info-block--standalone"
              data-testid={firmwareWorkspaceTestIds.recoveryTargetEmpty}
            >
              No official bootloader targets are available right now. Retry the target list or supply a validated manual APJ/BIN image.
            </p>
          {/if}

          <div class="recovery-info-block" data-testid={firmwareWorkspaceTestIds.recoveryTargetState}>
            <span class="recovery-info-block__title">Active official target</span>
            <p class="recovery-info-block__value">{targetLabel(workspaceState.recovery.target)} · {targetDetail(workspaceState.recovery.target)}</p>
          </div>
        </Panel>
      </div>
    </Panel>

    <Panel padded tone="warning">
      <div class="recovery-row recovery-row--between">
        <div>
          <p class="recovery-eyebrow">Advanced recovery</p>
          <h4 class="recovery-subtitle">Manual APJ / BIN source</h4>
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

      <p class="recovery-prose">
        Use manual recovery only when you deliberately need to bypass the official bootloader catalog.
      </p>

      <div class="recovery-info-block" data-testid={firmwareWorkspaceTestIds.recoverySourceState}>
        <span class="recovery-info-block__title">Active recovery source</span>
        <p class="recovery-info-block__value">{recoverySourceState}</p>
      </div>

      {#if manualPanelOpen}
        <div class="recovery-manual" data-testid={firmwareWorkspaceTestIds.recoveryManualPanel}>
          <div data-testid={firmwareWorkspaceTestIds.recoveryManualWarning}>
            <Banner
              severity="warning"
              title="Manual local files may replace bootloader contents or leave the board non-bootable if the wrong image is used. Keep this path for expert recovery only."
            />
          </div>

          <div class="recovery-manual-kinds">
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
            <label class="recovery-checkbox">
              <input
                checked={manualConfirmed}
                data-testid={firmwareWorkspaceTestIds.recoveryManualConfirm}
                onchange={(event) => (manualConfirmed = (event.currentTarget as HTMLInputElement).checked)}
                type="checkbox"
              />
              <span>
                <span class="recovery-checkbox__title">Manual file confirmation</span><br />
                I confirm I am manually supplying the exact bootloader image for this board and understand that the wrong APJ/BIN can leave it non-bootable.
              </span>
            </label>
          {/if}
        </div>
      {/if}
    </Panel>
  </div>

  <Panel padded>
    <label class="recovery-checkbox recovery-checkbox--warning">
      <input
        checked={dfuConfirmed}
        data-testid={firmwareWorkspaceTestIds.recoverySafetyConfirm}
        onchange={(event) => (dfuConfirmed = (event.currentTarget as HTMLInputElement).checked)}
        type="checkbox"
      />
      <span>
        <span class="recovery-checkbox__title">DFU safety acknowledgment</span><br />
        I understand that DFU bootloader recovery bypasses the normal serial safety flow and should only be used for explicit bootloader rescue.
      </span>
    </label>

    <div class="recovery-info-block recovery-info-block--standalone">
      <p data-testid={firmwareWorkspaceTestIds.recoveryBlockedReason}>{recoveryBlockedReason}</p>
    </div>

    {#if isRecoveryActive}
      <div class="recovery-active">
        <p class="recovery-active__title">DFU recovery in progress</p>
        <p class="recovery-active__detail">{workspaceState.progress?.phase_label ?? workspaceState.sessionPhase ?? "working"}</p>
        {#if workspaceState.progress}
          <div class="recovery-progress" data-testid={firmwareWorkspaceTestIds.recoveryProgress}>
            <div class="recovery-progress__fill" style={`width: ${Math.max(0, Math.min(100, workspaceState.progress.pct))}%`}></div>
          </div>
          <p class="recovery-progress__caption">
            {workspaceState.progress.bytes_written} / {workspaceState.progress.bytes_total} bytes · {Math.round(workspaceState.progress.pct)}%
          </p>
        {/if}
      </div>
    {/if}

    <div class="recovery-actions">
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

<style>
.recovery-prose {
  margin: var(--space-3) 0 0;
  font-size: 0.88rem;
  line-height: 1.5;
  color: var(--color-text-secondary);
  max-width: 60ch;
}
.recovery-grid-main {
  display: grid;
  gap: var(--space-3);
  margin-top: var(--space-3);
}
@media (min-width: 1280px) {
  .recovery-grid-main {
    grid-template-columns: minmax(0, 1.1fr) minmax(18rem, 0.9fr);
  }
}
.recovery-stack {
  margin-top: var(--space-3);
}
.recovery-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}
.recovery-row--between {
  justify-content: space-between;
  align-items: flex-start;
}
.recovery-row--device {
  display: grid;
  gap: var(--space-3);
}
@media (min-width: 768px) {
  .recovery-row--device {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
  }
}
.recovery-field {
  display: flex;
  flex-direction: column;
}
.recovery-field--block {
  display: block;
  margin-top: var(--space-3);
}
.recovery-field__label {
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}
.recovery-select {
  margin-top: var(--space-2);
  width: 100%;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-bg-input);
  padding: 8px 12px;
  font-size: 0.86rem;
  color: var(--color-text-primary);
}
.recovery-info-block {
  margin-top: var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-bg-input);
  padding: 8px 12px;
  font-size: 0.78rem;
  color: var(--color-text-secondary);
}
.recovery-info-block--standalone {
  font-size: 0.86rem;
}
.recovery-info-block__title {
  font-weight: 600;
  color: var(--color-text-primary);
}
.recovery-info-block__value {
  margin: var(--space-1) 0 0;
}
.recovery-eyebrow {
  margin: 0;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}
.recovery-subtitle {
  margin: 4px 0 0;
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--color-text-primary);
}
.recovery-manual {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: var(--space-3);
}
.recovery-manual-kinds {
  display: grid;
  gap: var(--space-2);
}
@media (min-width: 640px) {
  .recovery-manual-kinds {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
.recovery-checkbox {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-bg-input);
  padding: 12px;
  font-size: 0.86rem;
  color: var(--color-text-secondary);
}
.recovery-checkbox--warning {
  border-color: color-mix(in srgb, var(--color-warning) 35%, var(--color-border));
  background: color-mix(in srgb, var(--color-warning) 8%, var(--color-bg-input));
}
.recovery-checkbox input {
  margin-top: 4px;
}
.recovery-checkbox__title {
  font-weight: 600;
  color: var(--color-text-primary);
}
.recovery-active {
  margin-top: var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid color-mix(in srgb, var(--color-warning) 35%, transparent);
  background: color-mix(in srgb, var(--color-warning) 10%, transparent);
  padding: 12px;
  font-size: 0.86rem;
  color: var(--color-text-primary);
}
.recovery-active__title {
  margin: 0;
  font-weight: 600;
}
.recovery-active__detail {
  margin: 4px 0 0;
}
.recovery-progress {
  margin-top: var(--space-3);
  height: 8px;
  border-radius: 999px;
  background: var(--color-bg-primary);
  overflow: hidden;
}
.recovery-progress__fill {
  height: 100%;
  border-radius: 999px;
  background: var(--color-warning);
  transition: width 0.2s ease;
}
.recovery-progress__caption {
  margin: var(--space-2) 0 0;
  font-size: 0.72rem;
  color: var(--color-text-secondary);
}
.recovery-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-top: var(--space-4);
}
</style>
