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

function summaryForOutcome(outcome: FirmwareOutcome) {
  if (outcome.path !== "serial_primary") {
    return {
      tone: "warning",
      label: "DFU outcome retained",
      summary: "A DFU recovery outcome is currently retained. This serial workspace keeps it visible until you dismiss it.",
    } as const;
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

function detailRows(outcome: FirmwareOutcome, sourceLabel: string | null) {
  const rows: Array<{ label: string; value: string }> = [
    {
      label: "Path",
      value: outcome.path === "serial_primary" ? "Install / Update" : "DFU recovery",
    },
  ];

  if (sourceLabel) {
    rows.push({
      label: "Source",
      value: sourceLabel,
    });
  }

  if (outcome.path !== "serial_primary") {
    if (outcome.outcome.result === "unsupported_recovery_path") {
      rows.push({ label: "Guidance", value: outcome.outcome.guidance });
    }
    return rows;
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
let sourceLabel = $derived(state.serial.sourceMetadata?.label ?? null);
let outcomeCopy = $derived(activeOutcome ? summaryForOutcome(activeOutcome) : null);
let rows = $derived(activeOutcome ? detailRows(activeOutcome, sourceLabel) : []);
let sessionStateLabel = $derived(state.isActive
  ? `active:${state.sessionPhase ?? "running"}`
  : activeOutcome
    ? `completed:${activeOutcome.outcome.result}`
    : "idle");
</script>

<section
  class="rounded-[24px] border border-border bg-bg-secondary/30 p-4"
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
    <div class="mt-4 rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-text-primary">
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
    <article class={`mt-4 rounded-2xl border px-4 py-4 ${toneClass(outcomeCopy.tone)}`}>
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
      class="mt-4 rounded-2xl border border-border bg-bg-primary px-4 py-4 text-sm text-text-secondary"
      data-testid={firmwareWorkspaceTestIds.outcomeEmpty}
    >
      No retained firmware outcome yet. Once install runs, the exact result facts stay visible here until you dismiss them.
    </div>
  {/if}
</section>
