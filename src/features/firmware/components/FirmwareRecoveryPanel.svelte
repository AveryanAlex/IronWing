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
import { Banner, Button, ButtonGroup, Checkbox, EmptyState, Eyebrow, HelperText, InfoBlock, NativeSelect, Panel, Progress, SectionHeader, StatusPill } from "../../../components/ui";

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

    if (recoveryTargets.length === 1 && !usingManualSource) {
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
  manualKind = nextKind;
  manualConfirmed = false;
  store.setBootloaderSourceError(null);

  if (workspaceState.recovery.source?.kind === "local_apj_bytes" || workspaceState.recovery.source?.kind === "local_bin_bytes") {
    if (workspaceState.recovery.source.kind !== nextKind) {
      store.setBootloaderSource(null, null);
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

  if (usingOfficialSource && workspaceState.recovery.target === null) {
    return recoveryTargets.length === 0
      ? "No official bootloader target is available right now. Retry the target list or use a validated manual bootloader image."
      : "Choose the exact official bootloader target before installation.";
  }

  if (workspaceState.recovery.source === null) {
    return "Choose an official bootloader target or supply a validated manual APJ/BIN image before installation.";
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
    manualKind = workspaceState.recovery.source.kind;
  }
});
</script>

<Panel padded testId={firmwareWorkspaceTestIds.recoveryPanel}>
  <SectionHeader
    eyebrow="Bootloader installation"
    title="Install bootloader"
  >
    {#snippet actions()}
      <div data-testid={firmwareWorkspaceTestIds.recoveryState}>
        <StatusPill tone="warning">{recoveryStateLabel()}</StatusPill>
      </div>
    {/snippet}
  </SectionHeader>

  <HelperText class="mt-3 max-w-[60ch]" testId={firmwareWorkspaceTestIds.recoveryGuidance}>
    This is a separate native DFU path for boards that need bootloader installation. Install the bootloader here, then return to firmware install/update and flash normal ArduPilot firmware over serial.
  </HelperText>

  <div class="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
    <Panel padded>
      <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
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

        <Button
          testId={firmwareWorkspaceTestIds.recoveryDeviceRefresh}
          disabled={isRecoveryActive}
          onclick={() => void store.refreshRecoveryDevices()}
        >
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

      <div class="mt-3">
        <Panel padded tone="success">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Eyebrow>Official bootloader</Eyebrow>
              <h4 class={subtitleClass}>Primary recovery source</h4>
            </div>
            {#if !usingOfficialSource && workspaceState.recovery.target}
                <Button
                  size="sm"
                  variant="outline"
                testId={firmwareWorkspaceTestIds.recoveryOfficialAction}
                onclick={() => void selectOfficialTarget(workspaceState.recovery.target)}
              >
                Use official bootloader
              </Button>
            {/if}
          </div>

          <HelperText class="mt-3 max-w-[60ch]">
            Official bootloader installation stays primary. It writes the known bootloader image for the selected target, then hands you back to firmware install/update for normal firmware.
          </HelperText>

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
            <EmptyState
              class="mt-3"
              description="Retry the target list or supply a validated manual bootloader APJ/BIN image."
              title="No official bootloader targets are available right now."
              testId={firmwareWorkspaceTestIds.recoveryTargetEmpty}
            />
          {/if}

          <InfoBlock class="mt-3" testId={firmwareWorkspaceTestIds.recoveryTargetState} title="Active official target">
            <p class="m-0 mt-1">{targetLabel(workspaceState.recovery.target)} · {targetDetail(workspaceState.recovery.target)}</p>
          </InfoBlock>
        </Panel>
      </div>
    </Panel>

    <Panel padded tone="warning">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Eyebrow>Advanced recovery</Eyebrow>
          <h4 class={subtitleClass}>Manual APJ / BIN source</h4>
        </div>
          <Button
            size="sm"
            variant="outline"
          testId={firmwareWorkspaceTestIds.recoveryAdvancedToggle}
          onclick={() => (advancedRequestedOpen = !advancedRequestedOpen)}
        >
          {manualPanelOpen ? "Hide advanced" : "Show advanced"}
        </Button>
      </div>

      <HelperText class="mt-3 max-w-[60ch]">
        Use manual bootloader images only when you deliberately need to bypass the official bootloader catalog.
      </HelperText>

      <InfoBlock class="mt-3" testId={firmwareWorkspaceTestIds.recoverySourceState} title="Active recovery source">
        <p class="m-0 mt-1">{recoverySourceState}</p>
      </InfoBlock>

      {#if manualPanelOpen}
        <div class="mt-3 flex flex-col gap-3" data-testid={firmwareWorkspaceTestIds.recoveryManualPanel}>
          <div data-testid={firmwareWorkspaceTestIds.recoveryManualWarning}>
            <Banner
              severity="warning"
               title="Manual local files may replace bootloader contents or leave the board non-bootable if the wrong image is used. Keep this path for expert bootloader installation only."
            />
          </div>

          <ButtonGroup class="rounded-lg border border-border bg-bg-secondary p-1">
            <Button
              variant={manualKind === "local_apj_bytes" ? "outline" : "secondary"}
              testId={firmwareWorkspaceTestIds.recoveryManualApj}
              onclick={() => setManualKind("local_apj_bytes")}
            >
              Use manual APJ
            </Button>
            <Button
              variant={manualKind === "local_bin_bytes" ? "outline" : "secondary"}
              testId={firmwareWorkspaceTestIds.recoveryManualBin}
              onclick={() => setManualKind("local_bin_bytes")}
            >
              Use manual BIN
            </Button>
          </ButtonGroup>

          <Button
            variant="outline"
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
            <div class={checkboxClass}>
              <Checkbox
                checked={manualConfirmed}
                description="I confirm I am manually supplying the exact bootloader image for this board and understand that the wrong APJ/BIN can leave it non-bootable."
                label="Manual file confirmation"
                onCheckedChange={(checked) => (manualConfirmed = checked)}
                testId={firmwareWorkspaceTestIds.recoveryManualConfirm}
              />
            </div>
          {/if}
        </div>
      {/if}
    </Panel>
  </div>

  <Panel padded>
    <div class={`${checkboxClass} border-warning/35 bg-warning/10`}>
      <Checkbox
        checked={dfuConfirmed}
        description="I understand that DFU bootloader installation bypasses the normal serial safety flow and should only be used for explicit bootloader work."
        label="DFU safety acknowledgment"
        onCheckedChange={(checked) => (dfuConfirmed = checked)}
        testId={firmwareWorkspaceTestIds.recoverySafetyConfirm}
      />
    </div>

    <InfoBlock class="mt-3" size="sm">
      <p data-testid={firmwareWorkspaceTestIds.recoveryBlockedReason}>{recoveryBlockedReason}</p>
    </InfoBlock>

    {#if isRecoveryActive}
      <div class="mt-3 rounded-md border border-warning/35 bg-warning/10 p-3 text-sm text-text-primary">
        <p class="m-0 font-semibold">Bootloader installation in progress</p>
        <p class="m-0 mt-1">{workspaceState.progress?.phase_label ?? workspaceState.sessionPhase ?? "working"}</p>
        {#if workspaceState.progress}
          <Progress class="mt-3" value={workspaceState.progress.pct} variant="warning" testId={firmwareWorkspaceTestIds.recoveryProgress} />
          <p class="m-0 mt-2 text-xs text-text-secondary">
            {workspaceState.progress.bytes_written} / {workspaceState.progress.bytes_total} bytes · {Math.round(workspaceState.progress.pct)}%
          </p>
        {/if}
      </div>
    {/if}

    <div class="mt-4 flex flex-wrap gap-3">
      {#if isRecoveryActive && !isRecoveryCancelling}
        <Button
          variant="outline"
          testId={firmwareWorkspaceTestIds.cancelRecovery}
          onclick={() => void store.cancel()}
        >
          Cancel bootloader installation
        </Button>
      {/if}

      <Button
        variant="outline"
        testId={firmwareWorkspaceTestIds.startRecovery}
        disabled={!canStartRecovery || isRecoveryActive || isRecoveryCancelling || replayReadonly}
        onclick={() => void store.startBootloaderInstallation()}
      >
        Install bootloader
      </Button>
    </div>
  </Panel>
</Panel>
