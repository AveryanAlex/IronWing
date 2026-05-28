<script lang="ts">
import type { SetupWorkspaceCheckpointState } from "../../../lib/stores/setup-workspace";
import { Banner, Button } from "../../../components/ui";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";

let {
  checkpoint,
  onClear,
}: {
  checkpoint: SetupWorkspaceCheckpointState;
  onClear: () => void;
} = $props();

let severity = $derived.by<"success" | "warning" | "info">(() => {
  switch (checkpoint.phase) {
    case "resume_complete":
      return "success";
    case "scope_changed":
      return "warning";
    case "resume_pending":
      return "info";
    case "idle":
    default:
      return "info";
  }
});
</script>

{#if checkpoint.phase !== "idle"}
  <Banner
    class="mt-4"
    severity={severity}
    title={checkpoint.title ?? "Setup checkpoint"}
    message={checkpoint.detailText ?? undefined}
    testId={setupWorkspaceTestIds.checkpoint}
    titleTestId={setupWorkspaceTestIds.checkpointTitle}
    messageTestId={setupWorkspaceTestIds.checkpointDetail}
  >
    {#snippet action()}
      <Button
        variant="outline"
        class="border-current/30 bg-bg-primary/70"
        testId={setupWorkspaceTestIds.checkpointDismiss}
        onclick={onClear}
      >
        Dismiss checkpoint
      </Button>
    {/snippet}
  </Banner>
{/if}
