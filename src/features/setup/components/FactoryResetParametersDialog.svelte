<script lang="ts">
import { RotateCcw, TriangleAlert } from "lucide-svelte";

import { Button, Checkbox, Dialog, HelperText } from "../../../components/ui";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";

let {
  disabled = false,
  busy = false,
  onConfirm,
}: {
  disabled?: boolean;
  busy?: boolean;
  onConfirm: () => Promise<void>;
} = $props();

let open = $state(false);
let acknowledged = $state(false);

function handleOpenChange(nextOpen: boolean) {
  if (busy) {
    return;
  }

  open = nextOpen;
  if (!nextOpen) {
    acknowledged = false;
  }
}

async function confirmFactoryReset() {
  if (disabled || busy || !acknowledged) {
    return;
  }

  try {
    await onConfirm();
    open = false;
    acknowledged = false;
  } catch {
    // The caller reports the operation error. Keep the dialog open so the
    // operator can review the warning or retry without acknowledging again.
  }
}
</script>

<div class="border-t border-danger/20 pt-3">
  <Button
    aria-haspopup="dialog"
    class="w-full"
    disabled={disabled || busy}
    onclick={() => (open = true)}
    testId={setupWorkspaceTestIds.overviewFactoryReset}
    tone="danger"
    variant="soft"
  >
    <RotateCcw aria-hidden="true" size={16} />
    {busy ? "Resetting…" : "Factory reset parameters"}
  </Button>
  <HelperText class="mt-2" size="xs" tone="muted">
    Erases the vehicle configuration and reboots the flight controller.
  </HelperText>
</div>

<Dialog.Root {open} onOpenChange={handleOpenChange}>
  <Dialog.Content
    aria-label="Factory reset vehicle parameters"
    data-testid={setupWorkspaceTestIds.overviewFactoryResetDialog}
    showClose={false}
    size="sm"
  >
    <Dialog.Header>
      <div class="flex items-center gap-2 text-danger">
        <TriangleAlert aria-hidden="true" size={18} />
        <Dialog.Title>Factory reset vehicle parameters?</Dialog.Title>
      </div>
      <Dialog.Description>
        IronWing will set FORMAT_VERSION to 0 and reboot the flight controller. ArduPilot will erase the stored
        configuration and load firmware defaults during startup.
      </Dialog.Description>
    </Dialog.Header>

    <div class="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm leading-6 text-text-secondary">
      This removes airframe settings, calibrations, flight modes, radio setup, failsafes, and tuning. The vehicle must
      be configured and calibrated again before flight. Save a parameter file first if you may need to restore it.
    </div>

    <Checkbox
      checked={acknowledged}
      disabled={busy}
      label="I understand that all vehicle parameters and calibrations will be erased"
      onCheckedChange={(checked) => (acknowledged = checked)}
      testId={setupWorkspaceTestIds.overviewFactoryResetAcknowledge}
    />

    <Dialog.Footer>
      <Button disabled={busy} onclick={() => handleOpenChange(false)} variant="outline">Cancel</Button>
      <Button
        disabled={disabled || busy || !acknowledged}
        onclick={() => void confirmFactoryReset()}
        testId={setupWorkspaceTestIds.overviewFactoryResetConfirm}
        tone="danger"
        variant="solid"
      >
        <RotateCcw aria-hidden="true" class={busy ? "animate-spin" : undefined} size={14} />
        {busy ? "Resetting and rebooting…" : "Erase parameters and reboot"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
