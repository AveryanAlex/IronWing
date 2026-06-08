<script lang="ts">
import type { FirmwareWorkspaceState, FirmwareWorkspaceStore } from "../../../lib/stores/firmware-workspace";
import { EmptyState, Panel, Progress, SectionHeader, StatusPill } from "../../../components/ui";
import FirmwareOutcomePanel from "./FirmwareOutcomePanel.svelte";

type Props = {
  state: FirmwareWorkspaceState;
  store: FirmwareWorkspaceStore;
  split?: boolean;
};

let { state, store, split = false }: Props = $props();

function pathLabel() {
  if (state.activePath === "bootloader_installation") {
    return "Bootloader setup";
  }

  if (state.activePath === "firmware_install_update") {
    return "Flight firmware update";
  }

  if (state.lastCompletedOutcome?.path === "bootloader_installation") {
    return "Bootloader setup";
  }

  if (state.lastCompletedOutcome?.path === "firmware_install_update") {
    return "Flight firmware update";
  }

  return "No active operation";
}

let railClass = $derived(split ? "grid gap-4 xl:sticky xl:top-3 xl:self-start" : "grid gap-4");
let statusLabel = $derived(state.isActive ? `Running · ${state.sessionPhase ?? "working"}` : state.lastCompletedOutcome ? `Completed · ${state.sessionPhase ?? "result"}` : "Idle");
</script>

<aside class={railClass} aria-label="Firmware operation status">
  <Panel padded>
    <SectionHeader eyebrow="Operation" title="Progress and result">
      {#snippet actions()}
        <StatusPill tone={state.isActive ? "info" : state.lastCompletedOutcome ? "success" : "neutral"}>{statusLabel}</StatusPill>
      {/snippet}
    </SectionHeader>

    {#if state.isActive}
      <div class="mt-3 rounded-md border border-accent/35 bg-accent/10 p-3 text-sm text-text-primary">
        <p class="m-0 font-semibold">{pathLabel()}</p>
        <p class="m-0 mt-1">{state.progress?.phase_label ?? state.sessionPhase ?? "working"}</p>
        {#if state.progress}
          <Progress class="mt-3" value={state.progress.pct ?? undefined} variant={state.activePath === "bootloader_installation" ? "warning" : "accent"} />
          <p class="m-0 mt-2 text-xs text-text-secondary">
            {state.progress.bytes_written} / {state.progress.bytes_total} bytes{#if state.progress.pct != null} · {Math.round(state.progress.pct)}%{/if}
          </p>
        {/if}
      </div>
    {:else if state.lastCompletedOutcome}
      <p class="m-0 mt-3 text-sm text-text-secondary">Review the retained result below, then dismiss it when you are ready for the next firmware task.</p>
    {:else}
      <EmptyState class="mt-3" title="No firmware task running" description="Progress will stay visible here while install/update or DFU bootloader setup is active." />
    {/if}
  </Panel>

  <FirmwareOutcomePanel {state} {store} />
</aside>
