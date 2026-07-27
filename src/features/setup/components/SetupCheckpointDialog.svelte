<script lang="ts">
import { LockKeyhole, RotateCcw, X } from "lucide-svelte";

import { Button, Dialog, Eyebrow } from "../../../components/ui";
import { notifySuccess } from "../../../lib/notifications";
import type { SetupWorkspaceCheckpointState } from "../../../lib/stores/setup-workspace";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";

let {
  checkpoint,
  onReset,
}: {
  checkpoint: SetupWorkspaceCheckpointState;
  onReset: () => void;
} = $props();

let open = $state(false);
let resetConfirmationOpen = $state(false);
let lastHandledCheckpointKey: string | null = null;

let blocksActions = $derived(checkpoint.blocksActions);
let dialogTitle = $derived(checkpoint.title ?? "Setup checkpoint");
let dialogDetail = $derived(
  checkpoint.detailText
    ?? "Dependent setup actions remain locked until the checkpoint is resolved.",
);

$effect(() => {
  const checkpointKey = [
    checkpoint.phase,
    checkpoint.scopeKey ?? "none",
    checkpoint.resumeRevision ?? "none",
    checkpoint.detailText ?? "none",
  ].join(":");

  if (checkpointKey === lastHandledCheckpointKey) {
    return;
  }

  lastHandledCheckpointKey = checkpointKey;
  resetConfirmationOpen = false;

  if (checkpoint.phase === "resume_pending" || checkpoint.phase === "scope_changed") {
    open = true;
    return;
  }

  if (checkpoint.phase === "resume_complete") {
    open = false;
    notifySuccess(checkpoint.title ?? "Setup resumed", {
      description: checkpoint.detailText ?? undefined,
      id: "setup-checkpoint-resumed",
    });
    onReset();
  }
});

function handleOpenChange(nextOpen: boolean) {
  open = nextOpen;
  if (!nextOpen) {
    resetConfirmationOpen = false;
  }
}

function confirmReset() {
  open = false;
  resetConfirmationOpen = false;
  onReset();
}
</script>

{#if blocksActions}
  <div class="pointer-events-none absolute right-3 top-3 z-30">
    <Button
      aria-haspopup="dialog"
      class="pointer-events-auto bg-bg-primary/95 px-3 text-xs font-semibold shadow-lg backdrop-blur hover:border-warning"
      onclick={() => (open = true)}
      shape="pill"
      size="lg"
      testId={setupWorkspaceTestIds.checkpointAffordance}
      tone="warning"
      variant="soft"
    >
      <LockKeyhole aria-hidden="true" size={14} />
      <span class="hidden sm:inline">Setup locked</span>
      <span class="sr-only sm:hidden">Setup locked</span>
    </Button>
  </div>
{/if}

<Dialog.Root {open} onOpenChange={handleOpenChange}>
  <Dialog.Content
    aria-label={dialogTitle}
    data-testid={setupWorkspaceTestIds.checkpoint}
    showClose={false}
    size="sm"
  >
    <Dialog.Header>
      <Eyebrow>Setup checkpoint</Eyebrow>
      <Dialog.Title data-testid={setupWorkspaceTestIds.checkpointTitle}>{dialogTitle}</Dialog.Title>
      <Dialog.Description data-testid={setupWorkspaceTestIds.checkpointDetail}>
        {dialogDetail}
      </Dialog.Description>
      <Dialog.Close
        ariaLabel="Close checkpoint details"
        class="absolute right-3 top-3 w-8 px-0"
        data-testid={setupWorkspaceTestIds.checkpointClose}
      >
        <X aria-hidden="true" size={16} />
      </Dialog.Close>
    </Dialog.Header>

    {#if checkpoint.phase === "scope_changed"}
      <p class="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm leading-6 text-text-secondary">
        Review the active vehicle and current parameter values before staging more setup changes.
      </p>
    {:else}
      <p class="rounded-lg border border-border bg-bg-primary/70 p-3 text-sm leading-6 text-text-secondary">
        Reboot and reconnect the same vehicle to unlock dependent actions automatically. You can close this dialog while waiting.
      </p>
    {/if}

    {#if resetConfirmationOpen}
      <div class="rounded-lg border border-danger/30 bg-danger/5 p-3">
        <p class="text-sm font-semibold text-text-primary">Reset this checkpoint?</p>
        <p class="mt-1 text-sm leading-6 text-text-secondary">
          This unlocks setup without confirming the expected reboot and reconnect. Verify the active vehicle and applied values first.
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
      <Dialog.Footer>
        <Button
          onclick={() => (open = false)}
          variant="outline"
        >
          Close
        </Button>
        <Button
          onclick={() => (resetConfirmationOpen = true)}
          testId={setupWorkspaceTestIds.checkpointReset}
          tone="danger"
          variant="soft"
        >
          <RotateCcw aria-hidden="true" size={14} />
          Reset checkpoint
        </Button>
      </Dialog.Footer>
    {/if}
  </Dialog.Content>
</Dialog.Root>
