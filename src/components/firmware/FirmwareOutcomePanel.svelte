<script lang="ts">
import type {
  FirmwareOutcome,
  SerialFlashOutcome,
} from "../../firmware";
import type { FirmwareWorkspaceStore, FirmwareWorkspaceState } from "../../lib/stores/firmware-workspace";
import { firmwareWorkspaceTestIds } from "./firmware-workspace-test-ids";

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
          tone: "success",
          label: "Recovery verified",
          summary: "Bootloader recovery completed. Return to Install / Update and flash normal ArduPilot firmware over serial.",
        } as const;
      case "cancelled":
        return {
          tone: "warning",
          label: "Recovery cancelled",
          summary: "DFU recovery was cancelled before completion.",
        } as const;
      case "reset_unconfirmed":
        return {
          tone: "warning",
          label: "Reset unconfirmed",
          summary: "DFU recovery completed, but device reset could not be confirmed. Reconnect or power-cycle the board before continuing.",
        } as const;
      case "failed":
        return {
          tone: "danger",
          label: "Recovery failed",
          summary: outcome.outcome.reason,
        } as const;
      case "unsupported_recovery_path":
        return {
          tone: "warning",
          label: "Recovery guidance",
          summary: outcome.outcome.guidance,
        } as const;
    }
  }

  switch (outcome.outcome.result) {
    case "verified":
      return {
        tone: "success",
        label: "Verified",
        summary: "Firmware flashed and verified successfully.",
      } as const;
    case "flashed_but_unverified":
      return {
        tone: "warning",
        label: "Written, verification unavailable",
        summary: "Firmware was written, but the bootloader could not verify flash contents.",
      } as const;
    case "reconnect_verified":
      return {
        tone: outcome.outcome.flash_verified ? "success" : "warning",
        label: outcome.outcome.flash_verified ? "Reconnect verified" : "Reconnected without CRC proof",
        summary: outcome.outcome.flash_verified
          ? "The board reconnected after install and reported a verified flash."
          : "The board reconnected after install, but CRC verification was unavailable.",
      } as const;
    case "reconnect_failed":
      return {
        tone: "warning",
        label: "Reconnect failed",
        summary: `Firmware was written, but reconnect verification failed: ${outcome.outcome.reconnect_error}`,
      } as const;
    case "cancelled":
      return {
        tone: "warning",
        label: "Cancelled",
        summary: "Serial install was cancelled before completion.",
      } as const;
    case "board_detection_failed":
      return {
        tone: "danger",
        label: "Board detection failed",
        summary: outcome.outcome.reason,
      } as const;
    case "extf_capacity_insufficient":
      return {
        tone: "danger",
        label: "External flash capacity insufficient",
        summary: outcome.outcome.reason,
      } as const;
    case "failed":
      return {
        tone: "danger",
        label: "Failed",
        summary: outcome.outcome.reason,
      } as const;
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

function toneClass(tone: ReturnType<typeof summaryForOutcome>["tone"]) {
  switch (tone) {
    case "success":
      return "border-success/30 bg-success/10 text-success";
    case "danger":
      return "border-danger/40 bg-danger/10 text-danger";
    case "warning":
    default:
      return "border-warning/40 bg-warning/10 text-warning";
  }
}

let activeOutcome = $derived(state.lastCompletedOutcome);
let outcomeCopy = $derived(activeOutcome ? summaryForOutcome(activeOutcome) : null);
let rows = $derived(activeOutcome ? detailRows(activeOutcome) : []);
let sessionStateLabel = $derived(state.isActive
  ? `active:${state.sessionPhase ?? "running"}`
  : activeOutcome
    ? `completed:${activeOutcome.outcome.result}`
    : "idle");
</script>

<section
  class="rounded-lg border border-border bg-bg-secondary/30 p-3"
  data-testid={firmwareWorkspaceTestIds.outcomePanel}
>
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Outcome register</p>
      <h3 class="mt-2 text-lg font-semibold text-text-primary">Retained result details</h3>
      <p class="mt-2 max-w-3xl text-sm leading-relaxed text-text-secondary">
        Success, cancel, and failure facts stay visible here instead of collapsing into a transient toast.
      </p>
    </div>

    <div
      class="rounded-full border border-border bg-bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary"
      data-testid={firmwareWorkspaceTestIds.outcomeState}
    >
      {sessionStateLabel}
    </div>
  </div>

  {#if state.isActive}
    <div class="mt-4 rounded-lg border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-text-primary">
      <p class="font-semibold">Live firmware session</p>
      <p class="mt-1">
        {state.progress?.phase_label ?? state.sessionPhase ?? "Working"}
        {#if state.progress}
          · {Math.round(state.progress.pct)}%
        {/if}
      </p>
    </div>
  {/if}

  {#if activeOutcome && outcomeCopy}
    <article class={`mt-4 rounded-lg border px-4 py-4 ${toneClass(outcomeCopy.tone)}`}>
      <p class="text-xs font-semibold uppercase tracking-[0.16em]" data-testid={firmwareWorkspaceTestIds.outcomeResult}>
        {outcomeCopy.label}
      </p>
      <p class="mt-2 text-sm leading-relaxed" data-testid={firmwareWorkspaceTestIds.outcomeSummary}>
        {outcomeCopy.summary}
      </p>

      <dl class="mt-4 grid gap-3 md:grid-cols-2">
        {#each rows as row, index (`${row.label}-${row.value}`)}
          <div
            class="rounded-xl border border-current/20 bg-bg-primary/80 px-3 py-3 text-sm text-text-primary"
            data-testid={`${firmwareWorkspaceTestIds.outcomeDetailPrefix}-${index}`}
          >
            <dt class="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">{row.label}</dt>
            <dd class="mt-1 break-words">{row.value}</dd>
          </div>
        {/each}
      </dl>

      <button
        class="mt-4 rounded-xl border border-current/20 bg-bg-primary px-4 py-2 text-sm font-semibold transition hover:brightness-105"
        data-testid={firmwareWorkspaceTestIds.outcomeDismiss}
        onclick={() => void store.dismissOutcome()}
        type="button"
      >
        Dismiss retained outcome
      </button>
    </article>
  {:else}
    <div
      class="mt-4 rounded-lg border border-border bg-bg-primary px-4 py-4 text-sm text-text-secondary"
      data-testid={firmwareWorkspaceTestIds.outcomeEmpty}
    >
      No retained firmware outcome yet. Once install or recovery runs, the exact result facts stay visible here until you dismiss them.
    </div>
  {/if}
</section>
