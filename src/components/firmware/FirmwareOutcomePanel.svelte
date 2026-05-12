<script lang="ts">
import type {
  FirmwareOutcome,
  SerialFlashOutcome,
} from "../../firmware";
import type { FirmwareWorkspaceStore, FirmwareWorkspaceState } from "../../lib/stores/firmware-workspace";
import { firmwareWorkspaceTestIds } from "./firmware-workspace-test-ids";
import { Banner, Button, Panel, SectionHeader, StatusPill } from "../ui";

type OutcomeTone = "success" | "warning" | "danger";
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

function summaryForOutcome(outcome: FirmwareOutcome) {
  if (outcome.path === "dfu_recovery") {
    switch (outcome.outcome.result) {
      case "verified":
        return {
          tone: "success" as OutcomeTone,
          label: "Recovery verified",
          summary: "Bootloader recovery completed. Return to Install / Update and flash normal ArduPilot firmware over serial.",
        };
      case "cancelled":
        return {
          tone: "warning" as OutcomeTone,
          label: "Recovery cancelled",
          summary: "DFU recovery was cancelled before completion.",
        };
      case "reset_unconfirmed":
        return {
          tone: "warning" as OutcomeTone,
          label: "Reset unconfirmed",
          summary: "DFU recovery completed, but device reset could not be confirmed. Reconnect or power-cycle the board before continuing.",
        };
      case "failed":
        return {
          tone: "danger" as OutcomeTone,
          label: "Recovery failed",
          summary: outcome.outcome.reason,
        };
      case "unsupported_recovery_path":
        return {
          tone: "warning" as OutcomeTone,
          label: "Recovery guidance",
          summary: outcome.outcome.guidance,
        };
    }
  }

  switch (outcome.outcome.result) {
    case "verified":
      return {
        tone: "success" as OutcomeTone,
        label: "Verified",
        summary: "Firmware flashed and verified successfully.",
      };
    case "flashed_but_unverified":
      return {
        tone: "warning" as OutcomeTone,
        label: "Written, verification unavailable",
        summary: "Firmware was written, but the bootloader could not verify flash contents.",
      };
    case "reconnect_verified":
      return {
        tone: (outcome.outcome.flash_verified ? "success" : "warning") as OutcomeTone,
        label: outcome.outcome.flash_verified ? "Reconnect verified" : "Reconnected without CRC proof",
        summary: outcome.outcome.flash_verified
          ? "The board reconnected after install and reported a verified flash."
          : "The board reconnected after install, but CRC verification was unavailable.",
      };
    case "reconnect_failed":
      return {
        tone: "warning" as OutcomeTone,
        label: "Reconnect failed",
        summary: `Firmware was written, but reconnect verification failed: ${outcome.outcome.reconnect_error}`,
      };
    case "cancelled":
      return {
        tone: "warning" as OutcomeTone,
        label: "Cancelled",
        summary: "Serial install was cancelled before completion.",
      };
    case "board_detection_failed":
      return {
        tone: "danger" as OutcomeTone,
        label: "Board detection failed",
        summary: outcome.outcome.reason,
      };
    case "extf_capacity_insufficient":
      return {
        tone: "danger" as OutcomeTone,
        label: "External flash capacity insufficient",
        summary: outcome.outcome.reason,
      };
    case "failed":
      return {
        tone: "danger" as OutcomeTone,
        label: "Failed",
        summary: outcome.outcome.reason,
      };
  }
}

