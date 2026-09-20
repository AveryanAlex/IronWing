<script lang="ts">
import { RotateCcw, RotateCw } from "lucide-svelte";

import { Button, Dialog, Eyebrow } from "../../../components/ui";
import { notifyUnknownError } from "../../../lib/notifications";
import type { SetupWorkspaceCheckpointState } from "../../../lib/stores/setup-workspace";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";

let {
  checkpoint,
  onReboot,
  onReset,
}: {
  checkpoint: SetupWorkspaceCheckpointState;
  onReboot: () => Promise<void>;
  onReset: () => Promise<void>;
} = $props();

let resetConfirmationOpen = $state(false);
let rebootPhase = $state<"idle" | "requesting">("idle");
let rebootNoticeOpen = $state(false);

let checkpointActive = $derived(checkpoint.phase === "reboot_required" && checkpoint.blocksActions);
let rebooting = $derived(rebootPhase === "requesting");
let dialogOpen = $derived(checkpointActive || rebootNoticeOpen);
let dialogTitle = $derived(rebootNoticeOpen ? "Reboot command accepted" : (checkpoint.title ?? "Reboot required"));
let dialogDetail = $derived(
  rebootNoticeOpen
    ? "Wait for the vehicle to restart, reconnect it, then download parameters again."
    : (checkpoint.detailText ?? "Reboot the vehicle before continuing setup."),
);

function handleOpenChange(nextOpen: boolean) {
  if (!nextOpen) {
    rebootNoticeOpen = false;
    resetConfirmationOpen = false;
  }
}

async function requestReboot() {
  if (!checkpointActive || rebooting) {
    return;
  }

  rebootPhase = "requesting";
  try {
    await onReboot();
    rebootNoticeOpen = true;
    resetConfirmationOpen = false;
    await onReset();
  } catch (error) {
    notifyUnknownError("Vehicle reboot failed", error, {
      id: "setup-checkpoint-reboot-failed",
    });
  } finally {
    rebootPhase = "idle";
  }
}

async function confirmReset() {
  resetConfirmationOpen = false;
  rebootNoticeOpen = false;
  try {
    await onReset();
  } catch (error) {
    notifyUnknownError("Checkpoint reset failed", error, {
      id: "setup-checkpoint-reset-failed",
    });
  }
}
</script>

<Dialog.Root open={dialogOpen} onOpenChange={handleOpenChange}>
  <Dialog.Content
    aria-label={dialogTitle}
    data-testid={setupWorkspaceTestIds.checkpoint}
    escapeKeydownBehavior={checkpointActive ? "ignore" : "close"}
    interactOutsideBehavior={checkpointActive ? "ignore" : "close"}
    showClose={false}
    size="sm"
  >
    <Dialog.Header>
      <Eyebrow>{rebootNoticeOpen ? "Vehicle reboot" : "Setup checkpoint"}</Eyebrow>
      <Dialog.Title data-testid={setupWorkspaceTestIds.checkpointTitle}>{dialogTitle}</Dialog.Title>
      <Dialog.Description data-testid={setupWorkspaceTestIds.checkpointDetail}>
        {dialogDetail}
      </Dialog.Description>
    </Dialog.Header>

    {#if rebootNoticeOpen}
      <p class="rounded-lg border border-border bg-bg-primary/70 p-3 text-sm leading-6 text-text-secondary">
        Use the connection panel to reconnect the vehicle. Setup will ask you to download a fresh parameter list before its editors become available again.
      </p>
      <Dialog.Footer>
        <Button
          onclick={() => (rebootNoticeOpen = false)}
          testId={setupWorkspaceTestIds.checkpointAcknowledge}
          variant="solid"
        >
          Got it
        </Button>
      </Dialog.Footer>
    {:else if resetConfirmationOpen}
      <div class="rounded-lg border border-danger/30 bg-danger/5 p-3">
        <p class="text-sm font-semibold text-text-primary">Reset this checkpoint?</p>
        <p class="mt-1 text-sm leading-6 text-text-secondary">
          This unlocks setup without rebooting the vehicle. Verify the active vehicle and applied values first.
        </p>
      </div>
      <Dialog.Footer>
        <Button
          onclick={() => (resetConfirmationOpen = false)}
          testId={setupWorkspaceTestIds.checkpointCancelReset}
          variant="outline"
        >
          Keep checkpoint
        </Button>
        <Button
          onclick={confirmReset}
          testId={setupWorkspaceTestIds.checkpointConfirmReset}
          tone="danger"
          variant="solid"
        >
          Reset and unlock
        </Button>
      </Dialog.Footer>
    {:else}
      <p class="rounded-lg border border-border bg-bg-primary/70 p-3 text-sm leading-6 text-text-secondary">
        IronWing will disconnect the current session after the vehicle accepts the reboot command. Reconnect manually after the vehicle finishes restarting.
      </p>
      <Dialog.Footer>
        <Button
          disabled={rebooting}
          onclick={() => (resetConfirmationOpen = true)}
          testId={setupWorkspaceTestIds.checkpointReset}
          tone="danger"
          variant="soft"
        >
          <RotateCcw aria-hidden="true" size={14} />
          Reset checkpoint
        </Button>
        <Button
          disabled={rebooting}
          onclick={() => void requestReboot()}
          testId={setupWorkspaceTestIds.checkpointReboot}
          tone="success"
          variant="solid"
        >
          <RotateCw aria-hidden="true" class={rebooting ? "animate-spin" : undefined} size={14} />
          {rebooting ? "Rebooting…" : "Reboot vehicle"}
        </Button>
      </Dialog.Footer>
    {/if}
  </Dialog.Content>
</Dialog.Root>
