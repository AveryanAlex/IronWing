<script lang="ts">
import type { SetupWorkspaceCheckpointState } from "../../lib/stores/setup-workspace";
import { setupWorkspaceTestIds } from "./setup-workspace-test-ids";

let {
  checkpoint,
  onClear,
}: {
  checkpoint: SetupWorkspaceCheckpointState;
  onClear: () => void;
} = $props();

let tone = $derived.by(() => {
  switch (checkpoint.phase) {
    case "resume_complete":
      return "border-success/30 bg-success/10 text-success";
    case "scope_changed":
      return "border-warning/40 bg-warning/10 text-warning";
    case "resume_pending":
      return "border-accent/40 bg-accent/10 text-accent";
    case "idle":
    default:
      return "border-border bg-bg-secondary text-text-secondary";
  }
});
</script>

{#if checkpoint.phase !== "idle"}
  <div class={`mt-4 rounded-lg border px-4 py-4 ${tone}`} data-testid={setupWorkspaceTestIds.checkpoint}>
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.18em]" data-testid={setupWorkspaceTestIds.checkpointTitle}>
          {checkpoint.title ?? "Setup checkpoint"}
        </p>
        {#if checkpoint.detailText}
          <p class="mt-2 max-w-3xl text-sm leading-6" data-testid={setupWorkspaceTestIds.checkpointDetail}>
            {checkpoint.detailText}
          </p>
        {/if}
      </div>

      <button
        class="rounded-md border border-current/30 bg-bg-primary/70 px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
        data-testid={setupWorkspaceTestIds.checkpointDismiss}
        onclick={onClear}
        type="button"
      >
        Dismiss checkpoint
      </button>
    </div>
  </div>
{/if}
