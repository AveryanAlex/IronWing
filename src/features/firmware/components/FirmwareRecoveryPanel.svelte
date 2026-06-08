<script lang="ts">
import { onMount } from "svelte";

import type {
  CatalogTargetSummary,
  DfuDeviceInfo,
} from "../../../firmware";
import type { FirmwareFileIo } from "../../../lib/firmware-file-io";
import type { FirmwareService } from "../../../lib/platform/firmware";
import {
  createLocalFileSourceMetadata,
  createOfficialBootloaderSourceMetadata,
  type FirmwareWorkspaceStore,
} from "../../../lib/stores/firmware-workspace";
import { sanitizeCatalogTargetSummaries } from "../firmware-target-filter";
import type { FirmwareWorkspaceLayout } from "../firmware-workspace-layout";
import { firmwareWorkspaceTestIds } from "../firmware-workspace-test-ids";
import FirmwareChecklist from "./FirmwareChecklist.svelte";
import {
  buildFirmwareRecoveryReviewChecklist,
  resolveFirmwareRecoveryStepStates,
} from "../firmware-recovery-flow";
import { Banner, Button, ButtonGroup, Checkbox, EmptyState, Eyebrow, HelperText, InfoBlock, NativeSelect, Panel, Progress, SelectableCard, StatusPill } from "../../../components/ui";

type CatalogLoadPhase = "idle" | "loading" | "ready" | "failed";
type ManualRecoveryKind = "local_apj_bytes" | "local_bin_bytes";
type RecoverySourceMode = "official" | "manual";

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
let isRecoveryActive = $derived(workspaceState.activePath === "bootloader_installation");
let isRecoveryCancelling = $derived(
  workspaceState.sessionStatus.kind === "cancelling" && workspaceState.sessionStatus.path === "bootloader_installation",
);
let usingManualSource = $derived(
  workspaceState.recovery.source?.kind === "local_apj_bytes" || workspaceState.recovery.source?.kind === "local_bin_bytes",
);
let usingOfficialSource = $derived(workspaceState.recovery.source?.kind === "official_bootloader");

let recoveryTargets = $state<CatalogTargetSummary[]>([]);
let targetPhase = $state<CatalogLoadPhase>("idle");
let targetError = $state<string | null>(null);
let targetRequest = 0;
let selectedRecoverySourceMode = $state<RecoverySourceMode>("official");
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
    return "If more than one DFU device is present, choose the exact bootloader target explicitly before installation starts.";
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

async function handleUseOfficialSource() {
  selectedRecoverySourceMode = "official";
  manualConfirmed = false;

  const target = workspaceState.recovery.target
    ?? (recoveryTargets.length === 1 ? recoveryTargets[0] : null);
  await selectOfficialTarget(target);
}

function handleUseManualSource() {
  selectedRecoverySourceMode = "manual";
  manualConfirmed = false;
  store.setBootloaderSourceError(null);

  if (workspaceState.recovery.source?.kind === "official_bootloader") {
    store.setBootloaderSource(null, null);
  }
}

async function selectOfficialTarget(target: CatalogTargetSummary | null) {
  store.setBootloaderTarget(target);

  if (!target) {
    store.setBootloaderSource(null, null);
    return;
  }

  store.setBootloaderSource(
    { kind: "official_bootloader", board_target: target.platform },
    createOfficialMetadata(target),
  );
}