function detailRows(outcome: FirmwareOutcome) {
  const rows: Array<{ label: string; value: string }> = [
    {
      label: "Path",
      value: outcome.path === "serial_primary" ? "Install / Update" : "DFU recovery",
    },
  ];

  if (outcome.path === "dfu_recovery") {
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
        rows.push({ label: "Next step", value: "Switch back to Install / Update and flash normal ArduPilot firmware over serial." });
        break;
      case "reset_unconfirmed":
        rows.push({ label: "Next step", value: "Reconnect or power-cycle the board, then continue with Install / Update." });
        break;
      case "failed":
        rows.push({ label: "Reason", value: recoveryOutcome.reason });
        break;
      case "unsupported_recovery_path":
        rows.push({ label: "Guidance", value: recoveryOutcome.guidance });
        break;
      case "cancelled":
        rows.push({ label: "Result", value: "operator cancelled before completion" });
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

  const serialOutcome = outcome.outcome as SerialFlashOutcome;

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
        { label: "Reconnect error", value: serialOutcome.reconnect_error },
      );
      break;
    case "failed":
    case "board_detection_failed":
    case "extf_capacity_insufficient":
      rows.push({ label: "Reason", value: serialOutcome.reason });
      break;
    case "cancelled":
      rows.push({ label: "Result", value: "operator cancelled before completion" });
      break;
  }

  return rows;
}

let activeOutcome = $derived(state.lastCompletedOutcome);
let outcomeCopy = $derived(activeOutcome ? summaryForOutcome(activeOutcome) : null);
let rows = $derived(activeOutcome ? detailRows(activeOutcome) : []);
let sessionStateLabel = $derived(state.isActive
  ? `active:${state.sessionPhase ?? "running"}`
  : activeOutcome
    ? `completed:${activeOutcome.outcome.result}`
    : "idle");
let bannerSeverity = $derived<BannerSeverity>(outcomeCopy?.tone ?? "warning");
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
    <div class="outcome-active">
      <p class="outcome-active__title">Live firmware session</p>
      <p class="outcome-active__detail">
        {state.progress?.phase_label ?? state.sessionPhase ?? "Working"}
        {#if state.progress}
          · {Math.round(state.progress.pct)}%
        {/if}
      </p>
    </div>
  {/if}

  {#if activeOutcome && outcomeCopy}
    <div class="outcome-stack">
      <Banner
        severity={bannerSeverity}
        title={outcomeCopy.label}
        message={outcomeCopy.summary}
        titleTestId={firmwareWorkspaceTestIds.outcomeResult}
        messageTestId={firmwareWorkspaceTestIds.outcomeSummary}
      />

      <dl class="outcome-detail-grid">
        {#each rows as row, index (`${row.label}-${row.value}`)}
          <div
            class="outcome-detail-tile"
            data-testid={`${firmwareWorkspaceTestIds.outcomeDetailPrefix}-${index}`}
          >
            <dt class="outcome-detail-tile__label">{row.label}</dt>
            <dd class="outcome-detail-tile__value">{row.value}</dd>
          </div>
        {/each}
      </dl>

      <Button
        testId={firmwareWorkspaceTestIds.outcomeDismiss}
        onclick={() => void store.dismissOutcome()}
      >
        Dismiss retained outcome
      </Button>
    </div>
  {:else}
    <p
      class="outcome-empty"
      data-testid={firmwareWorkspaceTestIds.outcomeEmpty}
    >
      No retained firmware outcome yet. Once install or recovery runs, the exact result facts stay visible here until you dismiss them.
    </p>
  {/if}
</Panel>

<style>
.outcome-active {
  margin-top: var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid color-mix(in srgb, var(--color-accent) 35%, transparent);
  background: color-mix(in srgb, var(--color-accent) 10%, transparent);
  padding: 12px 16px;
  font-size: 0.86rem;
  color: var(--color-text-primary);
}
.outcome-active__title {
  margin: 0;
  font-weight: 600;
}
.outcome-active__detail {
  margin: 4px 0 0;
}
.outcome-stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: var(--space-4);
}
.outcome-detail-grid {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
}
@media (min-width: 768px) {
  .outcome-detail-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
.outcome-detail-tile {
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-bg-input);
  padding: 12px;
  font-size: 0.86rem;
  color: var(--color-text-primary);
}
.outcome-detail-tile__label {
  margin: 0;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}
.outcome-detail-tile__value {
  margin: var(--space-1) 0 0;
  word-break: break-word;
}
.outcome-empty {
  margin-top: var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-bg-input);
  padding: 16px;
  font-size: 0.86rem;
  color: var(--color-text-secondary);
}
</style>
