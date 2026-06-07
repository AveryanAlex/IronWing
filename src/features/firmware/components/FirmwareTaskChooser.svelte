<script lang="ts">
import { SelectableCard } from "../../../components/ui";
import { firmwareWorkspaceTestIds } from "../firmware-workspace-test-ids";

type WorkspaceMode = "install" | "recovery";

type Props = {
  mode: WorkspaceMode;
  disabled?: boolean;
  onModeChange: (mode: WorkspaceMode) => void;
};

let { mode, disabled = false, onModeChange }: Props = $props();
</script>

<section class="rounded-lg border border-border bg-bg-secondary p-1" aria-label="Firmware task chooser">
  <div class="grid gap-1 md:grid-cols-2">
    <SelectableCard
      density="compact"
      selected={mode === "install"}
      testId={firmwareWorkspaceTestIds.modeInstall}
      disabled={disabled}
      onSelect={() => onModeChange("install")}
    >
      <span class="block text-sm font-semibold text-text-primary">Install or update flight firmware</span>
      <span class="mt-1 block text-sm text-text-secondary">Use when the controller already has a compatible bootloader. Recommended for normal ArduPilot updates.</span>
    </SelectableCard>

    <SelectableCard
      density="compact"
      selected={mode === "recovery"}
      testId={firmwareWorkspaceTestIds.modeRecovery}
      disabled={disabled}
      onSelect={() => onModeChange("recovery")}
    >
      <span class="block text-sm font-semibold text-text-primary">Set up bootloader with DFU</span>
      <span class="mt-1 block text-sm text-text-secondary">Use for first-time ArduPilot setup, migration from other firmware, or restoring a missing bootloader.</span>
    </SelectableCard>
  </div>
</section>
