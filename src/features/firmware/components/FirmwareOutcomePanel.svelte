<script lang="ts">
import { get } from "svelte/store";

import type {
  FirmwareInstallUpdateOutcome,
  FirmwareOutcome,
} from "../../../firmware";
import { notifyError } from "../../../lib/notifications";
import type { FirmwareWorkspaceStore, FirmwareWorkspaceState } from "../../../lib/stores/firmware-workspace";
import { firmwareOutcomeCopy } from "../firmware-outcome-copy";
import { firmwareWorkspaceTestIds } from "../firmware-workspace-test-ids";
import { Banner, Button, EmptyState, FactTile, InfoBlock, Panel, SectionHeader, StatusPill } from "../../../components/ui";

type BannerSeverity = "success" | "warning" | "danger";

type Props = {
  state: FirmwareWorkspaceState;
  store: FirmwareWorkspaceStore;
};

let {
  state,
  store,
}: Props = $props();

function recoveryDeviceLabel() {
  if (!state.recovery.device) {
    return null;
  }

  return [
    state.recovery.device.product,
    state.recovery.device.serial_number,
    state.recovery.device.unique_id,
  ].filter((value): value is string => Boolean(value)).join(" · ");
}

function recoveryTargetLabel() {
  if (!state.recovery.target) {
    return null;
  }

  return [
    state.recovery.target.brand_name ?? state.recovery.target.platform,
    state.recovery.target.brand_name && state.recovery.target.brand_name !== state.recovery.target.platform
      ? state.recovery.target.platform
      : null,
    `Board ID ${state.recovery.target.board_id}`,
  ].filter((value): value is string => Boolean(value)).join(" · ");
}

function detailRows(outcome: FirmwareOutcome) {
  const rows: Array<{ label: string; value: string }> = [
    {
      label: "Path",
      value: outcome.path === "firmware_install_update" ? "Firmware install/update" : "Bootloader installation",
    },
  ];

  if (outcome.path === "bootloader_installation") {
    const recoveryOutcome = outcome.outcome;
    const sourceLabel = state.recovery.sourceMetadata?.label ?? null;
    const targetLabel = recoveryTargetLabel();
    const deviceLabel = recoveryDeviceLabel();

    if (sourceLabel) {
      rows.push({ label: "Source", value: sourceLabel });
    }

    if (targetLabel) {
      rows.push({ label: "Target", value: targetLabel });
    }

    if (deviceLabel) {
      rows.push({ label: "Device", value: deviceLabel });
    }

    switch (recoveryOutcome.result) {
      case "verified":
        rows.push({ label: "Next step", value: "Switch back to firmware install/update and flash normal ArduPilot firmware over serial." });
        break;
      case "reset_unconfirmed":
        rows.push({ label: "Next step", value: "Reconnect or power-cycle the board, then continue with firmware install/update." });
        break;
      case "unsupported_bootloader_installation_path":
      case "failed":
      case "cancelled":
        break;
    }

    return rows;
  }

  if (state.serial.sourceMetadata?.label) {
    rows.push({
      label: "Source",
      value: state.serial.sourceMetadata.label,
    });
  }

  const serialOutcome = outcome.outcome as FirmwareInstallUpdateOutcome;

  switch (serialOutcome.result) {
    case "verified":
    case "flashed_but_unverified":
      rows.push(
        { label: "Board ID", value: String(serialOutcome.board_id) },
        { label: "Bootloader rev", value: String(serialOutcome.bootloader_rev) },
        { label: "Port", value: serialOutcome.port },
      );
      break;
    case "reconnect_verified":
      rows.push(
        { label: "Board ID", value: String(serialOutcome.board_id) },
        { label: "Bootloader rev", value: String(serialOutcome.bootloader_rev) },
        { label: "Flash verified", value: serialOutcome.flash_verified ? "yes" : "no" },
      );
      break;
    case "reconnect_failed":
      rows.push(
        { label: "Board ID", value: String(serialOutcome.board_id) },
        { label: "Bootloader rev", value: String(serialOutcome.bootloader_rev) },
        { label: "Flash verified", value: serialOutcome.flash_verified ? "yes" : "no" },
      );
      break;
    case "failed":
    case "board_detection_failed":
    case "extf_capacity_insufficient":
    case "cancelled":
      break;
  }

  return rows;
}

let activeOutcome = $derived(state.lastCompletedOutcome);
let outcomeCopy = $derived(activeOutcome ? firmwareOutcomeCopy(activeOutcome) : null);
let rows = $derived(activeOutcome ? detailRows(activeOutcome) : []);
let sessionStateLabel = $derived(state.isActive
  ? `active:${state.sessionPhase ?? "running"}`
  : activeOutcome
    ? `completed:${activeOutcome.outcome.result}`
    : "idle");
let bannerSeverity = $derived<BannerSeverity>(outcomeCopy?.tone ?? "warning");

async function dismissOutcome() {
  await store.dismissOutcome();
  const current = get(store);
  if (current.lastCompletedOutcome && current.lastError) {
    notifyError("Could not dismiss the firmware outcome", {
      id: "firmware-outcome-dismiss-error",
      description: current.lastError,
    });
  }
}

</script>

<Panel padded testId={firmwareWorkspaceTestIds.outcomePanel}>
  <SectionHeader title="Outcome">
    {#snippet actions()}
      <div data-testid={firmwareWorkspaceTestIds.outcomeState}>
        <StatusPill tone="neutral">{sessionStateLabel}</StatusPill>
      </div>
    {/snippet}
  </SectionHeader>

  {#if state.isActive}
    <InfoBlock class="mt-4" density="comfortable" title="Live firmware session" tone="info">
      <p class="m-0 mt-1">
        {state.progress?.phase_label ?? state.sessionPhase ?? "Working"}
        {#if state.progress?.pct != null}
          · {Math.round(state.progress.pct)}%
        {/if}
      </p>
    </InfoBlock>
  {/if}

  {#if activeOutcome && outcomeCopy}
    <div class="mt-4 flex flex-col gap-3">
      <Banner
        severity={bannerSeverity}
        title={outcomeCopy.label}
        message={outcomeCopy.summary}
        titleTestId={firmwareWorkspaceTestIds.outcomeResult}
        messageTestId={firmwareWorkspaceTestIds.outcomeSummary}
      />

      <dl class="m-0 grid gap-3 p-0 md:grid-cols-2">
        {#each rows as row, index (`${row.label}-${row.value}`)}
          <FactTile
            density="default"
            label={row.label}
            mono={false}
            value={row.value}
          />
        {/each}
      </dl>

      <Button
        testId={firmwareWorkspaceTestIds.outcomeDismiss}
        onclick={() => void dismissOutcome()}
      >
        Dismiss retained outcome
      </Button>
    </div>
  {:else}
    <EmptyState
      class="mt-4"
      description="Once firmware install/update or bootloader installation runs, the exact result facts stay visible here until you dismiss them."
      title="No retained firmware outcome yet."
      testId={firmwareWorkspaceTestIds.outcomeEmpty}
    />
  {/if}
</Panel>