async function loadRecoveryTargets() {
  const requestId = ++targetRequest;
  targetPhase = "loading";
  targetError = null;

  try {
    const rawTargets = await service.bootloaderCatalogTargets();
    if (requestId !== targetRequest) {
      return;
    }

    if (!Array.isArray(rawTargets)) {
      throw new Error("Bootloader catalog targets returned an unexpected payload.");
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
          store.setBootloaderTarget(matchedTarget);
      }
      return;
    }

    if (recoveryTargets.length === 1 && selectedRecoverySourceMode !== "manual" && !usingManualSource) {
      await selectOfficialTarget(recoveryTargets[0]);
      return;
    }

    if (workspaceState.recovery.target !== null) {
      store.setBootloaderTarget(null);
    }

    if (workspaceState.recovery.source?.kind === "official_bootloader") {
      store.setBootloaderSource(null, null);
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
  selectedRecoverySourceMode = "manual";

  try {
    const result = manualKind === "local_apj_bytes"
      ? await fileIo.pickApjFile()
      : await fileIo.pickBinFile();
    if (result.status === "cancelled") {
      return;
    }

    store.setBootloaderSource(
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
    store.setBootloaderSourceError(service.formatError(error));
  }
}

function setManualKind(nextKind: ManualRecoveryKind) {
  selectedRecoverySourceMode = "manual";
  manualKind = nextKind;
  manualConfirmed = false;
  store.setBootloaderSourceError(null);

  if (workspaceState.recovery.source?.kind === "local_apj_bytes" || workspaceState.recovery.source?.kind === "local_bin_bytes") {
    if (workspaceState.recovery.source.kind !== nextKind) {
      store.setBootloaderSource(null, null);
    }
  }
}

let selectedTargetKey = $derived(workspaceState.recovery.target ? targetKey(workspaceState.recovery.target) : "");
let effectiveRecoverySourceMode = $derived(usingManualSource ? "manual" : selectedRecoverySourceMode);
let recoverySourceState = $derived.by(() => {
  const metadata = workspaceState.recovery.sourceMetadata;
  if (!metadata) {
    if (effectiveRecoverySourceMode === "manual") {
      return manualKind === "local_apj_bytes" ? "manual-apj · no file loaded" : "manual-bin · no file loaded";
    }

    if (workspaceState.recovery.target === null) {
      return "official bootloader · choose target";
    }

    return "No bootloader installation source armed";
  }

  const detail = metadata.detail ? ` · ${metadata.detail}` : "";
  return `${metadata.kind} · ${metadata.label}${detail}`;
});
let recoveryBlockedReason = $derived.by(() => {
  if (!layout.actionsEnabled) {
      return layout.blockedDetail ?? "Bootloader installation is blocked on constrained layouts.";
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
      return "More than one DFU device is visible. Choose the exact device explicitly before installing the bootloader.";
  }

  if (effectiveRecoverySourceMode === "official" && workspaceState.recovery.target === null) {
    return recoveryTargets.length === 0
      ? "No primary recovery target is available right now. Retry the target list or choose a validated manual APJ/BIN bootloader image."
      : "Choose the exact official bootloader target before installation.";
  }

  if (workspaceState.recovery.source === null) {
    return effectiveRecoverySourceMode === "manual"
      ? "Choose a validated manual APJ/BIN bootloader image before installation."
      : "Choose the primary recovery target before installation.";
  }

  if (workspaceState.recovery.sourceError) {
    return workspaceState.recovery.sourceError;
  }

  if (usingManualSource && !manualConfirmed) {
    return "Manual APJ/BIN bootloader installation stays disabled until you confirm the supplied file is the exact bootloader image for this board.";
  }

  if (!dfuConfirmed) {
    return "Acknowledge the DFU safety warning before installing the bootloader.";
  }

  return "Ready to install the bootloader. After verification, return to firmware install/update and flash normal firmware over serial.";
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
let recoveryReviewChecklist = $derived(buildFirmwareRecoveryReviewChecklist({
  actionsEnabled: layout.actionsEnabled,
  layoutBlockedDetail: layout.blockedDetail,
  replayReadonly,
  deviceSelected: workspaceState.recovery.device !== null,
  devicesVisible: workspaceState.recovery.devices.length > 0,
  scanLoading: workspaceState.recovery.scanPhase === "loading",
  sourceMode: effectiveRecoverySourceMode,
  officialTargetSelected: workspaceState.recovery.target !== null,
  sourceSelected: workspaceState.recovery.source !== null,
  manualConfirmed,
  dfuConfirmed,
  blockedReason: recoveryBlockedReason,
}));
let recoveryStepStates = $derived(resolveFirmwareRecoveryStepStates({
  deviceSelected: workspaceState.recovery.device !== null,
  sourceMode: effectiveRecoverySourceMode,
  officialTargetSelected: workspaceState.recovery.target !== null,
  sourceSelected: workspaceState.recovery.source !== null,
  manualConfirmed,
  dfuConfirmed,
}));

const fieldLabelClass = "text-xs font-semibold uppercase tracking-wide text-text-muted";
const subtitleClass = "m-0 mt-1 text-sm font-semibold text-text-primary";
const checkboxClass = "flex items-start gap-3 rounded-md border border-border bg-bg-input p-3 text-sm text-text-secondary";

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
    selectedRecoverySourceMode = "manual";
    manualKind = workspaceState.recovery.source.kind;
  } else if (workspaceState.recovery.source?.kind === "official_bootloader") {
    selectedRecoverySourceMode = "official";
  }
});
</script>

<Panel padded testId={firmwareWorkspaceTestIds.recoveryPanel}>
  <div class="grid gap-3">
    <Panel padded tone={recoveryStepStates.device === "complete" ? "success" : "info"}>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Eyebrow>Step 1</Eyebrow>
          <h4 class={subtitleClass}>Connect board in DFU mode</h4>
          <HelperText class="mt-1 max-w-[60ch]">Hold the board's boot/DFU control as needed, connect USB, then rescan until the STM32 DFU device appears.</HelperText>
        </div>
        <StatusPill tone={recoveryStepStates.device === "complete" ? "success" : "info"}>{recoveryStepStates.device}</StatusPill>
      </div>

      <div class="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <label class="flex flex-col">
          <span class={fieldLabelClass}>DFU device</span>
          <NativeSelect
            class="mt-2"
            testId={firmwareWorkspaceTestIds.recoveryDeviceSelect}
            disabled={isRecoveryActive}
            onchange={(event) => store.setBootloaderDevice(
              workspaceState.recovery.devices.find((device) => device.unique_id === (event.currentTarget as HTMLSelectElement).value) ?? null,
            )}
            value={workspaceState.recovery.device?.unique_id ?? ""}
          >
            <option value="">Choose DFU device…</option>
            {#each workspaceState.recovery.devices as device (device.unique_id)}
              <option value={device.unique_id}>{deviceLabel(device)}</option>
            {/each}
          </NativeSelect>
        </label>

        <Button testId={firmwareWorkspaceTestIds.recoveryDeviceRefresh} disabled={isRecoveryActive} onclick={() => void store.refreshRecoveryDevices()}>
          Rescan DFU
        </Button>
      </div>

      <InfoBlock class="mt-3" testId={firmwareWorkspaceTestIds.recoveryDeviceState} title="Selected device">
        <p class="m-0 mt-1">{deviceLabel(workspaceState.recovery.device)} · {deviceDetail(workspaceState.recovery.device)}</p>
      </InfoBlock>

      {#if workspaceState.recovery.scanError}
        <div class="mt-3">
          <Banner severity="danger" title={workspaceState.recovery.scanError} />
        </div>
      {/if}
    </Panel>

    <Panel padded tone={recoveryStepStates.image === "complete" ? "success" : "info"}>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Eyebrow>Step 2</Eyebrow>
          <h4 class={subtitleClass}>Choose bootloader image</h4>
          <HelperText class="mt-1 max-w-[60ch]">Official bootloaders are the default. Manual APJ/BIN images are for custom boards or unsupported cases and require confirmation.</HelperText>
        </div>
        <StatusPill tone={recoveryStepStates.image === "complete" ? "success" : recoveryStepStates.image === "pending" ? "neutral" : "info"}>{recoveryStepStates.image}</StatusPill>
      </div>

      <div class="mt-3 grid gap-3">
        <div class="rounded-lg border border-border bg-bg-secondary p-1">
          <div class="grid gap-1 md:grid-cols-2">
            <SelectableCard density="compact" selected={effectiveRecoverySourceMode === "official"} testId={firmwareWorkspaceTestIds.recoveryOfficialAction} disabled={isRecoveryActive} onSelect={() => void handleUseOfficialSource()}>
              <span class="text-xs font-semibold uppercase tracking-wide text-text-muted">Recommended</span>
              <span class="mt-1 block text-sm font-semibold text-text-primary">Official bootloader</span>
              <span class="mt-1 block text-sm text-text-secondary">Install the known bootloader image for the selected official target.</span>
            </SelectableCard>

            <SelectableCard density="compact" selected={effectiveRecoverySourceMode === "manual"} testId={firmwareWorkspaceTestIds.recoveryAdvancedToggle} disabled={isRecoveryActive} onSelect={handleUseManualSource}>
              <span class="text-xs font-semibold uppercase tracking-wide text-text-muted">Advanced manual image</span>
              <span class="mt-1 block text-sm font-semibold text-text-primary">Manual APJ / BIN</span>
              <span class="mt-1 block text-sm text-text-secondary">Use only when deliberately bypassing the official bootloader catalog.</span>
            </SelectableCard>
          </div>
        </div>

        <InfoBlock testId={firmwareWorkspaceTestIds.recoverySourceState} title="Selected bootloader image">
          <p class="m-0 mt-1">{recoverySourceState}</p>
        </InfoBlock>

        {#if workspaceState.recovery.sourceError}
          <div data-testid={firmwareWorkspaceTestIds.recoverySourceError}>
            <Banner severity="danger" title={workspaceState.recovery.sourceError} />
          </div>
        {/if}

        {#if effectiveRecoverySourceMode === "official"}
          <Panel padded tone="success">
          <div>
            <Eyebrow>Official bootloader</Eyebrow>
            <h4 class={subtitleClass}>Choose official target</h4>
          </div>

          <HelperText class="mt-3 max-w-[60ch]">Official bootloader setup writes the known bootloader image for the selected target, then hands you back to firmware install/update for normal firmware.</HelperText>

          <label class="mt-3 block">
            <span class={fieldLabelClass}>Official target</span>
            <NativeSelect
              class="mt-2"
              testId={firmwareWorkspaceTestIds.recoveryTargetSelect}
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
            </NativeSelect>
          </label>

          {#if targetError}
            <div class="mt-3" data-testid={firmwareWorkspaceTestIds.recoveryTargetError}>
              <Banner severity="danger" title={targetError} actionLabel="Retry targets" onAction={() => void loadRecoveryTargets()} actionTestId={firmwareWorkspaceTestIds.recoveryTargetRetry} />
            </div>
          {/if}

          {#if targetPhase === "ready" && recoveryTargets.length === 0}
            <EmptyState class="mt-3" description="Retry the target list or switch to a validated manual bootloader APJ/BIN image." title="No official bootloader targets are available right now." testId={firmwareWorkspaceTestIds.recoveryTargetEmpty} />
          {/if}

          <InfoBlock class="mt-3" testId={firmwareWorkspaceTestIds.recoveryTargetState} title="Active official target">
            <p class="m-0 mt-1">{targetLabel(workspaceState.recovery.target)} · {targetDetail(workspaceState.recovery.target)}</p>
          </InfoBlock>
          </Panel>
        {:else}
          <Panel padded tone="warning" testId={firmwareWorkspaceTestIds.recoveryManualPanel}>
          <div>
            <Eyebrow>Advanced manual image</Eyebrow>
            <h4 class={subtitleClass}>Choose manual bootloader file</h4>
          </div>

          <HelperText class="mt-3 max-w-[60ch]">Use manual bootloader images only when you deliberately need to bypass the official bootloader catalog.</HelperText>

          <div class="mt-3" data-testid={firmwareWorkspaceTestIds.recoveryManualWarning}>
            <Banner severity="warning" title="Manual local files may replace bootloader contents or leave the board non-bootable if the wrong image is used. Keep this path for expert bootloader installation only." />
          </div>

          <div class="mt-3 flex flex-col gap-3">
            <ButtonGroup class="rounded-lg border border-border bg-bg-secondary p-1">
              <Button variant={manualKind === "local_apj_bytes" ? "outline" : "secondary"} testId={firmwareWorkspaceTestIds.recoveryManualApj} onclick={() => setManualKind("local_apj_bytes")}>Use manual APJ</Button>
              <Button variant={manualKind === "local_bin_bytes" ? "outline" : "secondary"} testId={firmwareWorkspaceTestIds.recoveryManualBin} onclick={() => setManualKind("local_bin_bytes")}>Use manual BIN</Button>
            </ButtonGroup>

            <Button variant="outline" testId={firmwareWorkspaceTestIds.recoveryBrowse} disabled={isRecoveryActive} onclick={() => void handleManualBrowse()}>
              {manualKind === "local_apj_bytes" ? "Choose manual APJ" : "Choose manual BIN"}
            </Button>

            {#if usingManualSource}
              <div class={checkboxClass}>
                <Checkbox checked={manualConfirmed} description="I confirm I am manually supplying the exact bootloader image for this board and understand that the wrong APJ/BIN can leave it non-bootable." label="Manual file confirmation" onCheckedChange={(checked) => (manualConfirmed = checked)} testId={firmwareWorkspaceTestIds.recoveryManualConfirm} />
              </div>
            {/if}
          </div>
          </Panel>
        {/if}
      </div>
    </Panel>

  <Panel padded>
    <div>
      <Eyebrow>Step 3</Eyebrow>
      <h4 class={subtitleClass}>Review bootloader setup</h4>
      <HelperText class="mt-1 max-w-[60ch]">This installs only the ArduPilot bootloader. After verification, reconnect the board and install flight firmware over serial.</HelperText>
    </div>

    <div class="mt-3">
      <FirmwareChecklist items={recoveryReviewChecklist} />
    </div>

    <div class={`${checkboxClass} mt-3 border-warning/35 bg-warning/10`}>
      <Checkbox
        checked={dfuConfirmed}
        description="I understand that DFU bootloader setup installs the bootloader only; normal flight firmware still needs to be installed afterward over serial."
        label="DFU setup acknowledgment"
        onCheckedChange={(checked) => (dfuConfirmed = checked)}
        testId={firmwareWorkspaceTestIds.recoverySafetyConfirm}
      />
    </div>

    <InfoBlock class="mt-3" size="sm">
      <p data-testid={firmwareWorkspaceTestIds.recoveryBlockedReason}>{recoveryBlockedReason}</p>
    </InfoBlock>

    {#if isRecoveryActive}
      <div class="mt-3 rounded-md border border-warning/35 bg-warning/10 p-3 text-sm text-text-primary">
        <p class="m-0 font-semibold">Bootloader setup in progress</p>
        <p class="m-0 mt-1">{workspaceState.progress?.phase_label ?? workspaceState.sessionPhase ?? "working"}</p>
        {#if workspaceState.progress}
          <Progress class="mt-3" value={workspaceState.progress.pct ?? undefined} variant="warning" testId={firmwareWorkspaceTestIds.recoveryProgress} />
          <p class="m-0 mt-2 text-xs text-text-secondary">{workspaceState.progress.bytes_written} / {workspaceState.progress.bytes_total} bytes{#if workspaceState.progress.pct != null} · {Math.round(workspaceState.progress.pct)}%{/if}</p>
        {/if}
      </div>
    {/if}

    <div class="mt-4 flex flex-wrap gap-3">
      {#if isRecoveryActive && !isRecoveryCancelling}
        <Button variant="outline" testId={firmwareWorkspaceTestIds.cancelRecovery} onclick={() => void store.cancel()}>Cancel bootloader setup</Button>
      {/if}

      <Button variant="default" testId={firmwareWorkspaceTestIds.startRecovery} disabled={!canStartRecovery || isRecoveryActive || isRecoveryCancelling || replayReadonly} onclick={() => void store.startBootloaderInstallation()}>
        Install bootloader
      </Button>
    </div>
  </Panel>
  </div>
</Panel>
